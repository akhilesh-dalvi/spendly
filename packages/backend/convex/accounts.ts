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
import {
	resolveAccountTypeMetadata,
	validateActiveAccountType,
} from "./accountTypeHelpers";
import { resolvedAccountTypeFields } from "./accountTypeValidators";
import {
	applyAccountBalanceChange,
	getCurrentUser,
	validateAccountOwnership,
} from "./helpers";

const accountTransactionValidator = v.object({
	_id: v.id("account_transactions"),
	_creationTime: v.number(),
	userId: v.id("users"),
	accountId: v.id("accounts"),
	type: v.union(
		v.literal("opening_balance"),
		v.literal("expense"),
		v.literal("manual_adjustment"),
		v.literal("transfer_in"),
		v.literal("transfer_out")
	),
	amount: v.number(),
	balanceAfter: v.number(),
	date: v.string(),
	note: v.optional(v.string()),
	expenseId: v.optional(v.id("expenses")),
	transferId: v.optional(v.id("account_transfers")),
	createdAt: v.number(),
});

const accountDocumentFields = {
	_id: v.id("accounts"),
	_creationTime: v.number(),
	accountTypeId: v.id("account_types"),
	createdAt: v.number(),
	currency: v.optional(v.string()),
	currentBalance: v.number(),
	isArchived: v.optional(v.boolean()),
	name: v.string(),
	startingBalance: v.number(),
	updatedAt: v.optional(v.number()),
	userId: v.id("users"),
} as const;

const resolvedAccountValidator = v.object({
	...accountDocumentFields,
	...resolvedAccountTypeFields,
});

const accountTransferValidator = v.object({
	_id: v.id("account_transfers"),
	_creationTime: v.number(),
	amount: v.number(),
	createdAt: v.number(),
	date: v.string(),
	fromAccountId: v.id("accounts"),
	note: v.optional(v.string()),
	toAccountId: v.id("accounts"),
	userId: v.id("users"),
});

const MAX_DASHBOARD_ACCOUNTS = 1000;
const MAX_LIST_ACCOUNTS = 1000;
const MAX_TRANSACTION_RESULTS = 500;

const todayIsoDate = () => new Date().toISOString().split("T")[0];

const normalizeCurrencyCode = (currency?: string) =>
	currency?.trim().toUpperCase() || undefined;

const normalizeName = (name: string) => {
	const normalizedName = name.trim();
	if (normalizedName.length === 0) {
		throw new ConvexError("ACCOUNT_NAME_REQUIRED");
	}
	return normalizedName;
};

const assertFiniteAmount = (amount: number, errorCode: string) => {
	if (!Number.isFinite(amount)) {
		throw new ConvexError(errorCode);
	}
};

const assertPositiveAmount = (amount: number, errorCode: string) => {
	assertFiniteAmount(amount, errorCode);
	if (amount <= 0) {
		throw new ConvexError(errorCode);
	}
};

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

const getResolvedAccountAfterWrite = async (
	ctx: MutationCtx,
	accountId: Id<"accounts">,
	userId: Id<"users">
) => {
	const account = await ctx.db.get(accountId);
	if (!account) {
		throw new ConvexError("ACCOUNT_NOT_FOUND");
	}
	return await resolveAccount(ctx, account, userId);
};

export const list = query({
	args: {
		includeArchived: v.optional(v.boolean()),
	},
	returns: v.array(resolvedAccountValidator),
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
});

export const getSummary = query({
	args: {},
	returns: v.object({
		accountsOnboardingStatus: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("skipped"),
				v.literal("completed")
			)
		),
		accounts: v.array(
			v.object({
				_id: v.id("accounts"),
				name: v.string(),
				accountTypeId: v.id("account_types"),
				...resolvedAccountTypeFields,
				currentBalance: v.number(),
				currency: v.string(),
				isDefault: v.boolean(),
			})
		),
		hasMoreAccounts: v.boolean(),
		totals: v.array(
			v.object({
				currency: v.string(),
				total: v.number(),
			})
		),
	}),
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
				name: account.name,
				accountTypeId: account.accountTypeId,
				currentBalance: account.currentBalance,
				currency:
					normalizeCurrencyCode(account.currency ?? user.currency) ?? "USD",
				isDefault: user.defaultAccountId === account._id,
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
			accountsOnboardingStatus: user.accountsOnboardingStatus,
			accounts: activeAccounts,
			hasMoreAccounts,
			totals: Array.from(totalsByCurrency, ([currency, total]) => ({
				currency,
				total,
			})).sort((a, b) => a.currency.localeCompare(b.currency)),
		};
	},
});

