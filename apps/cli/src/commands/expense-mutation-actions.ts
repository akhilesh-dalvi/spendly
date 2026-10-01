import type { Command } from "commander";
import type { z } from "zod";
import type { BackendCommandContext } from "../client/convex-client.js";
import { parseDate, resolveCommandDate } from "../domain/dates.js";
import {
	parseAmount,
	parseRevision,
	resolveIdempotencyKey,
	validateMutationText,
} from "../domain/mutation-input.js";
import {
	type ExpenseProposal,
	expenseCreateResultSchema,
	expenseDeletePreviewSchema,
	expenseDeleteResultSchema,
	expenseMutationResultSchema,
	expenseProposalSchema,
	expenseUpdatePreviewSchema,
} from "../domain/mutation-schemas.js";
import {
	accountSchema,
	categorySchema,
	contextSchema,
	cycleSchema,
	expenseSchema,
	tagSchema,
} from "../domain/read-schemas.js";
import { resolveExactName } from "../domain/selectors.js";
import { CliError } from "../errors.js";
import {
	type InteractivePrompter,
	PromptCancelledError,
} from "../input/types.js";
import { resolveGlobalOptions } from "../options.js";
import {
	type ExpenseProposalPresentation,
	renderExpenseAddResult,
	renderExpenseDeletePreview,
	renderExpenseDeleteResult,
	renderExpenseEditPreview,
	renderExpenseMutationResult,
	renderExpenseProposal,
} from "../output/mutation-terminal.js";
import { renderExpense } from "../output/read-terminal.js";
import type { CliRuntime } from "../runtime.js";
import {
	confirmMutation,
	getPrompter,
	listVisibleCategories,
	promptDate,
	promptOptionalText,
	promptRequiredText,
	requirePrompter,
	selectAccountMode,
	selectCategoryMode,
	selectExpenseId,
	selectTags,
} from "./interactive-support.js";
import {
	assertNamesAllowed,
	commitParsed,
	mutationParsed,
	queryParsed,
	withBackend,
	writeMutationSuccess,
} from "./mutation-support.js";

interface ExpenseAddOptions {
	account?: string;
	accountId?: string;
	amount?: string;
	category?: string;
	categoryId?: string;
	date?: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	spentOn?: string;
	tag?: string[];
	tagId?: string[];
	withoutAccount?: boolean;
}

interface ExpenseEditOptions {
	account?: string;
	accountId?: string;
	amount?: string;
	category?: string;
	categoryId?: string;
	clearAccount?: boolean;
	clearCategory?: boolean;
	clearSpentOn?: boolean;
	clearTags?: boolean;
	date?: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	ifRevision?: string;
	spentOn?: string;
	tag?: string[];
	tagId?: string[];
}

interface ExpenseDeleteOptions {
	confirmationToken?: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	ifRevision?: string;
}

const resolveCategoryName = async (
	context: BackendCommandContext,
	name: string,
	date: string
): Promise<string> => {
	const cycle = await queryParsed(
		context,
		"resources.getCurrentCycle",
		{ date },
		cycleSchema.nullable()
	);
	if (!cycle) {
		throw new CliError(
			"RESOURCE_NOT_FOUND",
			"No expense cycle contains the selected date"
		);
	}
	const categories = await queryParsed(
		context,
		"resources.listCategories",
		{ cycleId: cycle.id },
		categorySchema.array()
	);
	return resolveExactName({
		kind: "Category",
		name,
		nonInteractive: false,
		resources: categories.filter((category) => !category.isHidden),
	}).id;
};

const resolveAccountName = async (
	context: BackendCommandContext,
	name: string
): Promise<string> => {
	const accounts = await queryParsed(
		context,
		"accounts.list",
		{ includeArchived: true },
		accountSchema.array()
	);
	return resolveExactName({
		kind: "Account",
		name,
		nonInteractive: false,
		resources: accounts,
	}).id;
};

const resolveTagIds = async (
	context: BackendCommandContext,
	tagIds: readonly string[],
	tagNames: readonly string[]
): Promise<string[]> => {
	const resolved = [...tagIds];
	if (tagNames.length > 0) {
		const tags = await queryParsed(
			context,
			"resources.listTags",
			{},
			tagSchema.array()
		);
		for (const name of tagNames) {
			resolved.push(
				resolveExactName({
					kind: "Tag",
					name,
					nonInteractive: false,
					resources: tags,
				}).id
			);
		}
	}
	return [...new Set(resolved)];
};

