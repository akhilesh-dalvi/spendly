// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { validateActiveAccountType } from "../accountTypeHelpers";
import {
	applyAccountBalanceChange,
	validateAccountOwnership,
} from "../helpers";
import { resolveLocalDate } from "./dates";
import { assertRevision, INITIAL_REVISION, nextRevision } from "./revisions";

export const normalizeCurrencyCode = (currency?: string): string | undefined =>
	currency?.trim().toUpperCase() || undefined;

const normalizeName = (name: string): string => {
	const normalizedName = name.trim();
	if (normalizedName.length === 0) {
		throw new ConvexError("ACCOUNT_NAME_REQUIRED");
	}
	return normalizedName;
};

const assertFiniteAmount = (amount: number, errorCode: string): void => {
	if (!Number.isFinite(amount)) {
		throw new ConvexError(errorCode);
	}
};

const assertPositiveAmount = (amount: number, errorCode: string): void => {
	assertFiniteAmount(amount, errorCode);
	if (amount <= 0) {
		throw new ConvexError(errorCode);
	}
};

const normalizeOptionalNote = (
	note: string | undefined
): string | undefined => {
	if (note === undefined) {
		return undefined;
	}
	const normalizedNote = note.trim();
	return normalizedNote.length > 0 ? normalizedNote : undefined;
};

export interface PreparedAccountCreate {
	accountTypeId: Id<"account_types">;
	currency?: string;
	date: string;
	name: string;
	startingBalance: number;
}

export const prepareAccountCreate = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		accountTypeId: Id<"account_types">;
		currency?: string;
		date?: string;
		name: string;
		now?: number;
		persistCurrency?: boolean;
		startingBalance: number;
		user: Doc<"users">;
	}
): Promise<PreparedAccountCreate> => {
	assertFiniteAmount(options.startingBalance, "INVALID_STARTING_BALANCE");
	await validateActiveAccountType(ctx, options.accountTypeId, options.user._id);
	return {
		accountTypeId: options.accountTypeId,
		currency:
			options.persistCurrency === false
				? undefined
				: normalizeCurrencyCode(options.currency ?? options.user.currency),
		date: resolveLocalDate(options.date, options.now),
		name: normalizeName(options.name),
		startingBalance: options.startingBalance,
	};
};

export const commitAccountCreate = async (
	ctx: MutationCtx,
	options: {
		now?: number;
		prepared: PreparedAccountCreate;
		user: Doc<"users">;
	}
): Promise<{
	account: Doc<"accounts">;
	openingTransaction: Doc<"account_transactions">;
}> => {
	const now = options.now ?? Date.now();
	const accountId = await ctx.db.insert("accounts", {
		accountTypeId: options.prepared.accountTypeId,
		createdAt: now,
		currency: options.prepared.currency,
		currentBalance: options.prepared.startingBalance,
		isArchived: false,
		name: options.prepared.name,
		revision: INITIAL_REVISION,
		startingBalance: options.prepared.startingBalance,
		updatedAt: now,
		userId: options.user._id,
	});
	const openingTransactionId = await ctx.db.insert("account_transactions", {
		accountId,
		amount: options.prepared.startingBalance,
		balanceAfter: options.prepared.startingBalance,
		createdAt: now,
		date: options.prepared.date,
		note: "Opening balance",
		type: "opening_balance",
		userId: options.user._id,
	});
	const userUpdates: {
		accountsOnboardingStatus?: "completed";
		defaultAccountId?: Id<"accounts">;
	} = {};
	if (!options.user.defaultAccountId) {
		userUpdates.defaultAccountId = accountId;
	}
	if (options.user.accountsOnboardingStatus !== "completed") {
		userUpdates.accountsOnboardingStatus = "completed";
	}
	if (Object.keys(userUpdates).length > 0) {
		await ctx.db.patch(options.user._id, userUpdates);
	}
	const [account, openingTransaction] = await Promise.all([
		ctx.db.get(accountId),
		ctx.db.get(openingTransactionId),
	]);
	if (!(account && openingTransaction)) {
		throw new ConvexError("ACCOUNT_NOT_FOUND");
	}
	return { account, openingTransaction };
};

