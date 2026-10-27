import {
	paginationOptsValidator,
	paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { resolveAccountTypeMetadata } from "./accountTypeHelpers";
import { resolvedAccountTypeFields } from "./accountTypeValidators";
import {
	commitAccountArchive,
	commitAccountCreate,
	commitAccountUpdate,
	commitBalanceAdjustment,
	commitTransfer,
	normalizeCurrencyCode,
	prepareAccountCreate,
	prepareBalanceAdjustment,
	prepareTransfer,
} from "./domain/accountOperations";
import { actionSourceValidator } from "./domain/actionSource";
import { getCurrentUser, validateAccountOwnership } from "./helpers";

const accountTransactionValidator = v.object({
	_creationTime: v.number(),
	_id: v.id("account_transactions"),
	accountId: v.id("accounts"),
	amount: v.number(),
	balanceAfter: v.number(),
	createdAt: v.number(),
	date: v.string(),
	expenseId: v.optional(v.id("expenses")),
	note: v.optional(v.string()),
	source: v.optional(actionSourceValidator),
	transferId: v.optional(v.id("account_transfers")),
	type: v.union(
		v.literal("opening_balance"),
		v.literal("expense"),
		v.literal("manual_adjustment"),
		v.literal("transfer_in"),
		v.literal("transfer_out")
	),
	userId: v.id("users"),
});

const accountDocumentFields = {
	_creationTime: v.number(),
	_id: v.id("accounts"),
	accountTypeId: v.id("account_types"),
	createdAt: v.number(),
	createdSource: v.optional(actionSourceValidator),
	currency: v.optional(v.string()),
	currentBalance: v.number(),
	isArchived: v.optional(v.boolean()),
	lastModifiedSource: v.optional(actionSourceValidator),
	name: v.string(),
	revision: v.optional(v.number()),
	startingBalance: v.number(),
	updatedAt: v.optional(v.number()),
	userId: v.id("users"),
} as const;

const resolvedAccountValidator = v.object({
	...accountDocumentFields,
	...resolvedAccountTypeFields,
});

const accountTransferValidator = v.object({
	_creationTime: v.number(),
	_id: v.id("account_transfers"),
	amount: v.number(),
	createdAt: v.number(),
	date: v.string(),
	fromAccountId: v.id("accounts"),
	note: v.optional(v.string()),
	source: v.optional(actionSourceValidator),
	toAccountId: v.id("accounts"),
	userId: v.id("users"),
});

const MAX_DASHBOARD_ACCOUNTS = 1000;
const MAX_LIST_ACCOUNTS = 1000;
const MAX_TRANSACTION_RESULTS = 500;

const normalizeResultLimit = (limit: number | undefined, fallback: number) => {
	if (limit === undefined) {
		return fallback;
	}
	if (!(Number.isInteger(limit) && limit > 0)) {
		throw new ConvexError("INVALID_LIMIT");
	}
	return Math.min(limit, MAX_TRANSACTION_RESULTS);
};

const resolveAccount = async (
	ctx: QueryCtx | MutationCtx,
	account: Doc<"accounts">,
	userId: Id<"users">
) => ({
	...account,
	...(await resolveAccountTypeMetadata(ctx, account.accountTypeId, userId)),
});

export const list = query({
	args: {
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const accounts = await ctx.db
			.query("accounts")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.take(MAX_LIST_ACCOUNTS);

		const visibleAccounts = args.includeArchived
			? accounts
			: accounts.filter((account) => !account.isArchived);

		const sortedAccounts = visibleAccounts.sort((a, b) => {
			const archivedDiff =
				Number(a.isArchived ?? false) - Number(b.isArchived ?? false);
			if (archivedDiff !== 0) {
				return archivedDiff;
			}
			return a.name.localeCompare(b.name);
		});

		return await Promise.all(
			sortedAccounts.map((account) => resolveAccount(ctx, account, user._id))
		);
	},
	returns: v.array(resolvedAccountValidator),
});

export const getSummary = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		const [currentActiveAccounts, legacyActiveAccounts] = await Promise.all([
			ctx.db
				.query("accounts")
				.withIndex("by_userId_archived", (q) =>
					q.eq("userId", user._id).eq("isArchived", false)
				)
				.take(MAX_DASHBOARD_ACCOUNTS + 1),
			ctx.db
				.query("accounts")
				.withIndex("by_userId_archived", (q) =>
					q.eq("userId", user._id).eq("isArchived", undefined)
				)
				.take(MAX_DASHBOARD_ACCOUNTS + 1),
		]);
		const userAccounts = [...currentActiveAccounts, ...legacyActiveAccounts];
		const hasMoreAccounts = userAccounts.length > MAX_DASHBOARD_ACCOUNTS;
		const activeAccountDocuments = userAccounts
			.slice(0, MAX_DASHBOARD_ACCOUNTS)
			.map((account) => ({
				_id: account._id,
				accountTypeId: account.accountTypeId,
				currency:
					normalizeCurrencyCode(account.currency ?? user.currency) ?? "USD",
				currentBalance: account.currentBalance,
				isDefault: user.defaultAccountId === account._id,
				name: account.name,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
		const activeAccounts = await Promise.all(
			activeAccountDocuments.map(async (account) => ({
				...account,
				...(await resolveAccountTypeMetadata(
					ctx,
					account.accountTypeId,
					user._id
				)),
			}))
		);

		const totalsByCurrency = new Map<string, number>();
		for (const account of activeAccounts) {
			totalsByCurrency.set(
				account.currency,
				(totalsByCurrency.get(account.currency) ?? 0) + account.currentBalance
			);
		}

		return {
			accounts: activeAccounts,
			accountsOnboardingStatus: user.accountsOnboardingStatus,
			hasMoreAccounts,
			totals: Array.from(totalsByCurrency, ([currency, total]) => ({
				currency,
				total,
			})).sort((a, b) => a.currency.localeCompare(b.currency)),
		};
	},
	returns: v.object({
		accounts: v.array(
			v.object({
				_id: v.id("accounts"),
				accountTypeId: v.id("account_types"),
				name: v.string(),
				...resolvedAccountTypeFields,
				currency: v.string(),
				currentBalance: v.number(),
				isDefault: v.boolean(),
			})
		),
		accountsOnboardingStatus: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("skipped"),
				v.literal("completed")
			)
		),
		hasMoreAccounts: v.boolean(),
		totals: v.array(
			v.object({
				currency: v.string(),
				total: v.number(),
			})
		),
	}),
});

