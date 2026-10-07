import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { resolveAccountTypeMetadata } from "../../accountTypeHelpers";
import { normalizeCurrencyCode } from "../../domain/accountOperations";
import type { PreparedExpenseCreate } from "../../domain/expenseOperations";
import { getRevision, INITIAL_REVISION } from "../../domain/revisions";

type ReadContext = QueryCtx | MutationCtx;

const timestamp = (value: number): string => new Date(value).toISOString();

export const presentCycleDetail = (cycle: Doc<"expense_cycles">) => ({
	createdAt: timestamp(cycle.createdAt),
	endDateExclusive: cycle.endDate,
	id: cycle._id,
	name: cycle.name,
	startDate: cycle.startDate,
	revision: getRevision(cycle.revision),
});

export const presentAccount = async (
	ctx: ReadContext,
	account: Doc<"accounts">,
	user: Doc<"users">
) => {
	const type = await resolveAccountTypeMetadata(
		ctx,
		account.accountTypeId,
		user._id
	);
	return {
		accountType: {
			balanceNature: type.accountTypeBalanceNature,
			color: type.accountTypeColor,
			icon: type.accountTypeIcon,
			id: account.accountTypeId,
			name: type.accountTypeName,
		},
		createdAt: timestamp(account.createdAt),
		currency: normalizeCurrencyCode(account.currency ?? user.currency) ?? "USD",
		currentBalance: account.currentBalance,
		id: account._id,
		isArchived: account.isArchived ?? false,
		isDefault: user.defaultAccountId === account._id,
		name: account.name,
		revision: getRevision(account.revision),
		startingBalance: account.startingBalance,
		updatedAt: timestamp(account.updatedAt ?? account.createdAt),
	};
};

export const presentExpense = async (
	ctx: ReadContext,
	expense: Doc<"expenses">,
	user: Doc<"users">
) => {
	const [account, category, cycle, tags] = await Promise.all([
		expense.accountId ? ctx.db.get(expense.accountId) : null,
		expense.categoryId ? ctx.db.get(expense.categoryId) : null,
		expense.cycleId ? ctx.db.get(expense.cycleId) : null,
		Promise.all((expense.tagIds ?? []).map((tagId) => ctx.db.get(tagId))),
	]);
	if (account && account.userId !== user._id) {
		throw new ConvexError("EXPENSE_ACCOUNT_OWNERSHIP_INVALID");
	}
	const accountType = account
		? await resolveAccountTypeMetadata(ctx, account.accountTypeId, user._id)
		: null;
	const currency =
		normalizeCurrencyCode(account?.currency ?? user.currency) ?? "USD";
	return {
		account:
			account && accountType
				? {
						accountType: {
							balanceNature: accountType.accountTypeBalanceNature,
							color: accountType.accountTypeColor,
							icon: accountType.accountTypeIcon,
							id: account.accountTypeId,
							name: accountType.accountTypeName,
						},
						currency,
						id: account._id,
						name: account.name,
					}
				: null,
		amount: expense.amount,
		category:
			category?.userId === user._id
				? { id: category._id, name: category.name }
				: null,
		createdAt: timestamp(expense.createdAt),
		currency,
		cycle:
			cycle?.userId === user._id
				? {
						endDateExclusive: cycle.endDate,
						id: cycle._id,
						name: cycle.name,
						startDate: cycle.startDate,
					}
				: null,
		date: expense.date,
		id: expense._id,
		revision: getRevision(expense.revision),
		spentOn: expense.spentOn ?? null,
		tags: tags.flatMap((tag) =>
			tag?.userId === user._id ? [{ id: tag._id, name: tag.name }] : []
		),
	};
};

export const presentExpenseProposal = (
	prepared: PreparedExpenseCreate,
	revision = INITIAL_REVISION
) => ({
	accountId: prepared.accountId ?? null,
	accountSource: prepared.accountSource,
	amount: prepared.amount,
	categoryId: prepared.categoryId ?? null,
	categorySource: prepared.categorySource,
	currency: prepared.currency,
	cycleId: prepared.cycleId ?? null,
	date: prepared.date,
	revision,
	spentOn: prepared.spentOn ?? null,
	tagIds: prepared.tagIds,
});

export const presentTransaction = (
	transaction: Doc<"account_transactions">
) => ({
	accountId: transaction.accountId,
	amount: transaction.amount,
	balanceAfter: transaction.balanceAfter,
	createdAt: timestamp(transaction.createdAt),
	date: transaction.date,
	id: transaction._id,
	note: transaction.note ?? null,
	relatedId: transaction.expenseId ?? transaction.transferId ?? null,
	type: transaction.type,
});

export const requireOwnedExpense = async (
	ctx: ReadContext,
	expenseId: Id<"expenses">,
	userId: Id<"users">
): Promise<Doc<"expenses">> => {
	const expense = await ctx.db.get(expenseId);
	if (!expense || expense.userId !== userId) {
		throw new ConvexError("EXPENSE_NOT_FOUND");
	}
	return expense;
};