export interface AccountUpdateInput {
	accountTypeId?: Id<"account_types">;
	currency?: string;
	expectedRevision?: number;
	name?: string;
}

export const prepareAccountUpdate = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		accountId: Id<"accounts">;
		input: AccountUpdateInput;
		now?: number;
		userId: Id<"users">;
	}
): Promise<{ after: Doc<"accounts">; before: Doc<"accounts"> }> => {
	const account = await validateAccountOwnership(
		ctx,
		options.accountId,
		options.userId
	);
	if (options.input.expectedRevision !== undefined) {
		assertRevision(
			account.revision,
			options.input.expectedRevision,
			"ACCOUNT_REVISION_CONFLICT"
		);
	}
	const updates: Partial<Doc<"accounts">> = {
		revision: nextRevision(account.revision),
		updatedAt: options.now ?? Date.now(),
	};
	if (options.input.name !== undefined) {
		updates.name = normalizeName(options.input.name);
	}
	if (
		options.input.accountTypeId !== undefined &&
		options.input.accountTypeId !== account.accountTypeId
	) {
		await validateActiveAccountType(
			ctx,
			options.input.accountTypeId,
			options.userId
		);
		updates.accountTypeId = options.input.accountTypeId;
	}
	if (options.input.currency !== undefined) {
		updates.currency = normalizeCurrencyCode(options.input.currency);
	}
	return { after: { ...account, ...updates }, before: account };
};

export const commitAccountUpdate = async (
	ctx: MutationCtx,
	options: Parameters<typeof prepareAccountUpdate>[1]
): Promise<Doc<"accounts">> => {
	const prepared = await prepareAccountUpdate(ctx, options);
	const {
		_creationTime: _ignoredCreationTime,
		_id,
		...updates
	} = prepared.after;
	await ctx.db.patch(_id, updates);
	const updated = await ctx.db.get(_id);
	if (!updated) {
		throw new ConvexError("ACCOUNT_NOT_FOUND");
	}
	return updated;
};

export const prepareAccountArchive = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		accountId: Id<"accounts">;
		expectedRevision?: number;
		isArchived: boolean;
		now?: number;
		user: Doc<"users">;
	}
): Promise<{ after: Doc<"accounts">; before: Doc<"accounts"> }> => {
	const account = await validateAccountOwnership(
		ctx,
		options.accountId,
		options.user._id
	);
	if (options.expectedRevision !== undefined) {
		assertRevision(
			account.revision,
			options.expectedRevision,
			"ACCOUNT_REVISION_CONFLICT"
		);
	}
	return {
		after: {
			...account,
			isArchived: options.isArchived,
			revision: nextRevision(account.revision),
			updatedAt: options.now ?? Date.now(),
		},
		before: account,
	};
};

export const commitAccountArchive = async (
	ctx: MutationCtx,
	options: Parameters<typeof prepareAccountArchive>[1]
): Promise<Doc<"accounts">> => {
	const prepared = await prepareAccountArchive(ctx, options);
	await ctx.db.patch(options.accountId, {
		isArchived: prepared.after.isArchived,
		revision: prepared.after.revision,
		updatedAt: prepared.after.updatedAt,
	});
	if (
		options.isArchived &&
		options.user.defaultAccountId === options.accountId
	) {
		await ctx.db.patch(options.user._id, { defaultAccountId: undefined });
	}
	const updated = await ctx.db.get(options.accountId);
	if (!updated) {
		throw new ConvexError("ACCOUNT_NOT_FOUND");
	}
	return updated;
};