const resolveExpenseProposalPresentation = async (
	context: BackendCommandContext,
	proposal: ExpenseProposal
): Promise<ExpenseProposalPresentation> => {
	const [accounts, tags, cycle] = await Promise.all([
		proposal.accountId
			? queryParsed(
					context,
					"accounts.list",
					{ includeArchived: true },
					accountSchema.array()
				)
			: Promise.resolve([]),
		proposal.tagIds.length > 0
			? queryParsed(context, "resources.listTags", {}, tagSchema.array())
			: Promise.resolve([]),
		proposal.cycleId
			? queryParsed(
					context,
					"resources.getCurrentCycle",
					{ date: proposal.date },
					cycleSchema.nullable()
				)
			: Promise.resolve(null),
	]);
	const categories =
		proposal.categoryId && cycle
			? await queryParsed(
					context,
					"resources.listCategories",
					{ cycleId: cycle.id },
					categorySchema.array()
				)
			: [];
	return {
		account:
			accounts.find((account) => account.id === proposal.accountId)?.name ??
			"Unassigned",
		category:
			categories.find((category) => category.id === proposal.categoryId)
				?.name ?? "Uncategorized",
		cycle: cycle?.name ?? "none",
		tags: proposal.tagIds.map(
			(tagId) => tags.find((tag) => tag.id === tagId)?.name ?? "Unknown tag"
		),
	};
};

const resolveAddCategoryId = async (options: {
	context: BackendCommandContext;
	date: string;
	input: ExpenseAddOptions;
	prompter?: InteractivePrompter;
}): Promise<string | null | undefined> => {
	if (options.input.categoryId || options.input.category) {
		return (
			options.input.categoryId ??
			(await resolveCategoryName(
				options.context,
				options.input.category ?? "",
				options.date
			))
		);
	}
	if (!options.prompter) {
		return undefined;
	}
	const categoryMode = await selectCategoryMode({
		categories: await listVisibleCategories(options.context, options.date),
		message: `Choose a category for ${options.date}`,
		prompter: options.prompter,
	});
	return categoryMode === "clear" ? null : categoryMode;
};

const resolveAddAccountId = async (options: {
	context: BackendCommandContext;
	input: ExpenseAddOptions;
	prompter?: InteractivePrompter;
}): Promise<string | null | undefined> => {
	if (options.input.withoutAccount) {
		return null;
	}
	if (options.input.accountId || options.input.account) {
		return (
			options.input.accountId ??
			(await resolveAccountName(options.context, options.input.account ?? ""))
		);
	}
	if (!options.prompter) {
		return undefined;
	}
	const accounts = await queryParsed(
		options.context,
		"accounts.list",
		{ includeArchived: false },
		accountSchema.array()
	);
	const accountMode = await selectAccountMode({
		accounts,
		message: "Choose an account",
		prompter: options.prompter,
		withAutomatic: true,
	});
	if (accountMode === "clear") {
		return null;
	}
	return accountMode === "automatic" ? undefined : accountMode;
};

const buildExpenseAddInput = async (options: {
	amount: number;
	context: BackendCommandContext;
	date: string;
	input: ExpenseAddOptions;
	prompter?: InteractivePrompter;
	spentOn?: string;
}): Promise<Record<string, unknown>> => {
	const result: Record<string, unknown> = {
		amount: options.amount,
		date: options.date,
	};
	if (options.spentOn !== undefined) {
		result.spentOn = options.spentOn;
	}
	const categoryId = await resolveAddCategoryId(options);
	if (categoryId !== undefined) {
		result.categoryId = categoryId;
	}
	const accountId = await resolveAddAccountId(options);
	if (accountId !== undefined) {
		result.accountId = accountId;
	}
	const hasExplicitTags =
		(options.input.tagId?.length ?? 0) > 0 ||
		(options.input.tag?.length ?? 0) > 0;
	const tagIds =
		options.prompter && !hasExplicitTags
			? await selectTags({
					context: options.context,
					message: "Choose tags",
					prompter: options.prompter,
				})
			: await resolveTagIds(
					options.context,
					options.input.tagId ?? [],
					options.input.tag ?? []
				);
	if (tagIds.length > 0) {
		result.tagIds = tagIds;
	}
	return result;
};