export const get = query({
	args: { accountId: v.id("accounts") },
	returns: resolvedAccountValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const account = await validateAccountOwnership(
			ctx,
			args.accountId,
			user._id
		);
		return await resolveAccount(ctx, account, user._id);
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		accountTypeId: v.id("account_types"),
		startingBalance: v.number(),
		currency: v.optional(v.string()),
	},
	returns: resolvedAccountValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const name = normalizeName(args.name);
		assertFiniteAmount(args.startingBalance, "INVALID_STARTING_BALANCE");
		await validateActiveAccountType(ctx, args.accountTypeId, user._id);

		const now = Date.now();
		const accountId = await ctx.db.insert("accounts", {
			userId: user._id,
			name,
			accountTypeId: args.accountTypeId,
			startingBalance: args.startingBalance,
			currentBalance: args.startingBalance,
			currency:
				normalizeCurrencyCode(args.currency) ??
				normalizeCurrencyCode(user.currency),
			isArchived: false,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("account_transactions", {
			userId: user._id,
			accountId,
			type: "opening_balance",
			amount: args.startingBalance,
			balanceAfter: args.startingBalance,
			date: todayIsoDate(),
			note: "Opening balance",
			createdAt: now,
		});

		const userRecord = await ctx.db.get(user._id);
		const userUpdates: {
			defaultAccountId?: typeof accountId;
			accountsOnboardingStatus?: "completed";
		} = {};

		if (!userRecord?.defaultAccountId) {
			userUpdates.defaultAccountId = accountId;
		}
		if (userRecord?.accountsOnboardingStatus !== "completed") {
			userUpdates.accountsOnboardingStatus = "completed";
		}
		if (Object.keys(userUpdates).length > 0) {
			await ctx.db.patch(user._id, userUpdates);
		}

		return await getResolvedAccountAfterWrite(ctx, accountId, user._id);
	},
});

export const update = mutation({
	args: {
		accountId: v.id("accounts"),
		name: v.optional(v.string()),
		accountTypeId: v.optional(v.id("account_types")),
		currency: v.optional(v.string()),
	},
	returns: resolvedAccountValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const account = await validateAccountOwnership(
			ctx,
			args.accountId,
			user._id
		);

		const updates: Partial<Doc<"accounts">> = {
			updatedAt: Date.now(),
		};

		if (args.name !== undefined) {
			updates.name = normalizeName(args.name);
		}
		if (
			args.accountTypeId !== undefined &&
			args.accountTypeId !== account.accountTypeId
		) {
			await validateActiveAccountType(ctx, args.accountTypeId, user._id);
			updates.accountTypeId = args.accountTypeId;
		}
		if (args.currency !== undefined) {
			updates.currency = normalizeCurrencyCode(args.currency);
		}
		await ctx.db.patch(args.accountId, updates);
		return await getResolvedAccountAfterWrite(ctx, args.accountId, user._id);
	},
});

export const createOnboardingAccount = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		name: v.string(),
		openingBalance: v.number(),
	},
	returns: v.id("accounts"),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user.onboardingCycleId) {
			throw new ConvexError("ONBOARDING_CYCLE_REQUIRED");
		}

		const name = normalizeName(args.name);
		assertFiniteAmount(args.openingBalance, "INVALID_OPENING_BALANCE");
		await validateActiveAccountType(ctx, args.accountTypeId, user._id);

		const now = Date.now();
		const accountId = await ctx.db.insert("accounts", {
			accountTypeId: args.accountTypeId,
			createdAt: now,
			currentBalance: args.openingBalance,
			isArchived: false,
			name,
			startingBalance: args.openingBalance,
			updatedAt: now,
			userId: user._id,
		});

		await ctx.db.insert("account_transactions", {
			accountId,
			amount: args.openingBalance,
			balanceAfter: args.openingBalance,
			createdAt: now,
			date: todayIsoDate(),
			note: "Opening balance",
			type: "opening_balance",
			userId: user._id,
		});

		await ctx.db.patch(user._id, {
			accountsOnboardingStatus: "completed",
			defaultAccountId: user.defaultAccountId ?? accountId,
			onboardingCompletedAt: now,
			onboardingStep: "complete",
		});

		return accountId;
	},
});

