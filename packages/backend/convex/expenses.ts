import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { resolveAccountTypeMetadata } from "./accountTypeHelpers";
import { nullableResolvedAccountTypeFields } from "./accountTypeValidators";
import { actionSourceValidator } from "./domain/actionSource";
import { validateLocalDate } from "./domain/dates";
import {
	commitExpenseCreate,
	commitExpenseDelete,
	commitExpenseUpdate,
	prepareExpenseCreate,
	prepareExpenseUpdate,
} from "./domain/expenseOperations";
import {
	getCurrentUser,
	validateAccountOwnership,
	validateCategoryOwnership,
} from "./helpers";
import { forEachSequential } from "./lib/async";

const expenseDocumentFields = {
	_creationTime: v.number(),
	_id: v.id("expenses"),
	accountId: v.optional(v.id("accounts")),
	amount: v.number(),
	categoryId: v.optional(v.id("categories")),
	createdAt: v.number(),
	createdSource: v.optional(actionSourceValidator),
	cycleId: v.optional(v.id("expense_cycles")),
	date: v.string(),
	lastModifiedSource: v.optional(actionSourceValidator),
	revision: v.optional(v.number()),
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

const presentExpenseDocument = (expense: Doc<"expenses">) => {
	const { normalizedSpentOn: _normalizedSpentOn, ...document } = expense;
	return document;
};

interface ExpenseListFilters {
	accountId?: Id<"accounts">;
	categoryId?: Id<"categories">;
	cycleId?: Id<"expense_cycles">;
	endDate?: string;
	limit?: number;
	offset?: number;
	startDate?: string;
	tagIds?: Id<"tags">[];
	unassigned?: boolean;
	uncategorized?: boolean;
}

const matchesExpenseListFilters = (
	expense: Doc<"expenses">,
	args: ExpenseListFilters
): boolean =>
	(!args.cycleId || expense.cycleId === args.cycleId) &&
	(!args.categoryId || expense.categoryId === args.categoryId) &&
	(!args.accountId || expense.accountId === args.accountId) &&
	(!args.unassigned || expense.accountId === undefined) &&
	(!args.uncategorized || expense.categoryId === undefined) &&
	(!args.startDate || expense.date >= args.startDate) &&
	(!args.endDate || expense.date < args.endDate) &&
	(args.tagIds ?? []).every((tagId) => expense.tagIds?.includes(tagId));

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
	await forEachSequential(args.tagIds ?? [], async (tagId) => {
		const tag = await ctx.db.get(tagId);
		if (!tag || tag.userId !== userId) {
			throw new ConvexError("NOT_FOUND");
		}
	});
};

const getCandidateExpenses = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	args: ExpenseListFilters
): Promise<Doc<"expenses">[]> => {
	if (args.unassigned || args.uncategorized || args.startDate || args.endDate) {
		const filteredExpenses = ctx.db
			.query("expenses")
			.withIndex("by_userId_date_createdAt", (q) => {
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
			.filter((q) =>
				q.and(
					...(args.unassigned ? [q.eq(q.field("accountId"), undefined)] : []),
					...(args.uncategorized
						? [q.eq(q.field("categoryId"), undefined)]
						: [])
				)
			)
			.order("desc");
		const matches: Doc<"expenses">[] = [];
		// Cap matching results, not candidates: other filters must not hide
		// historical matches inside an explicitly requested date range.
		for await (const expense of filteredExpenses) {
			if (matchesExpenseListFilters(expense, args)) {
				matches.push(expense);
				if (matches.length === MAX_EXPENSE_QUERY_RESULTS) {
					break;
				}
			}
		}
		return matches;
	}
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
		...presentExpenseDocument(expense),
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
		accountId: v.optional(v.id("accounts")),
		categoryId: v.optional(v.id("categories")),
		cycleId: v.optional(v.id("expense_cycles")),
		endDate: v.optional(v.string()),
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
		startDate: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
		unassigned: v.optional(v.boolean()),
		uncategorized: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		validateListPagination(args);
		if (args.startDate !== undefined) {
			validateLocalDate(args.startDate);
		}
		if (args.endDate !== undefined) {
			validateLocalDate(args.endDate);
		}
		if (args.startDate && args.endDate && args.startDate > args.endDate) {
			throw new ConvexError("INVALID_DATE_RANGE");
		}
		if (
			(args.accountId && args.unassigned) ||
			(args.categoryId && args.uncategorized)
		) {
			throw new ConvexError("INVALID_FILTERS");
		}
		await validateExpenseListOwnershipFilters(ctx, user._id, args);
		let expenses = await getCandidateExpenses(ctx, user._id, args);

		expenses = expenses.filter((expense) => expense.userId === user._id);

		expenses = expenses.filter((expense) =>
			matchesExpenseListFilters(expense, args)
		);
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
	returns: v.array(resolvedExpenseValidator),
});

export const listRecent = query({
	args: {
		limit: v.optional(v.number()),
	},
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
	returns: v.array(resolvedExpenseValidator),
});

export const get = query({
	args: { expenseId: v.id("expenses") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expense = await ctx.db.get(args.expenseId);

		if (!expense || expense.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}

		return await enrichExpense(ctx, expense, user._id);
	},
	returns: resolvedExpenseValidator,
});

export const create = mutation({
	args: {
		accountId: v.optional(v.union(v.id("accounts"), v.null())),
		amount: v.number(),
		categoryId: v.optional(v.id("categories")),
		date: v.optional(v.string()),
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const prepared = await prepareExpenseCreate(ctx, { input: args, user });
		const expense = await commitExpenseCreate(ctx, {
			prepared,
			source: "web",
			userId: user._id,
		});
		return presentExpenseDocument(expense);
	},
	returns: expenseValidator,
});

export const update = mutation({
	args: {
		accountId: v.optional(v.union(v.id("accounts"), v.null())),
		amount: v.optional(v.number()),
		categoryId: v.optional(v.union(v.id("categories"), v.null())),
		date: v.optional(v.string()),
		id: v.id("expenses"),
		spentOn: v.optional(v.union(v.string(), v.null())),
		tagIds: v.optional(v.array(v.id("tags"))),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const prepared = await prepareExpenseUpdate(ctx, {
			expenseId: args.id,
			input: args,
			user,
		});
		return presentExpenseDocument(
			await commitExpenseUpdate(ctx, prepared, "web")
		);
	},
	returns: expenseValidator,
});

export const remove = mutation({
	args: { id: v.id("expenses") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await commitExpenseDelete(ctx, {
			expenseId: args.id,
			source: "web",
			userId: user._id,
		});
		return { success: true as const };
	},
	returns: v.object({ success: v.literal(true) }),
});