export const runExpenseAdd = async (
	options: ExpenseAddOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	assertNamesAllowed(
		[options.account, options.category, options.tag],
		globalOptions.nonInteractive
	);
	const guided = globalOptions.interactive || options.amount === undefined;
	const prompter = guided
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const defaultDate = resolveCommandDate({
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		const currency =
			options.amount === undefined
				? (
						await queryParsed(
							context,
							"context.get",
							{
								date: defaultDate.date,
								dateSource: defaultDate.dateSource,
								...(defaultDate.timezone
									? { timezone: defaultDate.timezone }
									: {}),
							},
							contextSchema
						)
					).currency
				: undefined;
		const amountInput = await promptRequiredText({
			current: options.amount,
			globalOptions,
			message: currency ? `Expense amount (${currency})` : "Expense amount",
			parse: parseAmount,
			runtime,
		});
		const explicitDate = prompter
			? await promptDate({
					current: options.date,
					defaultDate: defaultDate.date,
					message: "Expense date",
					prompter,
				})
			: options.date;
		const spentOnInput = prompter
			? await promptOptionalText({
					current: options.spentOn,
					message: "What was this spent on?",
					prompter,
				})
			: options.spentOn;
		const date = resolveCommandDate({
			explicitDate,
			now: runtime.now,
			timeZone: runtime.timeZone,
		});
		const amount = parseAmount(amountInput);
		const spentOn = validateMutationText(spentOnInput, "--spent-on");
		const input = await buildExpenseAddInput({
			amount,
			context,
			date: date.date,
			input: options,
			prompter,
			spentOn,
		});

		if (dryRun || prompter) {
			const proposal = await queryParsed(
				context,
				"expenses.previewCreate",
				input,
				expenseProposalSchema
			);
			const presentation = context.globalOptions.json
				? undefined
				: await resolveExpenseProposalPresentation(context, proposal);
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: proposal,
					human: renderExpenseProposal(proposal, presentation),
					meta: { dryRun: true, ...date },
					runtime,
				});
				return;
			}
			await confirmMutation({
				message: "Add this expense?",
				preview: renderExpenseProposal(proposal, presentation),
				prompter,
				runtime,
			});
		}

		const result = await commitParsed({
			args: { ...input, idempotencyKey },
			context,
			idempotencyKey,
			name: "expenses.create",
			schema: expenseCreateResultSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: renderExpenseAddResult(result),
			meta: { dryRun: false, idempotencyKey, ...date },
			runtime,
		});
	});
};

const hasEditInput = (options: ExpenseEditOptions): boolean =>
	options.amount !== undefined ||
	options.date !== undefined ||
	options.spentOn !== undefined ||
	options.clearSpentOn === true ||
	options.categoryId !== undefined ||
	options.category !== undefined ||
	options.clearCategory === true ||
	options.accountId !== undefined ||
	options.account !== undefined ||
	options.clearAccount === true ||
	(options.tagId?.length ?? 0) > 0 ||
	(options.tag?.length ?? 0) > 0 ||
	options.clearTags === true;

const assertDateCategoryCompatibility = async (
	context: BackendCommandContext,
	expense: z.infer<typeof expenseSchema>,
	options: ExpenseEditOptions,
	date: string | undefined
): Promise<void> => {
	if (
		!(
			date &&
			expense.category &&
			options.categoryId === undefined &&
			options.category === undefined &&
			!options.clearCategory
		)
	) {
		return;
	}
	const newCycle = await queryParsed(
		context,
		"resources.getCurrentCycle",
		{ date },
		cycleSchema.nullable()
	);
	if (newCycle?.id === expense.cycle?.id) {
		return;
	}
	const candidates = newCycle
		? (
				await queryParsed(
					context,
					"resources.listCategories",
					{ cycleId: newCycle.id },
					categorySchema.array()
				)
			)
				.filter(
					(category) =>
						!category.isHidden &&
						category.name.trim().toLocaleLowerCase() ===
							expense.category?.name.trim().toLocaleLowerCase()
				)
				.map(({ id, name }) => ({ id, name }))
		: [];
	throw new CliError(
		"CATEGORY_CYCLE_MISMATCH",
		"The existing category does not belong to the new date's cycle; provide --category-id or --clear-category",
		{
			details: {
				candidates,
				category: expense.category,
				newCycle,
				oldCycle: expense.cycle,
			},
		}
	);
};