export const archive = mutation({
	args: {
		accountId: v.id("accounts"),
		isArchived: v.boolean(),
	},
	returns: resolvedAccountValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateAccountOwnership(ctx, args.accountId, user._id);

		await ctx.db.patch(args.accountId, {
			isArchived: args.isArchived,
			updatedAt: Date.now(),
		});

		if (args.isArchived && user.defaultAccountId === args.accountId) {
			await ctx.db.patch(user._id, { defaultAccountId: undefined });
		}

		return await getResolvedAccountAfterWrite(ctx, args.accountId, user._id);
	},
});

export const updateBalance = mutation({
	args: {
		accountId: v.id("accounts"),
		newBalance: v.number(),
		date: v.optional(v.string()),
		note: v.optional(v.string()),
	},
	returns: resolvedAccountValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const account = await validateAccountOwnership(
			ctx,
			args.accountId,
			user._id
		);
		if (account.isArchived) {
			throw new ConvexError("ACCOUNT_ARCHIVED");
		}
		assertFiniteAmount(args.newBalance, "INVALID_BALANCE");

		const adjustment = args.newBalance - account.currentBalance;
		if (adjustment === 0) {
			return await resolveAccount(ctx, account, user._id);
		}

		await applyAccountBalanceChange(ctx, {
			userId: user._id,
			accountId: args.accountId,
			type: "manual_adjustment",
			amount: adjustment,
			date: args.date ?? todayIsoDate(),
			note: args.note,
		});

		return await getResolvedAccountAfterWrite(ctx, args.accountId, user._id);
	},
});

export const transfer = mutation({
	args: {
		fromAccountId: v.id("accounts"),
		toAccountId: v.id("accounts"),
		amount: v.number(),
		date: v.optional(v.string()),
		note: v.optional(v.string()),
	},
	returns: v.object({
		fromAccount: resolvedAccountValidator,
		toAccount: resolvedAccountValidator,
		transfer: accountTransferValidator,
	}),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (args.fromAccountId === args.toAccountId) {
			throw new ConvexError("TRANSFER_SAME_ACCOUNT");
		}
		assertPositiveAmount(args.amount, "INVALID_TRANSFER_AMOUNT");

		const fromAccount = await validateAccountOwnership(
			ctx,
			args.fromAccountId,
			user._id
		);
		const toAccount = await validateAccountOwnership(
			ctx,
			args.toAccountId,
			user._id
		);

		if (fromAccount.isArchived || toAccount.isArchived) {
			throw new ConvexError("ACCOUNT_ARCHIVED");
		}

		const fromCurrency = normalizeCurrencyCode(
			fromAccount.currency ?? user.currency
		);
		const toCurrency = normalizeCurrencyCode(
			toAccount.currency ?? user.currency
		);
		if (fromCurrency !== toCurrency) {
			throw new ConvexError("TRANSFER_CURRENCY_MISMATCH");
		}

		const date = args.date ?? todayIsoDate();
		const transferId = await ctx.db.insert("account_transfers", {
			userId: user._id,
			fromAccountId: args.fromAccountId,
			toAccountId: args.toAccountId,
			amount: args.amount,
			date,
			note: args.note,
			createdAt: Date.now(),
		});

		await applyAccountBalanceChange(ctx, {
			userId: user._id,
			accountId: args.fromAccountId,
			type: "transfer_out",
			amount: -args.amount,
			date,
			note: args.note,
			transferId,
		});

		await applyAccountBalanceChange(ctx, {
			userId: user._id,
			accountId: args.toAccountId,
			type: "transfer_in",
			amount: args.amount,
			date,
			note: args.note,
			transferId,
		});

		const transferRecord = await ctx.db.get(transferId);
		if (!transferRecord) {
			throw new ConvexError("TRANSFER_NOT_FOUND");
		}

		return {
			fromAccount: await getResolvedAccountAfterWrite(
				ctx,
				args.fromAccountId,
				user._id
			),
			toAccount: await getResolvedAccountAfterWrite(
				ctx,
				args.toAccountId,
				user._id
			),
			transfer: transferRecord,
		};
	},
});

export const listTransactions = query({
	args: {
		accountId: v.optional(v.id("accounts")),
		limit: v.optional(v.number()),
	},
	returns: v.array(accountTransactionValidator),
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
});

export const listTransactionsPaginated = query({
	args: {
		accountId: v.id("accounts"),
		paginationOpts: paginationOptsValidator,
	},
	returns: paginationResultValidator(accountTransactionValidator),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateAccountOwnership(ctx, args.accountId, user._id);
		return await ctx.db
			.query("account_transactions")
			.withIndex("by_accountId_date", (q) => q.eq("accountId", args.accountId))
			.order("desc")
			.paginate(args.paginationOpts);
	},
});
