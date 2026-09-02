import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation, query } from "../../_generated/server";
import { validateLocalDate } from "../../domain/dates";
import {
	commitExpenseCreate,
	commitExpenseDelete,
	commitExpenseUpdate,
	prepareExpenseCreate,
	prepareExpenseUpdate,
} from "../../domain/expenseOperations";
import {
	DELETION_CONFIRMATION_LIFETIME_MS,
	executeIdempotentMutation,
} from "../../domain/idempotency";
import { assertRevision, getRevision } from "../../domain/revisions";
import {
	getCurrentUser,
	validateAccountOwnership,
	validateCategoryOwnership,
	validateCycleOwnership,
} from "../../helpers";
import { withCliErrors } from "./errors";
import {
	presentExpense,
	presentExpenseProposal,
	requireOwnedExpense,
} from "./presenters";
import {
	expenseCreateInputValidator,
	expenseProposalValidator,
	expenseSummaryValidator,
	expenseUpdateInputValidator,
} from "./validators";

const DEFAULT_PAGE_SIZE = 50;
const MAXIMUM_PAGE_SIZE = 100;
const MAXIMUM_TAG_FILTERS = 100;

interface ExpenseListFilters {
	accountId?: Id<"accounts">;
	categoryId?: Id<"categories">;
	cycleId?: Id<"expense_cycles">;
	tagIds?: Id<"tags">[];
	unassigned?: boolean;
	uncategorized?: boolean;
}

const normalizeLimit = (limit: number | undefined): number => {
	const resolved = limit ?? DEFAULT_PAGE_SIZE;
	if (
		!(
			Number.isInteger(resolved) &&
			resolved > 0 &&
			resolved <= MAXIMUM_PAGE_SIZE
		)
	) {
		throw new ConvexError("INVALID_LIMIT");
	}
	return resolved;
};

const validateListFilters = async (
	ctx: Parameters<typeof validateAccountOwnership>[0],
	userId: Id<"users">,
	args: {
		accountId?: Id<"accounts">;
		categoryId?: Id<"categories">;
		cycleId?: Id<"expense_cycles">;
	}
): Promise<void> => {
	if (args.accountId) {
		await validateAccountOwnership(ctx, args.accountId, userId);
	}
	if (args.categoryId) {
		await validateCategoryOwnership(ctx, args.categoryId, userId);
	}
	if (args.cycleId) {
		await validateCycleOwnership(ctx, args.cycleId, userId);
	}
};

const validateListOptions = (args: {
	accountId?: Id<"accounts">;
	categoryId?: Id<"categories">;
	from?: string;
	tagIds?: Id<"tags">[];
	to?: string;
	unassigned?: boolean;
	uncategorized?: boolean;
}): void => {
	if ((args.tagIds?.length ?? 0) > MAXIMUM_TAG_FILTERS) {
		throw new ConvexError("INVALID_TAG_FILTERS");
	}
	if (
		(args.categoryId && args.uncategorized) ||
		(args.accountId && args.unassigned)
	) {
		throw new ConvexError("INVALID_FILTERS");
	}
	if (args.from) {
		validateLocalDate(args.from);
	}
	if (args.to) {
		validateLocalDate(args.to);
	}
	if (args.from && args.to && args.from > args.to) {
		throw new ConvexError("INVALID_FILTERS");
	}
};

const matchesListFilters = (
	expense: Doc<"expenses">,
	filters: ExpenseListFilters
): boolean => {
	if (filters.cycleId && expense.cycleId !== filters.cycleId) {
		return false;
	}
	if (filters.categoryId && expense.categoryId !== filters.categoryId) {
		return false;
	}
	if (filters.uncategorized && expense.categoryId !== undefined) {
		return false;
	}
	if (filters.accountId && expense.accountId !== filters.accountId) {
		return false;
	}
	if (filters.unassigned && expense.accountId !== undefined) {
		return false;
	}
	return (filters.tagIds ?? []).every((tagId) =>
		expense.tagIds?.includes(tagId)
	);
};

export const get = query({
	args: { expenseId: v.id("expenses") },
	returns: expenseSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const expense = await requireOwnedExpense(ctx, args.expenseId, user._id);
			return await presentExpense(ctx, expense, user);
		}),
});

export const list = query({
	args: {
		accountId: v.optional(v.id("accounts")),
		categoryId: v.optional(v.id("categories")),
		cursor: v.optional(v.string()),
		cycleId: v.optional(v.id("expense_cycles")),
		from: v.optional(v.string()),
		limit: v.optional(v.number()),
		tagIds: v.optional(v.array(v.id("tags"))),
		to: v.optional(v.string()),
		unassigned: v.optional(v.boolean()),
		uncategorized: v.optional(v.boolean()),
	},
	returns: v.object({
		hasMore: v.boolean(),
		items: v.array(expenseSummaryValidator),
		nextCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			validateListOptions(args);
			await validateListFilters(ctx, user._id, args);
			for (const tagId of args.tagIds ?? []) {
				const tag = await ctx.db.get(tagId);
				if (!tag || tag.userId !== user._id) {
					throw new ConvexError("TAG_NOT_FOUND");
				}
			}
			const page = await ctx.db
				.query("expenses")
				.withIndex("by_userId_date_createdAt", (queryBuilder) => {
					const userExpenses = queryBuilder.eq("userId", user._id);
					if (args.from && args.to) {
						return userExpenses.gte("date", args.from).lte("date", args.to);
					}
					if (args.from) {
						return userExpenses.gte("date", args.from);
					}
					if (args.to) {
						return userExpenses.lte("date", args.to);
					}
					return userExpenses;
				})
				.order("desc")
				.paginate({
					cursor: args.cursor ?? null,
					numItems: normalizeLimit(args.limit),
				});
			const visible = page.page.filter((expense) =>
				matchesListFilters(expense, args)
			);
			return {
				hasMore: !page.isDone,
				items: await Promise.all(
					visible.map((expense) => presentExpense(ctx, expense, user))
				),
				nextCursor: page.isDone ? null : page.continueCursor,
			};
		}),
});

