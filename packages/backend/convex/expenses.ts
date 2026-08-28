import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { resolveAccountTypeMetadata } from "./accountTypeHelpers";
import { nullableResolvedAccountTypeFields } from "./accountTypeValidators";
import {
	applyAccountBalanceChange,
	findCycleForDate,
	getCurrentUser,
	validateAccountOwnership,
	validateCategoryOwnership,
} from "./helpers";

const expenseDocumentFields = {
	_id: v.id("expenses"),
	_creationTime: v.number(),
	accountId: v.optional(v.id("accounts")),
	amount: v.number(),
	categoryId: v.optional(v.id("categories")),
	createdAt: v.number(),
	cycleId: v.optional(v.id("expense_cycles")),
	date: v.string(),
	spentOn: v.optional(v.string()),
	tagIds: v.optional(v.array(v.id("tags"))),
	userId: v.id("users"),
} as const;

const expenseValidator = v.object(expenseDocumentFields);

const resolvedExpenseValidator = v.object({
	...expenseDocumentFields,
	...nullableResolvedAccountTypeFields,
	accountName: v.union(v.string(), v.null()),
	categoryIcon: v.union(v.string(), v.null()),
	categoryName: v.union(v.string(), v.null()),
	categoryTypeColor: v.union(v.string(), v.null()),
	cycleName: v.union(v.string(), v.null()),
	tagNames: v.array(v.string()),
});

const MAX_EXPENSE_QUERY_RESULTS = 500;
const MAX_RECENT_EXPENSES = 100;
const MAX_TAG_FILTERS = 100;

interface ExpenseListFilters {
	accountId?: Id<"accounts">;
	categoryId?: Id<"categories">;
	cycleId?: Id<"expense_cycles">;
	endDate?: string;
	limit?: number;
	offset?: number;
	startDate?: string;
	tagIds?: Id<"tags">[];
}

const getExpenseAfterWrite = async (
	ctx: MutationCtx,
	expenseId: Id<"expenses">
) => {
	const expense = await ctx.db.get(expenseId);
	if (!expense) {
		throw new ConvexError("EXPENSE_NOT_FOUND");
	}
	return expense;
};

const normalizeRecentLimit = (limit?: number) => {
	if (limit === undefined) {
		return 5;
	}
	if (!(Number.isInteger(limit) && limit > 0)) {
		throw new ConvexError("INVALID_LIMIT");
	}
	return Math.min(limit, MAX_RECENT_EXPENSES);
};

const validateListPagination = (args: ExpenseListFilters) => {
	if (
		args.offset !== undefined &&
		!(Number.isInteger(args.offset) && args.offset >= 0)
	) {
		throw new ConvexError("INVALID_OFFSET");
	}
	if (
		args.limit !== undefined &&
		!(Number.isInteger(args.limit) && args.limit > 0)
	) {
		throw new ConvexError("INVALID_LIMIT");
	}
};

const validateExpenseListOwnershipFilters = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	args: ExpenseListFilters
) => {
	if (args.accountId) {
		await validateAccountOwnership(ctx, args.accountId, userId);
	}
	if (args.categoryId) {
		await validateCategoryOwnership(ctx, args.categoryId, userId);
	}
	if (args.cycleId) {
		const cycle = await ctx.db.get(args.cycleId);
		if (!cycle || cycle.userId !== userId) {
			throw new ConvexError("NOT_FOUND");
		}
	}
	if ((args.tagIds?.length ?? 0) > MAX_TAG_FILTERS) {
		throw new ConvexError("TOO_MANY_TAG_FILTERS");
	}
	for (const tagId of args.tagIds ?? []) {
		const tag = await ctx.db.get(tagId);
		if (!tag || tag.userId !== userId) {
			throw new ConvexError("NOT_FOUND");
		}
	}
};

