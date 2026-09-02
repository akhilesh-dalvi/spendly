// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	applyAccountBalanceChange,
	findCycleForDate,
	validateAccountOwnership,
	validateCategoryOwnership,
} from "../helpers";
import { resolveLocalDate } from "./dates";
import { assertRevision, INITIAL_REVISION, nextRevision } from "./revisions";

const MAXIMUM_CATEGORY_HISTORY_CANDIDATES = 500;
const MINIMUM_EXPENSE_AMOUNT = 0.01;

export type CategorySource = "explicit" | "history" | "none";
export type AccountSource = "explicit" | "user_default" | "none";

export interface ExpenseCreateInput {
	accountId?: Id<"accounts"> | null;
	amount: number;
	categoryId?: Id<"categories"> | null;
	date?: string;
	spentOn?: string;
	tagIds?: Id<"tags">[];
}

export interface PreparedExpenseCreate {
	accountId?: Id<"accounts">;
	accountSource: AccountSource;
	amount: number;
	categoryId?: Id<"categories">;
	categorySource: CategorySource;
	currency: string;
	cycleId?: Id<"expense_cycles">;
	date: string;
	spentOn?: string;
	tagIds: Id<"tags">[];
}

export interface ExpenseUpdateInput {
	accountId?: Id<"accounts"> | null;
	amount?: number;
	categoryId?: Id<"categories"> | null;
	date?: string;
	expectedRevision?: number;
	spentOn?: string | null;
	tagIds?: Id<"tags">[];
}

export interface PreparedExpenseUpdate {
	after: Doc<"expenses">;
	before: Doc<"expenses">;
}

const normalizeAmount = (amount: number): number => {
	if (!Number.isFinite(amount) || amount < MINIMUM_EXPENSE_AMOUNT) {
		throw new ConvexError("INVALID_EXPENSE_AMOUNT");
	}
	return amount;
};

const normalizeOptionalText = (
	value: string | null | undefined
): string | undefined => {
	if (value === null || value === undefined) {
		return undefined;
	}
	const normalized = value.trim();
	if (normalized.length === 0) {
		throw new ConvexError("EMPTY_TEXT_REQUIRES_EXPLICIT_CLEAR");
	}
	return normalized;
};

const normalizeCurrency = (currency: string | undefined): string =>
	currency?.trim().toUpperCase() || "USD";

const previousYearDate = (date: string): string => {
	const parsed = new Date(`${date}T00:00:00.000Z`);
	parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
	return parsed.toISOString().slice(0, 10);
};

const validateTagOwnership = async (
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	tagIds: Id<"tags">[]
): Promise<Id<"tags">[]> => {
	const uniqueTagIds = [...new Set(tagIds)];
	for (const tagId of uniqueTagIds) {
		const tag = await ctx.db.get(tagId);
		if (!tag || tag.userId !== userId) {
			throw new ConvexError("TAG_NOT_FOUND");
		}
	}
	return uniqueTagIds;
};

const inferCategory = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		cycleId?: Id<"expense_cycles">;
		date: string;
		spentOn?: string;
		userId: Id<"users">;
	}
): Promise<Id<"categories"> | undefined> => {
	if (!(options.spentOn && options.cycleId)) {
		return undefined;
	}
	const cycleId = options.cycleId;
	const normalizedSpentOn = options.spentOn.toLocaleLowerCase();
	const candidates = await ctx.db
		.query("expenses")
		.withIndex("by_userId_date", (queryBuilder) =>
			queryBuilder
				.eq("userId", options.userId)
				.gte("date", previousYearDate(options.date))
				.lt("date", options.date)
		)
		.order("desc")
		.take(MAXIMUM_CATEGORY_HISTORY_CANDIDATES);
	const matchingExpenses = candidates
		.filter(
			(expense) =>
				expense.categoryId &&
				expense.spentOn?.trim().toLocaleLowerCase() === normalizedSpentOn
		)
		.slice(0, 3);
	if (matchingExpenses.length < 3) {
		return undefined;
	}
	const historicalCategories = await Promise.all(
		matchingExpenses.map((expense) =>
			expense.categoryId ? ctx.db.get(expense.categoryId) : null
		)
	);
	if (
		historicalCategories.some((category) => category?.userId !== options.userId)
	) {
		return undefined;
	}
	const normalizedNames = new Set(
		historicalCategories.map((category) =>
			category?.name.trim().toLocaleLowerCase()
		)
	);
	if (normalizedNames.size !== 1) {
		return undefined;
	}
	const [historicalName] = normalizedNames;
	if (!historicalName) {
		return undefined;
	}
	const currentCategories = await ctx.db
		.query("categories")
		.withIndex("by_cycleId", (queryBuilder) =>
			queryBuilder.eq("cycleId", cycleId)
		)
		.collect();
	const matches = currentCategories.filter(
		(category) =>
			category.userId === options.userId &&
			!category.isHidden &&
			category.name.trim().toLocaleLowerCase() === historicalName
	);
	return matches.length === 1 ? matches[0]?._id : undefined;
};