export const previewCreate = query({
	args: expenseCreateInputValidator,
	returns: expenseProposalValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const prepared = await prepareExpenseCreate(ctx, { input: args, user });
			return presentExpenseProposal(prepared);
		}),
});

export const create = mutation({
	args: {
		...expenseCreateInputValidator,
		idempotencyKey: v.string(),
	},
	returns: expenseSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareExpenseCreate(ctx, { input, user });
					const expense = await commitExpenseCreate(ctx, {
						prepared,
						userId: user._id,
					});
					return await presentExpense(ctx, expense, user);
				},
				key: idempotencyKey,
				operation: "expenses.create",
				request: input,
				userId: user._id,
			});
		}),
});

export const previewUpdate = query({
	args: {
		...expenseUpdateInputValidator,
		expenseId: v.id("expenses"),
	},
	returns: v.object({
		after: expenseSummaryValidator,
		before: expenseSummaryValidator,
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { expenseId, ...input } = args;
			const prepared = await prepareExpenseUpdate(ctx, {
				expenseId,
				input,
				user,
			});
			return {
				after: await presentExpense(ctx, prepared.after, user),
				before: await presentExpense(ctx, prepared.before, user),
			};
		}),
});

export const update = mutation({
	args: {
		...expenseUpdateInputValidator,
		expectedRevision: v.number(),
		expenseId: v.id("expenses"),
		idempotencyKey: v.string(),
	},
	returns: expenseSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { expenseId, idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareExpenseUpdate(ctx, {
						expenseId,
						input,
						user,
					});
					const expense = await commitExpenseUpdate(ctx, prepared);
					return await presentExpense(ctx, expense, user);
				},
				key: idempotencyKey,
				operation: "expenses.update",
				request: { expenseId, ...input },
				userId: user._id,
			});
		}),
});

export const previewDelete = mutation({
	args: { expenseId: v.id("expenses") },
	returns: v.object({
		confirmationToken: v.id("cli_deletion_confirmations"),
		expiresAt: v.string(),
		expense: expenseSummaryValidator,
		revision: v.number(),
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const expense = await requireOwnedExpense(ctx, args.expenseId, user._id);
			const now = Date.now();
			const revision = getRevision(expense.revision);
			const expiresAt = now + DELETION_CONFIRMATION_LIFETIME_MS;
			const confirmationToken = await ctx.db.insert(
				"cli_deletion_confirmations",
				{
					createdAt: now,
					expiresAt,
					expenseId: expense._id,
					revision,
					userId: user._id,
				}
			);
			return {
				confirmationToken,
				expiresAt: new Date(expiresAt).toISOString(),
				expense: await presentExpense(ctx, expense, user),
				revision,
			};
		}),
});

export const remove = mutation({
	args: {
		confirmationToken: v.id("cli_deletion_confirmations"),
		expectedRevision: v.number(),
		expenseId: v.id("expenses"),
		idempotencyKey: v.string(),
	},
	returns: v.object({
		deleted: v.literal(true),
		expense: expenseSummaryValidator,
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const confirmation = await ctx.db.get(args.confirmationToken);
					if (
						!confirmation ||
						confirmation.userId !== user._id ||
						confirmation.expenseId !== args.expenseId ||
						confirmation.revision !== args.expectedRevision ||
						confirmation.usedAt !== undefined
					) {
						throw new ConvexError("DELETION_CONFIRMATION_INVALID");
					}
					const now = Date.now();
					if (confirmation.expiresAt <= now) {
						throw new ConvexError("DELETION_CONFIRMATION_EXPIRED");
					}
					const expense = await requireOwnedExpense(
						ctx,
						args.expenseId,
						user._id
					);
					assertRevision(
						expense.revision,
						args.expectedRevision,
						"EXPENSE_REVISION_CONFLICT"
					);
					const presented = await presentExpense(ctx, expense, user);
					await commitExpenseDelete(ctx, {
						expectedRevision: args.expectedRevision,
						expenseId: args.expenseId,
						userId: user._id,
					});
					await ctx.db.patch(confirmation._id, { usedAt: now });
					return { deleted: true as const, expense: presented };
				},
				key: args.idempotencyKey,
				operation: "expenses.delete",
				request: {
					confirmationToken: args.confirmationToken,
					expectedRevision: args.expectedRevision,
					expenseId: args.expenseId,
				},
				userId: user._id,
			});
		}),
});