const getCandidateExpenses = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	args: ExpenseListFilters
): Promise<Doc<"expenses">[]> => {
	if (args.accountId) {
		return await ctx.db
			.query("expenses")
			.withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
			.order("desc")
			.take(MAX_EXPENSE_QUERY_RESULTS);
	}
	if (args.categoryId) {
		return await ctx.db
			.query("expenses")
			.withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
			.order("desc")
			.take(MAX_EXPENSE_QUERY_RESULTS);
	}
	if (args.cycleId) {
		return await ctx.db
			.query("expenses")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", args.cycleId))
			.order("desc")
			.take(MAX_EXPENSE_QUERY_RESULTS);
	}
	return await ctx.db
		.query("expenses")
		.withIndex("by_userId_date", (q) => {
			const userExpenses = q.eq("userId", userId);
			if (args.startDate && args.endDate) {
				return userExpenses
					.gte("date", args.startDate)
					.lt("date", args.endDate);
			}
			if (args.startDate) {
				return userExpenses.gte("date", args.startDate);
			}
			if (args.endDate) {
				return userExpenses.lt("date", args.endDate);
			}
			return userExpenses;
		})
		.order("desc")
		.take(MAX_EXPENSE_QUERY_RESULTS);
};

const enrichExpense = async (
	ctx: QueryCtx,
	expense: Doc<"expenses">,
	userId: Id<"users">
) => {
	const [categoryDocument, cycleDocument, accountDocument, tagDocuments] =
		await Promise.all([
			expense.categoryId ? ctx.db.get(expense.categoryId) : null,
			expense.cycleId ? ctx.db.get(expense.cycleId) : null,
			expense.accountId ? ctx.db.get(expense.accountId) : null,
			expense.tagIds
				? Promise.all(expense.tagIds.map((tagId) => ctx.db.get(tagId)))
				: [],
		]);
	const category =
		categoryDocument?.userId === userId ? categoryDocument : null;
	const cycle = cycleDocument?.userId === userId ? cycleDocument : null;
	const account = accountDocument?.userId === userId ? accountDocument : null;
	const categoryTypeDocument = category?.categoryTypeId
		? await ctx.db.get(category.categoryTypeId)
		: null;
	const categoryType =
		categoryTypeDocument?.userId === userId ? categoryTypeDocument : null;
	const accountTypeMetadata = account
		? await resolveAccountTypeMetadata(ctx, account.accountTypeId, userId)
		: null;

	return {
		...expense,
		accountName: account?.name ?? null,
		accountTypeBalanceNature:
			accountTypeMetadata?.accountTypeBalanceNature ?? null,
		accountTypeColor: accountTypeMetadata?.accountTypeColor ?? null,
		accountTypeIcon: accountTypeMetadata?.accountTypeIcon ?? null,
		accountTypeId: account?.accountTypeId ?? null,
		accountTypeName: accountTypeMetadata?.accountTypeName ?? null,
		categoryIcon: category?.icon ?? null,
		categoryName: category?.name ?? null,
		categoryTypeColor: categoryType?.color ?? null,
		cycleName: cycle?.name ?? null,
		tagNames: tagDocuments
			.filter((tag) => tag?.userId === userId)
			.map((tag) => tag?.name ?? "Unknown"),
	};
};

export const list = query({
	args: {
		cycleId: v.optional(v.id("expense_cycles")),
		categoryId: v.optional(v.id("categories")),
		accountId: v.optional(v.id("accounts")),
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
	},
	returns: v.array(resolvedExpenseValidator),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		validateListPagination(args);
		await validateExpenseListOwnershipFilters(ctx, user._id, args);
		let expenses = await getCandidateExpenses(ctx, user._id, args);

		expenses = expenses.filter((expense) => expense.userId === user._id);

		if (args.cycleId) {
			expenses = expenses.filter((e) => e.cycleId === args.cycleId);
		}
		if (args.categoryId) {
			expenses = expenses.filter((e) => e.categoryId === args.categoryId);
		}
		if (args.accountId) {
			expenses = expenses.filter((e) => e.accountId === args.accountId);
		}
		if (args.startDate) {
			const { startDate } = args;
			expenses = expenses.filter((e) => e.date >= startDate);
		}
		if (args.endDate) {
			const { endDate } = args;
			expenses = expenses.filter((e) => e.date < endDate);
		}
		if (args.tagIds && args.tagIds.length > 0) {
			const { tagIds } = args;
			expenses = expenses.filter((e) =>
				tagIds.every((tid) => e.tagIds?.includes(tid))
			);
		}
		expenses.sort(
			(a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt
		);

		const total = expenses.length;
		const start = args.offset ?? 0;
		const end = args.limit ? start + args.limit : total;
		const pagedExpenses = expenses.slice(start, end);

		return await Promise.all(
			pagedExpenses.map((expense) => enrichExpense(ctx, expense, user._id))
		);
	},
});

