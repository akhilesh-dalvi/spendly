import type { Command } from "commander";
import type { z } from "zod";
import {
	type BackendCommandContext,
	createBackendCommandContext,
} from "../client/convex-client.js";
import { parseDate, resolveCommandDate } from "../domain/dates.js";
import {
	accountSchema,
	accountTypeSchema,
	categorySchema,
	contextSchema,
	cycleSchema,
	expensePageSchema,
	expenseSchema,
	summarySchema,
	tagSchema,
	transactionPageSchema,
} from "../domain/read-schemas.js";
import { resolveExactName, resolveIdOrExactName } from "../domain/selectors.js";
import { CliError } from "../errors.js";
import { PromptCancelledError } from "../input/types.js";
import { resolveGlobalOptions } from "../options.js";
import {
	renderHumanLines,
	resolveHumanRenderOptions,
} from "../output/human.js";
import { writeSuccess } from "../output/index.js";
import {
	type ActiveFilterLabels,
	buildContinuationCommand,
	renderActiveFilters,
	renderPaginationFooter,
} from "../output/pagination.js";
import { startBackendProgress } from "../output/progress.js";
import {
	renderAccount,
	renderAccounts,
	renderAccountTypes,
	renderCategories,
	renderContext,
	renderCycle,
	renderCycles,
	renderExpense,
	renderExpenses,
	renderSummary,
	renderTags,
	renderTransactions,
} from "../output/read-terminal.js";
import type { CliRuntime } from "../runtime.js";
import {
	getPrompter,
	promptDate,
	requirePrompter,
	selectAccount,
	selectCycle,
	selectExpenseId,
	selectTags,
} from "./interactive-support.js";

const DEFAULT_PAGE_SIZE = 50;
const MAXIMUM_PAGE_SIZE = 100;
const POSITIVE_INTEGER_PATTERN = /^\d+$/u;

interface ExpenseListOptions {
	account?: string;
	accountId?: string;
	category?: string;
	categoryId?: string;
	cursor?: string;
	cycle?: string;
	cycleId?: string;
	from?: string;
	limit?: string;
	tag?: string[];
	tagId?: string[];
	to?: string;
	unassigned?: boolean;
	uncategorized?: boolean;
}

type ExpensePage = z.infer<typeof expensePageSchema>;

interface CycleSelectorOptions {
	cycle?: string;
	cycleId?: string;
}

interface PageOptions {
	cursor?: string;
	limit?: string;
}

const parseLimit = (value: string | undefined): number | undefined => {
	if (value === undefined) {
		return undefined;
	}
	if (!POSITIVE_INTEGER_PATTERN.test(value)) {
		throw new CliError("INVALID_INPUT", "--limit must be a whole number");
	}
	const limit = Number(value);
	if (limit < 1 || limit > MAXIMUM_PAGE_SIZE) {
		throw new CliError(
			"INVALID_INPUT",
			`--limit must be between 1 and ${MAXIMUM_PAGE_SIZE}`
		);
	}
	return limit;
};

const assertNamesAllowed = (
	names: Array<string | string[] | undefined>,
	command: Command,
	runtime: CliRuntime
): void => {
	if (
		resolveGlobalOptions(command, runtime.environment).nonInteractive &&
		names.some((name) =>
			Array.isArray(name) ? name.length > 0 : Boolean(name)
		)
	) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive selectors require stable IDs"
		);
	}
};

const queryParsed = async <Output>(
	context: BackendCommandContext,
	operationName: import("../core/operations.js").OperationName,
	args: Readonly<Record<string, unknown>>,
	_schema: z.ZodType<Output>
): Promise<Output> =>
	(await context.operations.invoke(operationName, args)) as Output;