export const get = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const account = await validateAccountOwnership(
			ctx,
			args.accountId,
			user._id
		);
		return await resolveAccount(ctx, account, user._id);
	},
	returns: resolvedAccountValidator,
});

export const create = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		currency: v.optional(v.string()),
		name: v.string(),
		startingBalance: v.number(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const prepared = await prepareAccountCreate(ctx, { ...args, user });
		const { account } = await commitAccountCreate(ctx, {
			prepared,
			source: "web",
			user,
		});
		return await resolveAccount(ctx, account, user._id);
	},
	returns: resolvedAccountValidator,
});

export const update = mutation({
	args: {
		accountId: v.id("accounts"),
		accountTypeId: v.optional(v.id("account_types")),
		currency: v.optional(v.string()),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const account = await commitAccountUpdate(ctx, {
			accountId: args.accountId,
			input: args,
			source: "web",
			userId: user._id,
		});
		return await resolveAccount(ctx, account, user._id);
	},
	returns: resolvedAccountValidator,
});

export const createOnboardingAccount = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		name: v.string(),
		openingBalance: v.number(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user.onboardingCycleId) {
			throw new ConvexError("ONBOARDING_CYCLE_REQUIRED");
		}

		const now = Date.now();
		const prepared = await prepareAccountCreate(ctx, {
			accountTypeId: args.accountTypeId,
			name: args.name,
			now,
			persistCurrency: false,
			startingBalance: args.openingBalance,
			user,
		});
		const { account } = await commitAccountCreate(ctx, {
			now,
			prepared,
			source: "web",
			user,
		});

		await ctx.db.patch(user._id, {
			accountsOnboardingStatus: "completed",
			defaultAccountId: user.defaultAccountId ?? account._id,
			onboardingCompletedAt: now,
			onboardingStep: "complete",
		});

		return account._id;
	},
	returns: v.id("accounts"),
});

export const archive = mutation({
	args: {
		accountId: v.id("accounts"),
		isArchived: v.boolean(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const account = await commitAccountArchive(ctx, {
			...args,
			source: "web",
			user,
		});
		return await resolveAccount(ctx, account, user._id);
	},
	returns: resolvedAccountValidator,
});

export const updateBalance = mutation({
	args: {
		accountId: v.id("accounts"),
		date: v.optional(v.string()),
		newBalance: v.number(),
		note: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const prepared = await prepareBalanceAdjustment(ctx, { ...args, user });
		const { account } = await commitBalanceAdjustment(ctx, prepared, "web");
		return await resolveAccount(ctx, account, user._id);
	},
	returns: resolvedAccountValidator,
});

export const transfer = mutation({
	args: {
		amount: v.number(),
		date: v.optional(v.string()),
		fromAccountId: v.id("accounts"),
		note: v.optional(v.string()),
		toAccountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const prepared = await prepareTransfer(ctx, { ...args, user });
		const result = await commitTransfer(ctx, prepared, "web");
		return {
			fromAccount: await resolveAccount(ctx, result.fromAccount, user._id),
			toAccount: await resolveAccount(ctx, result.toAccount, user._id),
			transfer: result.transfer,
		};
	},
	returns: v.object({
		fromAccount: resolvedAccountValidator,
		toAccount: resolvedAccountValidator,
		transfer: accountTransferValidator,
	}),
});

export const listTransactions = query({
	args: {
		accountId: v.optional(v.id("accounts")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const limit = normalizeResultLimit(args.limit, 100);

		if (args.accountId) {
			const { accountId } = args;
			await validateAccountOwnership(ctx, accountId, user._id);
			return await ctx.db
				.query("account_transactions")
				.withIndex("by_accountId_date", (q) => q.eq("accountId", accountId))
				.order("desc")
				.take(limit);
		}

		return await ctx.db
			.query("account_transactions")
			.withIndex("by_userId_date", (q) => q.eq("userId", user._id))
			.order("desc")
			.take(limit);
	},
	returns: v.array(accountTransactionValidator),
});

export const listTransactionsPaginated = query({
	args: {
		accountId: v.id("accounts"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateAccountOwnership(ctx, args.accountId, user._id);
		return await ctx.db
			.query("account_transactions")
			.withIndex("by_accountId_date", (q) => q.eq("accountId", args.accountId))
			.order("desc")
			.paginate(args.paginationOpts);
	},
	returns: paginationResultValidator(accountTransactionValidator),
});
