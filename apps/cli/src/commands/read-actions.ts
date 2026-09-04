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
import { resolveGlobalOptions } from "../options.js";
import { writeSuccess } from "../output/index.js";
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
	functionName: string,
	args: Readonly<Record<string, unknown>>,
	schema: z.ZodType<Output>
): Promise<Output> =>
	schema.parse(await context.query<unknown>(functionName, args));

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
	const context = await createBackendCommandContext(command, runtime);
	try {
		await operation(context);
	} finally {
		context.dispose();
	}
};

const listCycles = async (context: BackendCommandContext) =>
	await queryParsed(
		context,
		"cli/v1/resources:listCycles",
		{},
		cycleSchema.array()
	);

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
		"cli/v1/accounts:list",
		{ includeArchived },
		accountSchema.array()
	);

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
	const date = resolveCommandDate({
		explicitDate: options.date,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	await withBackend(command, runtime, async (context) => {
		const result = await queryParsed(
			context,
			"cli/v1/context:get",
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
			human: renderContext(result),
			runtime,
		});
	});
};

export const runExpenseGet = async (
	expenseId: string,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	await withBackend(command, runtime, async (context) => {
		const expense = await queryParsed(
			context,
			"cli/v1/expenses:get",
			{ expenseId },
			expenseSchema
		);
		writeReadSuccess({
			context,
			data: expense,
			human: renderExpense(expense),
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
			"cli/v1/resources:listCategories",
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
			"cli/v1/resources:listTags",
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

export const runExpenseList = async (
	options: ExpenseListOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const validated = validateExpenseListOptions(options, command, runtime);
	await withBackend(command, runtime, async (context) => {
		const result = await queryParsed(
			context,
			"cli/v1/expenses:list",
			await resolveExpenseListArgs(context, options, validated),
			expensePageSchema
		);
		writeReadSuccess({
			context,
			data: result.items,
			human: renderExpenses(result.items),
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
			human: renderCycles(cycles),
			runtime,
		});
	});
};

export const runCycleCurrent = async (
	options: { date?: string },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const date = resolveCommandDate({
		explicitDate: options.date,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	await withBackend(command, runtime, async (context) => {
		const cycle = await queryParsed(
			context,
			"cli/v1/resources:getCurrentCycle",
			{ date: date.date },
			cycleSchema.nullable()
		);
		writeReadSuccess({
			context,
			data: cycle,
			human: renderCycle(cycle),
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
	if (!(options.cycle || options.cycleId)) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide --cycle-id or an exact --cycle name"
		);
	}
	await withBackend(command, runtime, async (context) => {
		const cycleId = await resolveCycleId(context, options);
		const categories = await queryParsed(
			context,
			"cli/v1/resources:listCategories",
			{ cycleId },
			categorySchema.array()
		);
		writeReadSuccess({
			context,
			data: categories,
			human: renderCategories(categories),
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
			"cli/v1/resources:listTags",
			{},
			tagSchema.array()
		);
		writeReadSuccess({
			context,
			data: tags,
			human: renderTags(tags),
			runtime,
		});
	});
};

export const runSummary = async (
	options: CycleSelectorOptions & { current?: boolean; date?: string },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	assertNamesAllowed([options.cycle], command, runtime);
	await withBackend(command, runtime, async (context) => {
		const date = resolveCommandDate({
			explicitDate: options.date,
			now: runtime.now,
			timeZone: runtime.timeZone,
		});
		let cycleId: string;
		if (options.cycle || options.cycleId) {
			cycleId = await resolveCycleId(context, options);
		} else {
			const current = await queryParsed(
				context,
				"cli/v1/resources:getCurrentCycle",
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
			"cli/v1/resources:getSummary",
			{ cycleId, today: date.date },
			summarySchema
		);
		writeReadSuccess({
			context,
			data: summary,
			human: renderSummary(summary),
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
	await withBackend(command, runtime, async (context) => {
		const accounts = await listAccounts(
			context,
			options.includeArchived === true
		);
		writeReadSuccess({
			context,
			data: accounts,
			human: renderAccounts(accounts),
			runtime,
		});
	});
};

export const runAccountGet = async (
	selector: string,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	await withBackend(command, runtime, async (context) => {
		const accountId = await resolveAccountId(context, selector);
		const account = await queryParsed(
			context,
			"cli/v1/accounts:get",
			{ accountId },
			accountSchema
		);
		writeReadSuccess({
			context,
			data: account,
			human: renderAccount(account),
			runtime,
		});
	});
};

export const runAccountTransactions = async (
	selector: string,
	options: PageOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const limit = parseLimit(options.limit);
	await withBackend(command, runtime, async (context) => {
		const accountId = await resolveAccountId(context, selector);
		const args: Record<string, unknown> = { accountId };
		if (options.cursor !== undefined) {
			args.cursor = options.cursor;
		}
		if (limit !== undefined) {
			args.limit = limit;
		}
		const result = await queryParsed(
			context,
			"cli/v1/accounts:listTransactions",
			args,
			transactionPageSchema
		);
		writeReadSuccess({
			context,
			data: result.items,
			human: renderTransactions(result.items),
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
	await withBackend(command, runtime, async (context) => {
		const accountTypes = await queryParsed(
			context,
			"cli/v1/accountTypes:list",
			{ includeArchived: options.includeArchived === true },
			accountTypeSchema.array()
		);
		writeReadSuccess({
			context,
			data: accountTypes,
			human: renderAccountTypes(accountTypes),
			runtime,
		});
	});
};