export const listRecent = query({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(resolvedExpenseValidator),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const limit = normalizeRecentLimit(args.limit);

		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_userId_date", (q) => q.eq("userId", user._id))
			.order("desc")
			.take(limit);

		return await Promise.all(
			expenses.map((expense) => enrichExpense(ctx, expense, user._id))
		);
	},
});

export const get = query({
	args: { expenseId: v.id("expenses") },
	returns: resolvedExpenseValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expense = await ctx.db.get(args.expenseId);

		if (!expense || expense.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}

		return await enrichExpense(ctx, expense, user._id);
	},
});

export const create = mutation({
	args: {
		amount: v.number(),
		categoryId: v.optional(v.id("categories")),
		accountId: v.optional(v.union(v.id("accounts"), v.null())),
		date: v.optional(v.string()),
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
	},
	returns: expenseValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const date = args.date || new Date().toISOString().split("T")[0];
		const cycleId = await resolveExpenseCycleId(ctx, {
			userId: user._id,
			date,
			categoryId: args.categoryId,
		});
		const accountId = args.accountId ?? undefined;
		await validateExpenseAccountForWrite(ctx, {
			userId: user._id,
			accountId,
		});

		const id = await ctx.db.insert("expenses", {
			userId: user._id,
			cycleId,
			categoryId: args.categoryId,
			accountId,
			amount: args.amount,
			date,
			spentOn: args.spentOn,
			tagIds: args.tagIds,
			createdAt: Date.now(),
		});

		if (accountId) {
			await applyAccountBalanceChange(ctx, {
				userId: user._id,
				accountId,
				type: "expense",
				amount: -args.amount,
				date,
				note: args.spentOn,
				expenseId: id,
			});
		}

		return await getExpenseAfterWrite(ctx, id);
	},
});

export const update = mutation({
	args: {
		id: v.id("expenses"),
		amount: v.optional(v.number()),
		categoryId: v.optional(v.id("categories")),
		accountId: v.optional(v.union(v.id("accounts"), v.null())),
		date: v.optional(v.string()),
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
	},
	returns: expenseValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expense = await ctx.db.get(args.id);
		if (!expense || expense.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}

		const updates: Partial<Doc<"expenses">> = {};
		if (args.amount !== undefined) {
			updates.amount = args.amount;
		}
		if (args.spentOn !== undefined) {
			updates.spentOn = args.spentOn;
		}
		if (args.tagIds !== undefined) {
			updates.tagIds = args.tagIds;
		}
		if (args.date !== undefined) {
			updates.date = args.date;
		}
		if (args.categoryId !== undefined) {
			updates.categoryId = args.categoryId;
		}
		if (args.accountId !== undefined) {
			updates.accountId = args.accountId ?? undefined;
		}

		const targetDate = updates.date || expense.date;
		const targetCategoryId =
			args.categoryId === undefined ? expense.categoryId : args.categoryId;
		const targetAccountId =
			args.accountId === undefined
				? expense.accountId
				: (args.accountId ?? undefined);

		updates.cycleId = await resolveExpenseCycleId(ctx, {
			userId: user._id,
			date: targetDate,
			categoryId: targetCategoryId,
		});
		await validateExpenseAccountForWrite(ctx, {
			userId: user._id,
			accountId: targetAccountId,
			previousAccountId: expense.accountId,
		});

		await ctx.db.patch(args.id, updates);

		await applyExpenseAccountBalanceUpdate(ctx, {
			userId: user._id,
			expenseId: args.id,
			previousAccountId: expense.accountId,
			nextAccountId: targetAccountId,
			previousAmount: expense.amount,
			nextAmount: updates.amount ?? expense.amount,
			date: targetDate,
			note: updates.spentOn ?? expense.spentOn,
		});

		return await getExpenseAfterWrite(ctx, args.id);
	},
});