const resolveCategoryAndCycle = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		allowInference?: boolean;
		categoryId?: Id<"categories">;
		date: string;
		spentOn?: string;
		userId: Id<"users">;
	}
): Promise<{
	categoryId?: Id<"categories">;
	categorySource: CategorySource;
	cycleId?: Id<"expense_cycles">;
}> => {
	const dateCycle = await findCycleForDate(ctx, options.userId, options.date);
	if (options.categoryId) {
		const category = await validateCategoryOwnership(
			ctx,
			options.categoryId,
			options.userId
		);
		if (category.cycleId !== dateCycle?._id) {
			throw new ConvexError("CATEGORY_CYCLE_MISMATCH");
		}
		return {
			categoryId: category._id,
			categorySource: "explicit",
			cycleId: dateCycle?._id,
		};
	}
	const inferredCategoryId = options.allowInference
		? await inferCategory(ctx, {
				cycleId: dateCycle?._id,
				date: options.date,
				spentOn: options.spentOn,
				userId: options.userId,
			})
		: undefined;
	return {
		categoryId: inferredCategoryId,
		categorySource: inferredCategoryId ? "history" : "none",
		cycleId: dateCycle?._id,
	};
};

const resolveAccount = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		accountId?: Id<"accounts"> | null;
		previousAccountId?: Id<"accounts">;
		user: Doc<"users">;
	}
): Promise<{
	accountId?: Id<"accounts">;
	accountSource: AccountSource;
	currency: string;
}> => {
	const accountId =
		options.accountId === undefined
			? options.user.defaultAccountId
			: (options.accountId ?? undefined);
	if (!accountId) {
		return {
			accountSource: "none",
			currency: normalizeCurrency(options.user.currency),
		};
	}
	const account = await validateAccountOwnership(
		ctx,
		accountId,
		options.user._id
	);
	const isExistingAccount = accountId === options.previousAccountId;
	if (account.isArchived && !isExistingAccount) {
		throw new ConvexError("ACCOUNT_ARCHIVED");
	}
	return {
		accountId,
		accountSource:
			options.accountId === undefined ? "user_default" : "explicit",
		currency: normalizeCurrency(account.currency ?? options.user.currency),
	};
};

export const prepareExpenseCreate = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		input: ExpenseCreateInput;
		now?: number;
		user: Doc<"users">;
	}
): Promise<PreparedExpenseCreate> => {
	const now = options.now ?? Date.now();
	const date = resolveLocalDate(options.input.date, now);
	const spentOn = normalizeOptionalText(options.input.spentOn);
	const [category, account, tagIds] = await Promise.all([
		resolveCategoryAndCycle(ctx, {
			allowInference: true,
			categoryId: options.input.categoryId ?? undefined,
			date,
			spentOn,
			userId: options.user._id,
		}),
		resolveAccount(ctx, {
			accountId: options.input.accountId,
			user: options.user,
		}),
		validateTagOwnership(ctx, options.user._id, options.input.tagIds ?? []),
	]);
	return {
		...category,
		...account,
		amount: normalizeAmount(options.input.amount),
		date,
		spentOn,
		tagIds,
	};
};

export const commitExpenseCreate = async (
	ctx: MutationCtx,
	options: {
		prepared: PreparedExpenseCreate;
		userId: Id<"users">;
		now?: number;
	}
): Promise<Doc<"expenses">> => {
	const now = options.now ?? Date.now();
	const expenseId = await ctx.db.insert("expenses", {
		accountId: options.prepared.accountId,
		amount: options.prepared.amount,
		categoryId: options.prepared.categoryId,
		createdAt: now,
		cycleId: options.prepared.cycleId,
		date: options.prepared.date,
		revision: INITIAL_REVISION,
		spentOn: options.prepared.spentOn,
		tagIds:
			options.prepared.tagIds.length > 0 ? options.prepared.tagIds : undefined,
		userId: options.userId,
	});
	if (options.prepared.accountId) {
		await applyAccountBalanceChange(ctx, {
			accountId: options.prepared.accountId,
			amount: -options.prepared.amount,
			date: options.prepared.date,
			expenseId,
			note: options.prepared.spentOn,
			type: "expense",
			userId: options.userId,
		});
	}
	const expense = await ctx.db.get(expenseId);
	if (!expense) {
		throw new ConvexError("EXPENSE_NOT_FOUND");
	}
	return expense;
};