const outputMeta = (
	context: BackendCommandContext,
	meta: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> =>
	context.warnings.length > 0 ? { ...meta, warnings: context.warnings } : meta;

const writeReadSuccess = (options: {
	context: BackendCommandContext;
	data: unknown;
	human: string;
	meta?: Readonly<Record<string, unknown>>;
	runtime: CliRuntime;
}): void => {
	writeSuccess(
		options.context.globalOptions.json ? options.data : options.human,
		{
			globalOptions: options.context.globalOptions,
			runtime: options.runtime,
		},
		outputMeta(options.context, options.meta)
	);
};

const withBackend = async (
	command: Command,
	runtime: CliRuntime,
	operation: (context: BackendCommandContext) => Promise<void>
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const stopProgress = startBackendProgress(globalOptions, runtime);
	let context: BackendCommandContext | undefined;
	try {
		context = await createBackendCommandContext(command, runtime);
		stopProgress();
		await operation(context);
	} finally {
		stopProgress();
		context?.dispose();
	}
};

const listCycles = async (context: BackendCommandContext) =>
	await queryParsed(context, "resources.listCycles", {}, cycleSchema.array());

const resolveCycleId = async (
	context: BackendCommandContext,
	options: CycleSelectorOptions
): Promise<string> => {
	if (options.cycleId) {
		return options.cycleId;
	}
	if (!options.cycle) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide --cycle-id or an exact --cycle name"
		);
	}
	return resolveExactName({
		kind: "Cycle",
		name: options.cycle,
		nonInteractive: false,
		resources: await listCycles(context),
	}).id;
};

const listAccounts = async (
	context: BackendCommandContext,
	includeArchived: boolean
) =>
	await queryParsed(
		context,
		"accounts.list",
		{ includeArchived },
		accountSchema.array()
	);

const getHumanContext = async (
	context: BackendCommandContext,
	runtime: CliRuntime,
	date = resolveCommandDate({ now: runtime.now, timeZone: runtime.timeZone })
) => {
	if (context.globalOptions.json) {
		return undefined;
	}
	return await queryParsed(
		context,
		"context.get",
		{
			date: date.date,
			dateSource: date.dateSource,
			...(date.timezone ? { timezone: date.timezone } : {}),
		},
		contextSchema
	);
};

const resolveAccountId = async (
	context: BackendCommandContext,
	selector: string
): Promise<string> => {
	if (context.globalOptions.nonInteractive) {
		return selector;
	}
	return resolveIdOrExactName({
		kind: "Account",
		nonInteractive: false,
		resources: await listAccounts(context, true),
		selector,
	}).id;
};