export const remove = mutation({
	args: { id: v.id("expenses") },
	returns: v.object({ success: v.literal(true) }),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expense = await ctx.db.get(args.id);
		if (!expense || expense.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}
		if (expense.accountId) {
			await applyAccountBalanceChange(ctx, {
				userId: user._id,
				accountId: expense.accountId,
				type: "expense",
				amount: expense.amount,
				date: expense.date,
				note: "Expense deleted",
				expenseId: expense._id,
				allowArchived: true,
			});
		}
		await ctx.db.delete(args.id);
		return { success: true as const };
	},
});

async function resolveExpenseCycleId(
	ctx: MutationCtx,
	args: {
		userId: Id<"users">;
		date: string;
		categoryId?: Id<"categories">;
	}
) {
	if (!args.categoryId) {
		const cycle = await findCycleForDate(ctx, args.userId, args.date);
		return cycle?._id;
	}

	const category = await validateCategoryOwnership(
		ctx,
		args.categoryId,
		args.userId
	);
	const cycle = await ctx.db.get(category.cycleId);
	if (cycle && (args.date < cycle.startDate || args.date >= cycle.endDate)) {
		const derivedCycle = await findCycleForDate(ctx, args.userId, args.date);
		if (derivedCycle?._id !== category.cycleId) {
			throw new ConvexError("CATEGORY_CYCLE_MISMATCH");
		}
	}

	return category.cycleId;
}

async function validateExpenseAccountForWrite(
	ctx: MutationCtx,
	args: {
		userId: Id<"users">;
		accountId?: Id<"accounts">;
		previousAccountId?: Id<"accounts">;
	}
) {
	if (!args.accountId) {
		return;
	}

	const account = await validateAccountOwnership(
		ctx,
		args.accountId,
		args.userId
	);
	const isExistingAccount = args.accountId === args.previousAccountId;
	if (account.isArchived && !isExistingAccount) {
		throw new ConvexError("ACCOUNT_ARCHIVED");
	}
}

async function applyExpenseAccountBalanceUpdate(
	ctx: MutationCtx,
	args: {
		userId: Id<"users">;
		expenseId: Id<"expenses">;
		previousAccountId?: Id<"accounts">;
		nextAccountId?: Id<"accounts">;
		previousAmount: number;
		nextAmount: number;
		date: string;
		note?: string;
	}
) {
	if (args.previousAccountId === args.nextAccountId) {
		if (!args.nextAccountId) {
			return;
		}

		const balanceDelta = args.previousAmount - args.nextAmount;
		if (balanceDelta === 0) {
			return;
		}

		await applyAccountBalanceChange(ctx, {
			userId: args.userId,
			accountId: args.nextAccountId,
			type: "expense",
			amount: balanceDelta,
			date: args.date,
			note: args.note,
			expenseId: args.expenseId,
			allowArchived: true,
		});
		return;
	}

	if (args.previousAccountId) {
		await applyAccountBalanceChange(ctx, {
			userId: args.userId,
			accountId: args.previousAccountId,
			type: "expense",
			amount: args.previousAmount,
			date: args.date,
			note: "Expense moved from account",
			expenseId: args.expenseId,
			allowArchived: true,
		});
	}

	if (args.nextAccountId) {
		await applyAccountBalanceChange(ctx, {
			userId: args.userId,
			accountId: args.nextAccountId,
			type: "expense",
			amount: -args.nextAmount,
			date: args.date,
			note: args.note,
			expenseId: args.expenseId,
		});
	}
}