export const prepareExpenseUpdate = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		expenseId: Id<"expenses">;
		input: ExpenseUpdateInput;
		user: Doc<"users">;
	}
): Promise<PreparedExpenseUpdate> => {
	const expense = await ctx.db.get(options.expenseId);
	if (!expense || expense.userId !== options.user._id) {
		throw new ConvexError("EXPENSE_NOT_FOUND");
	}
	if (options.input.expectedRevision !== undefined) {
		assertRevision(
			expense.revision,
			options.input.expectedRevision,
			"EXPENSE_REVISION_CONFLICT"
		);
	}
	const date =
		options.input.date === undefined
			? expense.date
			: resolveLocalDate(options.input.date);
	const spentOn =
		options.input.spentOn === undefined
			? expense.spentOn
			: normalizeOptionalText(options.input.spentOn);
	const categoryId =
		options.input.categoryId === undefined
			? expense.categoryId
			: (options.input.categoryId ?? undefined);
	const accountInput =
		options.input.accountId === undefined
			? (expense.accountId ?? null)
			: options.input.accountId;
	const [category, account, tagIds] = await Promise.all([
		resolveCategoryAndCycle(ctx, {
			allowInference: false,
			categoryId,
			date,
			spentOn,
			userId: options.user._id,
		}),
		resolveAccount(ctx, {
			accountId: accountInput,
			previousAccountId: expense.accountId,
			user: options.user,
		}),
		options.input.tagIds === undefined
			? Promise.resolve(expense.tagIds ?? [])
			: validateTagOwnership(ctx, options.user._id, options.input.tagIds),
	]);
	return {
		after: {
			...expense,
			accountId: account.accountId,
			amount:
				options.input.amount === undefined
					? expense.amount
					: normalizeAmount(options.input.amount),
			categoryId: category.categoryId,
			cycleId: category.cycleId,
			date,
			revision: nextRevision(expense.revision),
			spentOn,
			tagIds: tagIds.length > 0 ? tagIds : undefined,
		},
		before: expense,
	};
};

const applyExpenseAccountBalanceUpdate = async (
	ctx: MutationCtx,
	options: PreparedExpenseUpdate
): Promise<void> => {
	const { before, after } = options;
	if (before.accountId === after.accountId) {
		if (!after.accountId) {
			return;
		}
		const balanceDelta = before.amount - after.amount;
		if (balanceDelta === 0) {
			return;
		}
		await applyAccountBalanceChange(ctx, {
			accountId: after.accountId,
			allowArchived: true,
			amount: balanceDelta,
			date: after.date,
			expenseId: after._id,
			note: after.spentOn,
			type: "expense",
			userId: after.userId,
		});
		return;
	}
	if (before.accountId) {
		await applyAccountBalanceChange(ctx, {
			accountId: before.accountId,
			allowArchived: true,
			amount: before.amount,
			date: after.date,
			expenseId: after._id,
			note: "Expense moved from account",
			type: "expense",
			userId: after.userId,
		});
	}
	if (after.accountId) {
		await applyAccountBalanceChange(ctx, {
			accountId: after.accountId,
			amount: -after.amount,
			date: after.date,
			expenseId: after._id,
			note: after.spentOn,
			type: "expense",
			userId: after.userId,
		});
	}
};

export const commitExpenseUpdate = async (
	ctx: MutationCtx,
	prepared: PreparedExpenseUpdate
): Promise<Doc<"expenses">> => {
	const {
		_creationTime: _ignoredCreationTime,
		_id,
		...updates
	} = prepared.after;
	await ctx.db.patch(_id, updates);
	await applyExpenseAccountBalanceUpdate(ctx, prepared);
	const expense = await ctx.db.get(_id);
	if (!expense) {
		throw new ConvexError("EXPENSE_NOT_FOUND");
	}
	return expense;
};

export const commitExpenseDelete = async (
	ctx: MutationCtx,
	options: {
		expectedRevision?: number;
		expenseId: Id<"expenses">;
		userId: Id<"users">;
	}
): Promise<{ expenseId: Id<"expenses">; revision: number }> => {
	const expense = await ctx.db.get(options.expenseId);
	if (!expense || expense.userId !== options.userId) {
		throw new ConvexError("EXPENSE_NOT_FOUND");
	}
	if (options.expectedRevision !== undefined) {
		assertRevision(
			expense.revision,
			options.expectedRevision,
			"EXPENSE_REVISION_CONFLICT"
		);
	}
	if (expense.accountId) {
		await applyAccountBalanceChange(ctx, {
			accountId: expense.accountId,
			allowArchived: true,
			amount: expense.amount,
			date: expense.date,
			expenseId: expense._id,
			note: "Expense deleted",
			type: "expense",
			userId: options.userId,
		});
	}
	await ctx.db.delete(expense._id);
	return {
		expenseId: expense._id,
		revision: expense.revision ?? INITIAL_REVISION,
	};
};