const resolveEditTagIds = async (
	context: BackendCommandContext,
	options: ExpenseEditOptions
): Promise<string[] | undefined> => {
	if (options.clearTags) {
		return [];
	}
	if ((options.tagId?.length ?? 0) === 0 && (options.tag?.length ?? 0) === 0) {
		return undefined;
	}
	return await resolveTagIds(context, options.tagId ?? [], options.tag ?? []);
};

const buildEditInput = async (options: {
	amount?: number;
	context: BackendCommandContext;
	current: z.infer<typeof expenseSchema>;
	date?: string;
	expectedRevision: number;
	expenseId: string;
	input: ExpenseEditOptions;
	spentOn?: string;
}): Promise<Record<string, unknown>> => {
	const result: Record<string, unknown> = {
		expectedRevision: options.expectedRevision,
		expenseId: options.expenseId,
	};
	if (options.amount !== undefined) {
		result.amount = options.amount;
	}
	if (options.date !== undefined) {
		result.date = options.date;
	}
	if (options.input.clearSpentOn) {
		result.spentOn = null;
	} else if (options.spentOn !== undefined) {
		result.spentOn = options.spentOn;
	}
	if (options.input.clearCategory) {
		result.categoryId = null;
	} else if (options.input.categoryId || options.input.category) {
		result.categoryId =
			options.input.categoryId ??
			(await resolveCategoryName(
				options.context,
				options.input.category ?? "",
				options.date ?? options.current.date
			));
	}
	if (options.input.clearAccount) {
		result.accountId = null;
	} else if (options.input.accountId || options.input.account) {
		result.accountId =
			options.input.accountId ??
			(await resolveAccountName(options.context, options.input.account ?? ""));
	}
	const tagIds = await resolveEditTagIds(options.context, options.input);
	if (tagIds !== undefined) {
		result.tagIds = tagIds;
	}
	return result;
};

const promptExpenseEditInputs = async (options: {
	context: BackendCommandContext;
	current: z.infer<typeof expenseSchema>;
	input: ExpenseEditOptions;
	prompter: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	runtime: CliRuntime;
}): Promise<ExpenseEditOptions> => {
	const fields = await options.prompter.multiselect({
		message: "What would you like to change?",
		options: [
			{ label: "Amount", value: "amount" },
			{ label: "Date", value: "date" },
			{ label: "Description", value: "spentOn" },
			{ label: "Category", value: "category" },
			{ label: "Account", value: "account" },
			{ label: "Tags", value: "tags" },
		],
		required: true,
	});
	const result: ExpenseEditOptions = { ...options.input };
	if (fields.includes("amount")) {
		result.amount = await promptRequiredText({
			globalOptions: options.context.globalOptions,
			message: "New expense amount",
			parse: parseAmount,
			runtime: options.runtime,
		});
	}
	if (fields.includes("date")) {
		result.date = await promptDate({
			defaultDate: options.current.date,
			message: "New expense date",
			prompter: options.prompter,
		});
	}
	if (fields.includes("spentOn")) {
		const descriptionMode = await options.prompter.select({
			message: "Description change",
			options: [
				{ label: "Set a description", value: "set" },
				{ label: "Clear the description", value: "clear" },
			],
		});
		if (descriptionMode === "clear") {
			result.clearSpentOn = true;
		} else {
			result.spentOn = await options.prompter.text({
				initialValue: options.current.spentOn ?? undefined,
				message: "New description",
				validate: (value) =>
					value.trim().length > 0
						? undefined
						: "Description cannot be empty; choose Clear instead",
			});
		}
	}
	const effectiveDate = result.date ?? options.current.date;
	if (fields.includes("category")) {
		const categoryMode = await selectCategoryMode({
			categories: await listVisibleCategories(options.context, effectiveDate),
			message: `New category for ${effectiveDate}`,
			prompter: options.prompter,
		});
		if (categoryMode === "clear") {
			result.clearCategory = true;
		} else {
			result.categoryId = categoryMode;
		}
	}
	if (fields.includes("account")) {
		const accounts = await queryParsed(
			options.context,
			"accounts.list",
			{ includeArchived: false },
			accountSchema.array()
		);
		const accountMode = await selectAccountMode({
			accounts,
			message: "New account",
			prompter: options.prompter,
		});
		if (accountMode === "clear") {
			result.clearAccount = true;
		} else {
			result.accountId = accountMode;
		}
	}
	if (fields.includes("tags")) {
		const tagIds = await selectTags({
			context: options.context,
			initialIds: options.current.tags.map((tag) => tag.id),
			message: "New tags",
			prompter: options.prompter,
		});
		if (tagIds.length === 0) {
			result.clearTags = true;
		} else {
			result.tagId = tagIds;
		}
	}
	return result;
};