export const runContext = async (
	options: { date?: string },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = globalOptions.interactive
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const defaultDate = resolveCommandDate({
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	const explicitDate = prompter
		? await promptDate({
				current: options.date,
				defaultDate: defaultDate.date,
				message: "Context date",
				prompter,
			})
		: options.date;
	const date = resolveCommandDate({
		explicitDate,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	await withBackend(command, runtime, async (context) => {
		const result = await queryParsed(
			context,
			"context.get",
			{
				date: date.date,
				dateSource: date.dateSource,
				...(date.timezone ? { timezone: date.timezone } : {}),
			},
			contextSchema
		);
		writeReadSuccess({
			context,
			data: result,
			human: renderContext(result, resolveHumanRenderOptions(runtime.stdout)),
			runtime,
		});
	});
};

export const runExpenseGet = async (
	expenseId: string | undefined,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter =
		expenseId === undefined
			? await getPrompter(globalOptions, runtime, true)
			: undefined;
	await withBackend(command, runtime, async (context) => {
		const resolvedExpenseId =
			expenseId ??
			(await selectExpenseId({
				context,
				message: "Choose an expense",
				prompter: requirePrompter(prompter),
			}));
		const expense = await queryParsed(
			context,
			"expenses.get",
			{ expenseId: resolvedExpenseId },
			expenseSchema
		);
		writeReadSuccess({
			context,
			data: expense,
			human: renderExpense(expense, resolveHumanRenderOptions(runtime.stdout)),
			runtime,
		});
	});
};

const validateExpenseListOptions = (
	options: ExpenseListOptions,
	command: Command,
	runtime: CliRuntime
): { from?: string; limit?: number; to?: string } => {
	assertNamesAllowed(
		[options.account, options.category, options.cycle, options.tag],
		command,
		runtime
	);
	if (options.category && !(options.cycle || options.cycleId)) {
		throw new CliError(
			"INVALID_INPUT",
			"An exact category name requires --cycle-id or --cycle"
		);
	}
	const from = options.from ? parseDate(options.from) : undefined;
	const to = options.to ? parseDate(options.to) : undefined;
	if (from && to && from > to) {
		throw new CliError("INVALID_INPUT", "--from cannot be after --to");
	}
	return { from, limit: parseLimit(options.limit), to };
};

const resolveExpenseListArgs = async (
	context: BackendCommandContext,
	options: ExpenseListOptions,
	validated: { from?: string; limit?: number; to?: string }
): Promise<Record<string, unknown>> => {
	const cycleId = options.cycle
		? await resolveCycleId(context, options)
		: options.cycleId;
	let categoryId = options.categoryId;
	if (options.category) {
		const categories = await queryParsed(
			context,
			"resources.listCategories",
			{ cycleId },
			categorySchema.array()
		);
		categoryId = resolveExactName({
			kind: "Category",
			name: options.category,
			nonInteractive: false,
			resources: categories,
		}).id;
	}
	let accountId = options.accountId;
	if (options.account) {
		accountId = resolveExactName({
			kind: "Account",
			name: options.account,
			nonInteractive: false,
			resources: await listAccounts(context, true),
		}).id;
	}
	const tagIds = [...(options.tagId ?? [])];
	if ((options.tag?.length ?? 0) > 0) {
		const tags = await queryParsed(
			context,
			"resources.listTags",
			{},
			tagSchema.array()
		);
		for (const tagName of options.tag ?? []) {
			tagIds.push(
				resolveExactName({
					kind: "Tag",
					name: tagName,
					nonInteractive: false,
					resources: tags,
				}).id
			);
		}
	}
	const args: Record<string, unknown> = {};
	for (const [key, value] of Object.entries({
		accountId,
		categoryId,
		cursor: options.cursor,
		cycleId,
		from: validated.from,
		limit: validated.limit,
		to: validated.to,
		unassigned: options.unassigned,
		uncategorized: options.uncategorized,
	})) {
		if (value !== undefined) {
			args[key] = value;
		}
	}
	if (tagIds.length > 0) {
		args.tagIds = [...new Set(tagIds)];
	}
	return args;
};

const resolveActiveFilterLabels = async (
	context: BackendCommandContext,
	args: Readonly<Record<string, unknown>>
): Promise<ActiveFilterLabels> => {
	const cycleId = typeof args.cycleId === "string" ? args.cycleId : undefined;
	const categoryId =
		typeof args.categoryId === "string" ? args.categoryId : undefined;
	const accountId =
		typeof args.accountId === "string" ? args.accountId : undefined;
	const tagIds = Array.isArray(args.tagIds)
		? args.tagIds.filter((value): value is string => typeof value === "string")
		: [];
	const [cycles, accounts, tags] = await Promise.all([
		cycleId || categoryId ? listCycles(context) : Promise.resolve([]),
		accountId ? listAccounts(context, true) : Promise.resolve([]),
		tagIds.length > 0
			? queryParsed(context, "resources.listTags", {}, tagSchema.array())
			: Promise.resolve([]),
	]);
	const categoryCycles = cycleId
		? cycles.filter((cycle) => cycle.id === cycleId)
		: cycles;
	const categories = categoryId
		? (
				await Promise.all(
					categoryCycles.map(
						async (cycle) =>
							await queryParsed(
								context,
								"resources.listCategories",
								{ cycleId: cycle.id },
								categorySchema.array()
							)
					)
				)
			).flat()
		: [];
	return {
		account: accountId
			? (accounts.find((account) => account.id === accountId)?.name ??
				"Unknown account")
			: undefined,
		category: categoryId
			? (categories.find((category) => category.id === categoryId)?.name ??
				"Unknown category")
			: undefined,
		cycle: cycleId
			? (cycles.find((cycle) => cycle.id === cycleId)?.name ?? "Unknown cycle")
			: undefined,
		tags:
			tagIds.length > 0
				? tagIds.map(
						(tagId) =>
							tags.find((tag) => tag.id === tagId)?.name ?? "Unknown tag"
					)
				: undefined,
	};
};

type ExpenseListPromptField =
	| "account"
	| "category"
	| "cycle"
	| "from"
	| "limit"
	| "tags"
	| "to";

interface ExpenseListPromptContext {
	context: BackendCommandContext;
	fields: ExpenseListPromptField[];
	prompter: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	result: ExpenseListOptions;
	runtime: CliRuntime;
}

const promptExpenseCycleFilter = async (
	options: ExpenseListPromptContext
): Promise<void> => {
	if (
		!options.fields.includes("cycle") ||
		options.result.cycle ||
		options.result.cycleId
	) {
		return;
	}
	options.result.cycleId = (
		await selectCycle({
			context: options.context,
			message: "Choose an expense cycle",
			prompter: options.prompter,
		})
	).id;
};

const promptExpenseCategoryFilter = async (
	options: ExpenseListPromptContext
): Promise<void> => {
	if (!options.fields.includes("category")) {
		return;
	}
	if (!(options.result.cycle || options.result.cycleId)) {
		options.result.cycleId = (
			await selectCycle({
				context: options.context,
				message: "Choose the category's cycle",
				prompter: options.prompter,
			})
		).id;
	}
	const cycleId =
		options.result.cycleId ??
		(await resolveCycleId(options.context, options.result));
	const categories = await queryParsed(
		options.context,
		"resources.listCategories",
		{ cycleId },
		categorySchema.array()
	);
	const categoryId = await options.prompter.select({
		message: "Choose a category filter",
		options: [
			{ label: "Uncategorized", value: "uncategorized" },
			...categories.map((category) => ({
				hint: category.categoryType?.name ?? "No type",
				label: category.name,
				value: category.id,
			})),
		],
		searchable: categories.length > 8,
	});
	if (categoryId === "uncategorized") {
		options.result.uncategorized = true;
		return;
	}
	options.result.categoryId = categoryId;
};

const promptExpenseAccountFilter = async (
	options: ExpenseListPromptContext
): Promise<void> => {
	if (!options.fields.includes("account")) {
		return;
	}
	const accounts = await listAccounts(options.context, true);
	if (accounts.length === 0) {
		options.result.unassigned = true;
		return;
	}
	const accountId = await options.prompter.select({
		message: "Choose an account filter",
		options: [
			{ label: "Unassigned", value: "unassigned" },
			...accounts.map((account) => ({
				hint: `${account.currency} ${account.currentBalance.toFixed(2)}`,
				label: account.isArchived ? `${account.name} (archived)` : account.name,
				value: account.id,
			})),
		],
		searchable: accounts.length > 8,
	});
	if (accountId === "unassigned") {
		options.result.unassigned = true;
		return;
	}
	options.result.accountId = accountId;
};

const promptExpenseTagFilter = async (
	options: ExpenseListPromptContext
): Promise<void> => {
	if (!options.fields.includes("tags")) {
		return;
	}
	options.result.tagId = await selectTags({
		context: options.context,
		message: "Choose required tags",
		prompter: options.prompter,
	});
};

const promptExpenseDateFilters = async (
	options: ExpenseListPromptContext
): Promise<void> => {
	const defaultDate = resolveCommandDate({
		now: options.runtime.now,
		timeZone: options.runtime.timeZone,
	}).date;
	if (options.fields.includes("from") && options.result.from === undefined) {
		options.result.from = await promptDate({
			defaultDate,
			message: "Inclusive start date",
			prompter: options.prompter,
		});
	}
	if (options.fields.includes("to") && options.result.to === undefined) {
		options.result.to = await promptDate({
			defaultDate,
			message: "Inclusive end date",
			prompter: options.prompter,
		});
	}
};

const promptExpensePageSize = async (
	options: ExpenseListPromptContext
): Promise<void> => {
	if (!options.fields.includes("limit") || options.result.limit !== undefined) {
		return;
	}
	options.result.limit = await options.prompter.text({
		initialValue: String(DEFAULT_PAGE_SIZE),
		message: "Page size",
		validate: (value) => {
			try {
				parseLimit(value);
				return undefined;
			} catch (error) {
				return error instanceof Error ? error.message : "Invalid page size";
			}
		},
	});
};

const promptExpenseListOptions = async (options: {
	context: BackendCommandContext;
	input: ExpenseListOptions;
	prompter: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	runtime: CliRuntime;
}): Promise<ExpenseListOptions> => {
	const fields = await options.prompter.multiselect({
		message: "Choose expense filters",
		options: [
			{ label: "Cycle", value: "cycle" },
			{ label: "Category", value: "category" },
			{ label: "Account", value: "account" },
			{ label: "Tags", value: "tags" },
			{ label: "Start date", value: "from" },
			{ label: "End date", value: "to" },
			{ label: "Page size", value: "limit" },
		],
		required: false,
	});
	const promptContext: ExpenseListPromptContext = {
		context: options.context,
		fields,
		prompter: options.prompter,
		result: { ...options.input },
		runtime: options.runtime,
	};
	await promptExpenseCycleFilter(promptContext);
	await promptExpenseCategoryFilter(promptContext);
	await promptExpenseAccountFilter(promptContext);
	await promptExpenseTagFilter(promptContext);
	await promptExpenseDateFilters(promptContext);
	await promptExpensePageSize(promptContext);
	return promptContext.result;
};

const skipEmptyGuidedExpensePages = async (options: {
	args: Readonly<Record<string, unknown>>;
	context: BackendCommandContext;
	enabled?: boolean;
	result: ExpensePage;
}): Promise<{
	args: Readonly<Record<string, unknown>>;
	result: ExpensePage;
}> => {
	let args = options.args;
	let result = options.result;
	if (options.enabled === false) {
		return { args, result };
	}
	const visitedCursors = new Set<string>();
	while (result.items.length === 0 && result.hasMore && result.nextCursor) {
		if (visitedCursors.has(result.nextCursor)) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Expense pagination did not advance"
			);
		}
		visitedCursors.add(result.nextCursor);
		args = { ...args, cursor: result.nextCursor };
		result = await queryParsed(
			options.context,
			"expenses.list",
			args,
			expensePageSchema
		);
	}
	return { args, result };
};

const hasActiveExpenseFilters = (
	args: Readonly<Record<string, unknown>>
): boolean =>
	Object.keys(args).some((key) => key !== "cursor" && key !== "limit");

export const runExpenseList = async (
	options: ExpenseListOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = globalOptions.interactive
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const prevalidated = prompter
		? undefined
		: validateExpenseListOptions(options, command, runtime);
	await withBackend(command, runtime, async (context) => {
		let resolvedOptions = prompter
			? await promptExpenseListOptions({
					context,
					input: options,
					prompter,
					runtime,
				})
			: options;
		let validated =
			prevalidated ??
			validateExpenseListOptions(resolvedOptions, command, runtime);
		let args = await resolveExpenseListArgs(
			context,
			resolvedOptions,
			validated
		);
		let result = await queryParsed(
			context,
			"expenses.list",
			args,
			expensePageSchema
		);
		({ args, result } = await skipEmptyGuidedExpensePages({
			args,
			context,
			enabled: Boolean(prompter),
			result,
		}));
		let items = [...result.items];
		let stoppedEarly = false;
		while (prompter && result.hasMore && result.nextCursor) {
			const nextAction = await prompter.select({
				message: `More expenses are available (${items.length} loaded)`,
				options: [
					{ label: "Load next page", value: "load" },
					{ label: "Change filters", value: "change" },
					{ label: "Done", value: "done" },
				],
			});
			if (nextAction === "done") {
				stoppedEarly = true;
				break;
			}
			if (nextAction === "change") {
				resolvedOptions = {
					...(await promptExpenseListOptions({
						context,
						input: resolvedOptions,
						prompter,
						runtime,
					})),
					cursor: undefined,
				};
				validated = validateExpenseListOptions(
					resolvedOptions,
					command,
					runtime
				);
				args = await resolveExpenseListArgs(
					context,
					resolvedOptions,
					validated
				);
				items = [];
			} else {
				args = { ...args, cursor: result.nextCursor };
			}
			result = await queryParsed(
				context,
				"expenses.list",
				args,
				expensePageSchema
			);
			({ args, result } = await skipEmptyGuidedExpensePages({
				args,
				context,
				result,
			}));
			items.push(...result.items);
		}
		const continuationCommand =
			result.nextCursor && !stoppedEarly
				? buildContinuationCommand({
						args,
						command: ["expenses", "list"],
						nextCursor: result.nextCursor,
					})
				: undefined;
		const hasActiveFilters = hasActiveExpenseFilters(args);
		const activeFilters = context.globalOptions.json
			? ""
			: renderActiveFilters(
					args,
					await resolveActiveFilterLabels(context, args)
				);
		writeReadSuccess({
			context,
			data: items,
			human: [
				...(activeFilters
					? [
							renderHumanLines(
								[activeFilters],
								resolveHumanRenderOptions(runtime.stdout)
							),
							"",
						]
					: []),
				renderExpenses(
					items,
					resolveHumanRenderOptions(runtime.stdout),
					hasActiveFilters
						? "No expenses match these filters."
						: "No expenses yet."
				),
				"",
				renderPaginationFooter({
					continuationCommand,
					count: items.length,
					hasMore: result.hasMore,
				}),
			].join("\n"),
			meta: {
				hasMore: result.hasMore,
				nextCursor: result.nextCursor,
				pageSize: validated.limit ?? DEFAULT_PAGE_SIZE,
			},
			runtime,
		});
	});
};

export const runCycleList = async (
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	await withBackend(command, runtime, async (context) => {
		const cycles = await listCycles(context);
		writeReadSuccess({
			context,
			data: cycles,
			human: renderCycles(cycles, resolveHumanRenderOptions(runtime.stdout)),
			runtime,
		});
	});
};

export const runCycleCurrent = async (
	options: { date?: string },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = globalOptions.interactive
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const defaultDate = resolveCommandDate({
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	const explicitDate = prompter
		? await promptDate({
				current: options.date,
				defaultDate: defaultDate.date,
				message: "Cycle lookup date",
				prompter,
			})
		: options.date;
	const date = resolveCommandDate({
		explicitDate,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	await withBackend(command, runtime, async (context) => {
		const cycle = await queryParsed(
			context,
			"resources.getCurrentCycle",
			{ date: date.date },
			cycleSchema.nullable()
		);
		writeReadSuccess({
			context,
			data: cycle,
			human: renderCycle(cycle, resolveHumanRenderOptions(runtime.stdout)),
			meta: date,
			runtime,
		});
	});
};

export const runCategoryList = async (
	options: CycleSelectorOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	assertNamesAllowed([options.cycle], command, runtime);
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter =
		options.cycle || options.cycleId
			? undefined
			: await getPrompter(globalOptions, runtime, true);
	await withBackend(command, runtime, async (context) => {
		const cycleId =
			options.cycle || options.cycleId
				? await resolveCycleId(context, options)
				: (
						await selectCycle({
							context,
							message: "Choose an expense cycle",
							prompter: requirePrompter(prompter),
						})
					).id;
		const categories = await queryParsed(
			context,
			"resources.listCategories",
			{ cycleId },
			categorySchema.array()
		);
		const humanContext = await getHumanContext(context, runtime);
		writeReadSuccess({
			context,
			data: categories,
			human: renderCategories(
				categories,
				humanContext?.currency ?? "",
				resolveHumanRenderOptions(runtime.stdout)
			),
			meta: { cycleId },
			runtime,
		});
	});
};

export const runTagList = async (
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	await withBackend(command, runtime, async (context) => {
		const tags = await queryParsed(
			context,
			"resources.listTags",
			{},
			tagSchema.array()
		);
		writeReadSuccess({
			context,
			data: tags,
			human: renderTags(tags, resolveHumanRenderOptions(runtime.stdout)),
			runtime,
		});
	});
};

type CommandDate = ReturnType<typeof resolveCommandDate>;

const resolveGuidedSummaryCycle = async (options: {
	context: BackendCommandContext;
	date: CommandDate;
	prompter: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	runtime: CliRuntime;
}): Promise<{ cycleId: string; date: CommandDate }> => {
	let date = options.date;
	for (;;) {
		const mode = await options.prompter.select({
			message: "Which cycle should be summarized?",
			options: [
				{
					label: "Cycle containing the selected date",
					value: "current",
				},
				{ label: "Choose another cycle", value: "select" },
			],
		});
		if (mode === "select") {
			const cycle = await selectCycle({
				context: options.context,
				message: "Choose an expense cycle",
				prompter: options.prompter,
			});
			return { cycleId: cycle.id, date };
		}
		const current = await queryParsed(
			options.context,
			"resources.getCurrentCycle",
			{ date: date.date },
			cycleSchema.nullable()
		);
		if (current) {
			return { cycleId: current.id, date };
		}
		const recovery = await options.prompter.select({
			message: `No cycle contains ${date.date}. What would you like to do?`,
			options: [
				{ label: "Change date", value: "date" },
				{ label: "Choose another cycle", value: "select" },
				{ label: "Cancel", value: "cancel" },
			],
		});
		if (recovery === "cancel") {
			throw new PromptCancelledError();
		}
		if (recovery === "select") {
			const cycle = await selectCycle({
				context: options.context,
				message: "Choose an expense cycle",
				prompter: options.prompter,
			});
			return { cycleId: cycle.id, date };
		}
		const changedDate = await promptDate({
			defaultDate: date.date,
			message: "Summary date",
			prompter: options.prompter,
		});
		date = resolveCommandDate({
			explicitDate: changedDate,
			now: options.runtime.now,
			timeZone: options.runtime.timeZone,
		});
	}
};

export const runSummary = async (
	options: CycleSelectorOptions & { current?: boolean; date?: string },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	assertNamesAllowed([options.cycle], command, runtime);
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = globalOptions.interactive
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	await withBackend(command, runtime, async (context) => {
		const defaultDate = resolveCommandDate({
			now: runtime.now,
			timeZone: runtime.timeZone,
		});
		const explicitDate = prompter
			? await promptDate({
					current: options.date,
					defaultDate: defaultDate.date,
					message: "Summary date",
					prompter,
				})
			: options.date;
		let date = resolveCommandDate({
			explicitDate,
			now: runtime.now,
			timeZone: runtime.timeZone,
		});
		let cycleId: string;
		if (options.cycle || options.cycleId) {
			cycleId = await resolveCycleId(context, options);
		} else if (prompter) {
			const guided = await resolveGuidedSummaryCycle({
				context,
				date,
				prompter,
				runtime,
			});
			cycleId = guided.cycleId;
			date = guided.date;
		} else {
			const current = await queryParsed(
				context,
				"resources.getCurrentCycle",
				{ date: date.date },
				cycleSchema.nullable()
			);
			if (!current) {
				throw new CliError(
					"RESOURCE_NOT_FOUND",
					"No expense cycle contains today's local date",
					{ details: date }
				);
			}
			cycleId = current.id;
		}
		const summary = await queryParsed(
			context,
			"resources.getSummary",
			{ cycleId, today: date.date },
			summarySchema
		);
		const humanContext = await getHumanContext(context, runtime, date);
		writeReadSuccess({
			context,
			data: summary,
			human: renderSummary(
				summary,
				humanContext?.currency ?? "",
				resolveHumanRenderOptions(runtime.stdout)
			),
			meta: { cycleId, ...date },
			runtime,
		});
	});
};

export const runAccountList = async (
	options: { includeArchived?: boolean },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = globalOptions.interactive
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const includeArchived =
		options.includeArchived === true ||
		(prompter
			? await prompter.confirm({
					initialValue: false,
					message: "Include archived accounts?",
				})
			: false);
	await withBackend(command, runtime, async (context) => {
		const accounts = await listAccounts(context, includeArchived);
		writeReadSuccess({
			context,
			data: accounts,
			human: renderAccounts(
				accounts,
				resolveHumanRenderOptions(runtime.stdout)
			),
			runtime,
		});
	});
};

export const runAccountGet = async (
	selector: string | undefined,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter =
		selector === undefined
			? await getPrompter(globalOptions, runtime, true)
			: undefined;
	await withBackend(command, runtime, async (context) => {
		const accountId = selector
			? await resolveAccountId(context, selector)
			: (
					await selectAccount({
						context,
						include: () => true,
						message: "Choose an account",
						prompter: requirePrompter(prompter),
					})
				).id;
		const account = await queryParsed(
			context,
			"accounts.get",
			{ accountId },
			accountSchema
		);
		writeReadSuccess({
			context,
			data: account,
			human: renderAccount(account, resolveHumanRenderOptions(runtime.stdout)),
			runtime,
		});
	});
};

export const runAccountTransactions = async (
	selector: string | undefined,
	options: PageOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const limit = parseLimit(options.limit);
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = globalOptions.interactive
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	await withBackend(command, runtime, async (context) => {
		const accountId = selector
			? await resolveAccountId(context, selector)
			: (
					await selectAccount({
						context,
						include: () => true,
						message: "Choose an account",
						prompter: requirePrompter(prompter),
					})
				).id;
		const args: Record<string, unknown> = { accountId };
		if (options.cursor !== undefined) {
			args.cursor = options.cursor;
		}
		if (limit !== undefined) {
			args.limit = limit;
		}
		let result = await queryParsed(
			context,
			"accounts.listTransactions",
			args,
			transactionPageSchema
		);
		const transactions = [...result.items];
		let stoppedEarly = false;
		while (prompter && result.hasMore && result.nextCursor) {
			const nextAction = await prompter.select({
				message: `More transactions are available (${transactions.length} loaded)`,
				options: [
					{ label: "Load next page", value: "load" },
					{ label: "Done", value: "done" },
				],
			});
			if (nextAction === "done") {
				stoppedEarly = true;
				break;
			}
			args.cursor = result.nextCursor;
			result = await queryParsed(
				context,
				"accounts.listTransactions",
				args,
				transactionPageSchema
			);
			transactions.push(...result.items);
		}
		const account = context.globalOptions.json
			? undefined
			: await queryParsed(
					context,
					"accounts.get",
					{ accountId },
					accountSchema
				);
		const continuationCommand =
			result.nextCursor && !stoppedEarly
				? buildContinuationCommand({
						args: { limit },
						command: ["accounts", "transactions", accountId],
						nextCursor: result.nextCursor,
					})
				: undefined;
		writeReadSuccess({
			context,
			data: transactions,
			human: account
				? [
						`Account: ${account.name}`,
						renderTransactions(
							transactions,
							account.currency,
							resolveHumanRenderOptions(runtime.stdout)
						),
						"",
						renderPaginationFooter({
							continuationCommand,
							count: transactions.length,
							hasMore: result.hasMore,
						}),
					].join("\n")
				: "",
			meta: {
				accountId,
				hasMore: result.hasMore,
				nextCursor: result.nextCursor,
				pageSize: limit ?? DEFAULT_PAGE_SIZE,
			},
			runtime,
		});
	});
};

export const runAccountTypeList = async (
	options: { includeArchived?: boolean },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = globalOptions.interactive
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const includeArchived =
		options.includeArchived === true ||
		(prompter
			? await prompter.confirm({
					initialValue: false,
					message: "Include archived account types?",
				})
			: false);
	await withBackend(command, runtime, async (context) => {
		const accountTypes = await queryParsed(
			context,
			"accountTypes.list",
			{ includeArchived },
			accountTypeSchema.array()
		);
		writeReadSuccess({
			context,
			data: accountTypes,
			human: renderAccountTypes(
				accountTypes,
				resolveHumanRenderOptions(runtime.stdout)
			),
			runtime,
		});
	});
};