export const prepareDefaultAccount = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		accountId: Id<"accounts">;
		expectedRevision?: number;
		now?: number;
		user: Doc<"users">;
	}
): Promise<Doc<"accounts">> => {
	const account = await validateAccountOwnership(
		ctx,
		options.accountId,
		options.user._id
	);
	if (account.isArchived) {
		throw new ConvexError("ACCOUNT_ARCHIVED");
	}
	if (options.expectedRevision !== undefined) {
		assertRevision(
			account.revision,
			options.expectedRevision,
			"ACCOUNT_REVISION_CONFLICT"
		);
	}
	return options.user.defaultAccountId === options.accountId
		? account
		: {
				...account,
				revision: nextRevision(account.revision),
				updatedAt: options.now ?? Date.now(),
			};
};

export const commitDefaultAccount = async (
	ctx: MutationCtx,
	options: Parameters<typeof prepareDefaultAccount>[1]
): Promise<Doc<"accounts">> => {
	const prepared = await prepareDefaultAccount(ctx, options);
	if (options.user.defaultAccountId !== options.accountId) {
		await Promise.all([
			ctx.db.patch(options.user._id, { defaultAccountId: options.accountId }),
			ctx.db.patch(options.accountId, {
				revision: prepared.revision,
				updatedAt: prepared.updatedAt,
			}),
		]);
	}
	const updated = await ctx.db.get(options.accountId);
	if (!updated) {
		throw new ConvexError("ACCOUNT_NOT_FOUND");
	}
	return updated;
};

export interface PreparedBalanceAdjustment {
	account: Doc<"accounts">;
	adjustment: number;
	currency: string;
	date: string;
	note?: string;
	resultingBalance: number;
	warnings: string[];
}

export const prepareBalanceAdjustment = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		accountId: Id<"accounts">;
		date?: string;
		expectedRevision?: number;
		newBalance: number;
		note?: string;
		now?: number;
		user: Doc<"users">;
	}
): Promise<PreparedBalanceAdjustment> => {
	const account = await validateAccountOwnership(
		ctx,
		options.accountId,
		options.user._id
	);
	if (account.isArchived) {
		throw new ConvexError("ACCOUNT_ARCHIVED");
	}
	if (options.expectedRevision !== undefined) {
		assertRevision(
			account.revision,
			options.expectedRevision,
			"ACCOUNT_REVISION_CONFLICT"
		);
	}
	assertFiniteAmount(options.newBalance, "INVALID_BALANCE");
	return {
		account,
		adjustment: options.newBalance - account.currentBalance,
		currency:
			normalizeCurrencyCode(account.currency ?? options.user.currency) ?? "USD",
		date: resolveLocalDate(options.date, options.now),
		note: normalizeOptionalNote(options.note),
		resultingBalance: options.newBalance,
		warnings: options.newBalance < 0 ? ["NEGATIVE_BALANCE"] : [],
	};
};

export const commitBalanceAdjustment = async (
	ctx: MutationCtx,
	prepared: PreparedBalanceAdjustment
): Promise<{
	account: Doc<"accounts">;
	transaction: Doc<"account_transactions"> | null;
}> => {
	let transactionId: Id<"account_transactions"> | undefined;
	if (prepared.adjustment !== 0) {
		transactionId = await applyAccountBalanceChange(ctx, {
			accountId: prepared.account._id,
			amount: prepared.adjustment,
			date: prepared.date,
			note: prepared.note,
			type: "manual_adjustment",
			userId: prepared.account.userId,
		});
	}
	const [account, transaction] = await Promise.all([
		ctx.db.get(prepared.account._id),
		transactionId ? ctx.db.get(transactionId) : Promise.resolve(null),
	]);
	if (!account) {
		throw new ConvexError("ACCOUNT_NOT_FOUND");
	}
	return { account, transaction };
};

export interface PreparedTransfer {
	amount: number;
	currency: string;
	date: string;
	fromAccount: Doc<"accounts">;
	note?: string;
	toAccount: Doc<"accounts">;
	warnings: string[];
}