const resolveExpenseEditRequest = async (options: {
	context: BackendCommandContext;
	expenseId?: string;
	input: ExpenseEditOptions;
	prompter?: InteractivePrompter;
	providedRevision?: number;
	runtime: CliRuntime;
}): Promise<{
	expectedRevision: number;
	expenseId: string;
	input: Record<string, unknown>;
}> => {
	const expenseId =
		options.expenseId ??
		(await selectExpenseId({
			context: options.context,
			message: "Choose an expense to edit",
			prompter: requirePrompter(options.prompter),
		}));
	const current = await queryParsed(
		options.context,
		"expenses.get",
		{ expenseId },
		expenseSchema
	);
	const resolvedOptions =
		options.prompter && !hasEditInput(options.input)
			? await promptExpenseEditInputs({
					context: options.context,
					current,
					input: options.input,
					prompter: options.prompter,
					runtime: options.runtime,
				})
			: options.input;
	if (!hasEditInput(resolvedOptions)) {
		throw new CliError("INVALID_INPUT", "Provide at least one expense change");
	}
	const amount =
		resolvedOptions.amount === undefined
			? undefined
			: parseAmount(resolvedOptions.amount);
	const date =
		resolvedOptions.date === undefined
			? undefined
			: parseDate(resolvedOptions.date);
	const spentOn = validateMutationText(resolvedOptions.spentOn, "--spent-on");
	await assertDateCategoryCompatibility(
		options.context,
		current,
		resolvedOptions,
		date
	);
	const expectedRevision = options.providedRevision ?? current.revision;
	return {
		expectedRevision,
		expenseId,
		input: await buildEditInput({
			amount,
			context: options.context,
			current,
			date,
			expectedRevision,
			expenseId,
			input: resolvedOptions,
			spentOn,
		}),
	};
};

export const runExpenseEdit = async (
	expenseId: string | undefined,
	options: ExpenseEditOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const guided =
		globalOptions.interactive ||
		expenseId === undefined ||
		!hasEditInput(options);
	const prompter = guided
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	assertNamesAllowed(
		[options.account, options.category, options.tag],
		globalOptions.nonInteractive
	);
	const dryRun = options.dryRun === true;
	const providedRevision = options.ifRevision
		? parseRevision(options.ifRevision)
		: undefined;
	if (globalOptions.nonInteractive && providedRevision === undefined) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive edits require --if-revision"
		);
	}
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	await withBackend(command, runtime, async (context) => {
		let selectedExpenseId = expenseId;
		let editOptions = options;
		let expectedRevision = providedRevision ?? 0;
		let input: Record<string, unknown> = {};
		for (;;) {
			const resolved = await resolveExpenseEditRequest({
				context,
				expenseId: selectedExpenseId,
				input: editOptions,
				prompter,
				providedRevision,
				runtime,
			});
			expectedRevision = resolved.expectedRevision;
			selectedExpenseId = resolved.expenseId;
			input = resolved.input;

			if (!(dryRun || prompter)) {
				break;
			}
			const preview = await queryParsed(
				context,
				"expenses.previewUpdate",
				input,
				expenseUpdatePreviewSchema
			);
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: preview,
					human: renderExpenseEditPreview(preview),
					meta: { dryRun: true, expectedRevision },
					runtime,
				});
				return;
			}
			const reviewAction = await confirmMutation({
				allowEdit: true,
				message: "Save these expense changes?",
				preview: renderExpenseEditPreview(preview),
				prompter,
				runtime,
			});
			if (reviewAction === "confirm") {
				break;
			}
			editOptions = {};
		}

		try {
			const result = await commitParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: "expenses.update",
				schema: expenseMutationResultSchema,
			});
			writeMutationSuccess({
				context,
				data: result,
				human: renderExpenseMutationResult(result),
				meta: { dryRun: false, expectedRevision, idempotencyKey },
				runtime,
			});
		} catch (error) {
			if (
				error instanceof CliError &&
				error.code === "EXPENSE_REVISION_CONFLICT"
			) {
				throw new CliError(
					"EXPENSE_REVISION_CONFLICT",
					"The expense changed after it was read; read it again and rerun the dry run",
					{
						cause: error,
						details: { expectedRevision },
					}
				);
			}
			throw error;
		}
	});
};

