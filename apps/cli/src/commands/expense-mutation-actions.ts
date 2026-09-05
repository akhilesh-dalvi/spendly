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
	cycleSchema,
	expenseSchema,
	tagSchema,
} from "../domain/read-schemas.js";
import { resolveExactName } from "../domain/selectors.js";
import { CliError } from "../errors.js";
import { confirmDestructiveAction } from "../input/confirm.js";
import { resolveGlobalOptions } from "../options.js";
import {
	renderExpenseCreateResult,
	renderExpenseDeletePreview,
	renderExpenseDeleteResult,
	renderExpenseMutationResult,
	renderExpenseProposal,
	renderExpenseUpdatePreview,
} from "../output/mutation-terminal.js";
import { renderExpense } from "../output/read-terminal.js";
import type { CliRuntime } from "../runtime.js";
import {
	assertNamesAllowed,
	mutationParsed,
	queryParsed,
	withBackend,
	writeMutationSuccess,
} from "./mutation-support.js";

interface ExpenseCreateOptions {
	account?: string;
	accountId?: string;
	amount: string;
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

interface ExpenseUpdateOptions {
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
		"cli/v1/resources:getCurrentCycle",
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
		"cli/v1/resources:listCategories",
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
		"cli/v1/accounts:list",
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
			"cli/v1/resources:listTags",
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

export const runExpenseCreate = async (
	options: ExpenseCreateOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	assertNamesAllowed(
		[options.account, options.category, options.tag],
		globalOptions.nonInteractive
	);
	const date = resolveCommandDate({
		explicitDate: options.date,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	const amount = parseAmount(options.amount);
	const spentOn = validateMutationText(options.spentOn, "--spent-on");
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		const input: Record<string, unknown> = { amount, date: date.date };
		if (spentOn !== undefined) {
			input.spentOn = spentOn;
		}
		if (options.categoryId || options.category) {
			input.categoryId =
				options.categoryId ??
				(await resolveCategoryName(context, options.category ?? "", date.date));
		}
		if (options.withoutAccount) {
			input.accountId = null;
		} else if (options.accountId || options.account) {
			input.accountId =
				options.accountId ??
				(await resolveAccountName(context, options.account ?? ""));
		}
		const tagIds = await resolveTagIds(
			context,
			options.tagId ?? [],
			options.tag ?? []
		);
		if (tagIds.length > 0) {
			input.tagIds = tagIds;
		}

		if (dryRun) {
			const proposal = await queryParsed(
				context,
				"cli/v1/expenses:previewCreate",
				input,
				expenseProposalSchema
			);
			writeMutationSuccess({
				context,
				data: proposal,
				human: renderExpenseProposal(proposal),
				meta: { dryRun: true, ...date },
				runtime,
			});
			return;
		}

		const result = await mutationParsed({
			args: { ...input, idempotencyKey },
			context,
			idempotencyKey,
			name: "cli/v1/expenses:create",
			schema: expenseCreateResultSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: renderExpenseCreateResult(result),
			meta: { dryRun: false, idempotencyKey, ...date },
			runtime,
		});
	});
};

const hasUpdateInput = (options: ExpenseUpdateOptions): boolean =>
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
	options: ExpenseUpdateOptions,
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
		"cli/v1/resources:getCurrentCycle",
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
					"cli/v1/resources:listCategories",
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

const resolveUpdateTagIds = async (
	context: BackendCommandContext,
	options: ExpenseUpdateOptions
): Promise<string[] | undefined> => {
	if (options.clearTags) {
		return [];
	}
	if ((options.tagId?.length ?? 0) === 0 && (options.tag?.length ?? 0) === 0) {
		return undefined;
	}
	return await resolveTagIds(context, options.tagId ?? [], options.tag ?? []);
};

const buildUpdateInput = async (options: {
	amount?: number;
	context: BackendCommandContext;
	current: z.infer<typeof expenseSchema>;
	date?: string;
	expectedRevision: number;
	expenseId: string;
	input: ExpenseUpdateOptions;
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
	const tagIds = await resolveUpdateTagIds(options.context, options.input);
	if (tagIds !== undefined) {
		result.tagIds = tagIds;
	}
	return result;
};

export const runExpenseUpdate = async (
	expenseId: string,
	options: ExpenseUpdateOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	if (!hasUpdateInput(options)) {
		throw new CliError("INVALID_INPUT", "Provide at least one expense change");
	}
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
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
			"Non-interactive updates require --if-revision"
		);
	}
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	const amount =
		options.amount !== undefined ? parseAmount(options.amount) : undefined;
	const date = options.date !== undefined ? parseDate(options.date) : undefined;
	const spentOn = validateMutationText(options.spentOn, "--spent-on");

	await withBackend(command, runtime, async (context) => {
		const current = await queryParsed(
			context,
			"cli/v1/expenses:get",
			{ expenseId },
			expenseSchema
		);
		await assertDateCategoryCompatibility(context, current, options, date);
		const expectedRevision = providedRevision ?? current.revision;
		const input = await buildUpdateInput({
			amount,
			context,
			current,
			date,
			expectedRevision,
			expenseId,
			input: options,
			spentOn,
		});

		if (dryRun) {
			const preview = await queryParsed(
				context,
				"cli/v1/expenses:previewUpdate",
				input,
				expenseUpdatePreviewSchema
			);
			writeMutationSuccess({
				context,
				data: preview,
				human: renderExpenseUpdatePreview(preview),
				meta: { dryRun: true, expectedRevision },
				runtime,
			});
			return;
		}

		try {
			const result = await mutationParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: "cli/v1/expenses:update",
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
			"cli/v1/expenses:get",
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
		name: "cli/v1/expenses:previewDelete",
		schema: expenseDeletePreviewSchema,
	});
	return {
		confirmationToken: preview.confirmationToken,
		expectedRevision: preview.revision,
		message: `${renderExpenseDeletePreview(preview)}\nPermanently delete this expense?`,
	};
};

export const runExpenseDelete = async (
	expenseId: string,
	options: ExpenseDeleteOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const dryRun = options.dryRun === true;
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
		if (dryRun) {
			const preview = await mutationParsed({
				args: { expenseId },
				context,
				name: "cli/v1/expenses:previewDelete",
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
				expenseId,
			});
			confirmationToken = confirmation.confirmationToken;
			expectedRevision = confirmation.expectedRevision;
			const confirmed = await (runtime.confirm ?? confirmDestructiveAction)(
				confirmation.message
			);
			if (!confirmed) {
				throw new CliError(
					"DELETION_CONFIRMATION_REQUIRED",
					"Deletion was not confirmed"
				);
			}
		}
		if (!(confirmationToken && expectedRevision && idempotencyKey)) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Deletion confirmation inputs were not resolved"
			);
		}

		const result = await mutationParsed({
			args: {
				confirmationToken,
				expectedRevision,
				expenseId,
				idempotencyKey,
			},
			context,
			idempotencyKey,
			name: "cli/v1/expenses:remove",
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