export const prepareTransfer = async (
	ctx: QueryCtx | MutationCtx,
	options: {
		amount: number;
		date?: string;
		expectedFromRevision?: number;
		expectedToRevision?: number;
		fromAccountId: Id<"accounts">;
		note?: string;
		now?: number;
		toAccountId: Id<"accounts">;
		user: Doc<"users">;
	}
): Promise<PreparedTransfer> => {
	if (options.fromAccountId === options.toAccountId) {
		throw new ConvexError("TRANSFER_SAME_ACCOUNT");
	}
	assertPositiveAmount(options.amount, "INVALID_TRANSFER_AMOUNT");
	const [fromAccount, toAccount] = await Promise.all([
		validateAccountOwnership(ctx, options.fromAccountId, options.user._id),
		validateAccountOwnership(ctx, options.toAccountId, options.user._id),
	]);
	if (fromAccount.isArchived || toAccount.isArchived) {
		throw new ConvexError("ACCOUNT_ARCHIVED");
	}
	if (options.expectedFromRevision !== undefined) {
		assertRevision(
			fromAccount.revision,
			options.expectedFromRevision,
			"ACCOUNT_REVISION_CONFLICT"
		);
	}
	if (options.expectedToRevision !== undefined) {
		assertRevision(
			toAccount.revision,
			options.expectedToRevision,
			"ACCOUNT_REVISION_CONFLICT"
		);
	}
	const fromCurrency =
		normalizeCurrencyCode(fromAccount.currency ?? options.user.currency) ??
		"USD";
	const toCurrency =
		normalizeCurrencyCode(toAccount.currency ?? options.user.currency) ?? "USD";
	if (fromCurrency !== toCurrency) {
		throw new ConvexError("TRANSFER_CURRENCY_MISMATCH");
	}
	return {
		amount: options.amount,
		currency: fromCurrency,
		date: resolveLocalDate(options.date, options.now),
		fromAccount,
		note: normalizeOptionalNote(options.note),
		toAccount,
		warnings:
			fromAccount.currentBalance - options.amount < 0
				? ["NEGATIVE_SOURCE_BALANCE"]
				: [],
	};
};

export const commitTransfer = async (
	ctx: MutationCtx,
	prepared: PreparedTransfer,
	now = Date.now()
): Promise<{
	fromAccount: Doc<"accounts">;
	fromTransaction: Doc<"account_transactions">;
	toAccount: Doc<"accounts">;
	toTransaction: Doc<"account_transactions">;
	transfer: Doc<"account_transfers">;
}> => {
	const transferId = await ctx.db.insert("account_transfers", {
		amount: prepared.amount,
		createdAt: now,
		date: prepared.date,
		fromAccountId: prepared.fromAccount._id,
		note: prepared.note,
		toAccountId: prepared.toAccount._id,
		userId: prepared.fromAccount.userId,
	});
	const fromTransactionId = await applyAccountBalanceChange(ctx, {
		accountId: prepared.fromAccount._id,
		amount: -prepared.amount,
		date: prepared.date,
		note: prepared.note,
		transferId,
		type: "transfer_out",
		userId: prepared.fromAccount.userId,
	});
	const toTransactionId = await applyAccountBalanceChange(ctx, {
		accountId: prepared.toAccount._id,
		amount: prepared.amount,
		date: prepared.date,
		note: prepared.note,
		transferId,
		type: "transfer_in",
		userId: prepared.toAccount.userId,
	});
	const [fromAccount, fromTransaction, toAccount, toTransaction, transfer] =
		await Promise.all([
			ctx.db.get(prepared.fromAccount._id),
			ctx.db.get(fromTransactionId),
			ctx.db.get(prepared.toAccount._id),
			ctx.db.get(toTransactionId),
			ctx.db.get(transferId),
		]);
	if (
		!(fromAccount && fromTransaction && toAccount && toTransaction && transfer)
	) {
		throw new ConvexError("TRANSFER_NOT_FOUND");
	}
	return {
		fromAccount,
		fromTransaction,
		toAccount,
		toTransaction,
		transfer,
	};
};