const resolveHumanDeleteConfirmation = async (options: {
	confirmationToken?: string;
	context: BackendCommandContext;
	expectedRevision?: number;
	expenseId: string;
}): Promise<{
	confirmationToken: string;
	expectedRevision: number;
	message: string;
}> => {
	if (options.confirmationToken && options.expectedRevision) {
		const expense = await queryParsed(
			options.context,
			"expenses.get",
			{ expenseId: options.expenseId },
			expenseSchema
		);
		return {
			confirmationToken: options.confirmationToken,
			expectedRevision: options.expectedRevision,
			message: `${renderExpense(expense)}\nPermanently delete this expense?`,
		};
	}
	const preview = await mutationParsed({
		args: { expenseId: options.expenseId },
		context: options.context,
		name: "expenses.previewDelete",
		schema: expenseDeletePreviewSchema,
	});
	return {
		confirmationToken: preview.confirmationToken,
		expectedRevision: preview.revision,
		message: `${renderExpenseDeletePreview(preview)}\nPermanently delete this expense?`,
	};
};

export const runExpenseDelete = async (
	expenseId: string | undefined,
	options: ExpenseDeleteOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const dryRun = options.dryRun === true;
	const selectorPrompter =
		expenseId === undefined
			? await getPrompter(globalOptions, runtime, true)
			: undefined;
	const providedRevision = options.ifRevision
		? parseRevision(options.ifRevision)
		: undefined;
	if (
		dryRun &&
		(options.confirmationToken !== undefined || providedRevision !== undefined)
	) {
		throw new CliError(
			"INVALID_INPUT",
			"--dry-run creates a new confirmation; do not provide a token or revision"
		);
	}
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		const resolvedExpenseId =
			expenseId ??
			(await selectExpenseId({
				context,
				message: "Choose an expense to delete",
				prompter: requirePrompter(selectorPrompter),
			}));
		if (dryRun) {
			const preview = await mutationParsed({
				args: { expenseId: resolvedExpenseId },
				context,
				name: "expenses.previewDelete",
				schema: expenseDeletePreviewSchema,
			});
			writeMutationSuccess({
				context,
				data: preview,
				human: renderExpenseDeletePreview(preview),
				meta: { dryRun: true },
				runtime,
			});
			return;
		}

		if (
			globalOptions.nonInteractive &&
			!(options.confirmationToken && providedRevision && idempotencyKey)
		) {
			throw new CliError(
				"NON_INTERACTIVE_INPUT_REQUIRED",
				"Non-interactive deletion requires --confirmation-token, --if-revision, and --idempotency-key"
			);
		}
		if (
			(options.confirmationToken === undefined) !==
			(providedRevision === undefined)
		) {
			throw new CliError(
				"INVALID_INPUT",
				"Provide both --confirmation-token and --if-revision"
			);
		}

		let confirmationToken = options.confirmationToken;
		let expectedRevision = providedRevision;
		if (!globalOptions.nonInteractive) {
			const confirmation = await resolveHumanDeleteConfirmation({
				confirmationToken,
				context,
				expectedRevision,
				expenseId: resolvedExpenseId,
			});
			confirmationToken = confirmation.confirmationToken;
			expectedRevision = confirmation.expectedRevision;
			const confirmed = runtime.confirm
				? await runtime.confirm(confirmation.message)
				: await (await getPrompter(globalOptions, runtime, true)).confirm({
						initialValue: false,
						message: confirmation.message,
					});
			if (!confirmed) {
				throw new PromptCancelledError();
			}
		}
		if (!(confirmationToken && expectedRevision && idempotencyKey)) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Deletion confirmation inputs were not resolved"
			);
		}

		const result = await commitParsed({
			args: {
				confirmationToken,
				expectedRevision,
				expenseId: resolvedExpenseId,
				idempotencyKey,
			},
			context,
			idempotencyKey,
			name: "expenses.remove",
			schema: expenseDeleteResultSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: renderExpenseDeleteResult(result),
			meta: {
				dryRun: false,
				expectedRevision,
				idempotencyKey,
			},
			runtime,
		});
	});
};
