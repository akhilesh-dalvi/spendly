import { ConvexError, v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { resolveAccountTypeMetadata } from "../../accountTypeHelpers";
import {
	commitAccountArchive,
	commitAccountCreate,
	commitAccountUpdate,
	commitBalanceAdjustment,
	commitDefaultAccount,
	commitTransfer,
	prepareAccountArchive,
	prepareAccountCreate,
	prepareAccountUpdate,
	prepareBalanceAdjustment,
	prepareDefaultAccount,
	prepareTransfer,
} from "../../domain/accountOperations";
import { executeIdempotentMutation } from "../../domain/idempotency";
import { INITIAL_REVISION } from "../../domain/revisions";
import { getCurrentUser, validateAccountOwnership } from "../../helpers";
import { withCliErrors } from "./errors";
import { presentAccount, presentTransaction } from "./presenters";
import {
	accountCreateProposalValidator,
	accountSummaryValidator,
	accountTransactionValidator,
	balanceAdjustmentPreviewValidator,
	transferPreviewValidator,
	transferResultValidator,
} from "./validators";

const DEFAULT_PAGE_SIZE = 50;
const MAXIMUM_PAGE_SIZE = 100;
const MAXIMUM_ACCOUNTS = 1000;

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

export const list = query({
	args: { includeArchived: v.optional(v.boolean()) },
	returns: v.array(accountSummaryValidator),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const accounts = await ctx.db
				.query("accounts")
				.withIndex("by_userId", (queryBuilder) =>
					queryBuilder.eq("userId", user._id)
				)
				.take(MAXIMUM_ACCOUNTS + 1);
			if (accounts.length > MAXIMUM_ACCOUNTS) {
				throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
			}
			const visible = accounts
				.filter((account) => args.includeArchived || !account.isArchived)
				.sort((left, right) => {
					const archivedOrder =
						Number(left.isArchived ?? false) -
						Number(right.isArchived ?? false);
					return archivedOrder || left.name.localeCompare(right.name);
				});
			return await Promise.all(
				visible.map((account) => presentAccount(ctx, account, user))
			);
		}),
});

export const get = query({
	args: { accountId: v.id("accounts") },
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const account = await validateAccountOwnership(
				ctx,
				args.accountId,
				user._id
			);
			return await presentAccount(ctx, account, user);
		}),
});

export const listTransactions = query({
	args: {
		accountId: v.id("accounts"),
		cursor: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		hasMore: v.boolean(),
		items: v.array(accountTransactionValidator),
		nextCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			await validateAccountOwnership(ctx, args.accountId, user._id);
			const page = await ctx.db
				.query("account_transactions")
				.withIndex("by_accountId_date_createdAt", (queryBuilder) =>
					queryBuilder.eq("accountId", args.accountId)
				)
				.order("desc")
				.paginate({
					cursor: args.cursor ?? null,
					numItems: normalizeLimit(args.limit),
				});
			return {
				hasMore: !page.isDone,
				items: page.page.map(presentTransaction),
				nextCursor: page.isDone ? null : page.continueCursor,
			};
		}),
});

export const previewCreate = query({
	args: {
		accountTypeId: v.id("account_types"),
		date: v.optional(v.string()),
		name: v.string(),
		startingBalance: v.number(),
	},
	returns: accountCreateProposalValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const prepared = await prepareAccountCreate(ctx, { ...args, user });
			const type = await resolveAccountTypeMetadata(
				ctx,
				prepared.accountTypeId,
				user._id
			);
			return {
				accountType: {
					balanceNature: type.accountTypeBalanceNature,
					color: type.accountTypeColor,
					icon: type.accountTypeIcon,
					id: prepared.accountTypeId,
					name: type.accountTypeName,
				},
				currency: prepared.currency ?? "USD",
				currentBalance: prepared.startingBalance,
				date: prepared.date,
				name: prepared.name,
				revision: INITIAL_REVISION,
				startingBalance: prepared.startingBalance,
			};
		}),
});

export const create = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		date: v.optional(v.string()),
		idempotencyKey: v.string(),
		name: v.string(),
		startingBalance: v.number(),
	},
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareAccountCreate(ctx, { ...input, user });
					const account = await commitAccountCreate(ctx, { prepared, user });
					const currentUser = (await ctx.db.get(user._id)) ?? user;
					return await presentAccount(ctx, account, currentUser);
				},
				key: idempotencyKey,
				operation: "accounts.create",
				request: input,
				userId: user._id,
			});
		}),
});

export const previewUpdate = query({
	args: {
		accountId: v.id("accounts"),
		accountTypeId: v.optional(v.id("account_types")),
		expectedRevision: v.optional(v.number()),
		name: v.optional(v.string()),
	},
	returns: v.object({
		after: accountSummaryValidator,
		before: accountSummaryValidator,
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { accountId, ...input } = args;
			const prepared = await prepareAccountUpdate(ctx, {
				accountId,
				input,
				userId: user._id,
			});
			return {
				after: await presentAccount(ctx, prepared.after, user),
				before: await presentAccount(ctx, prepared.before, user),
			};
		}),
});

export const update = mutation({
	args: {
		accountId: v.id("accounts"),
		accountTypeId: v.optional(v.id("account_types")),
		expectedRevision: v.number(),
		idempotencyKey: v.string(),
		name: v.optional(v.string()),
	},
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { accountId, idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const account = await commitAccountUpdate(ctx, {
						accountId,
						input,
						userId: user._id,
					});
					return await presentAccount(ctx, account, user);
				},
				key: idempotencyKey,
				operation: "accounts.update",
				request: { accountId, ...input },
				userId: user._id,
			});
		}),
});

const previewArchiveHandler = async (
	ctx: Parameters<typeof prepareAccountArchive>[0],
	args: {
		accountId: Parameters<typeof prepareAccountArchive>[1]["accountId"];
		expectedRevision?: number;
		isArchived: boolean;
	}
) => {
	const user = await getCurrentUser(ctx);
	const prepared = await prepareAccountArchive(ctx, { ...args, user });
	const afterUser =
		args.isArchived && user.defaultAccountId === args.accountId
			? { ...user, defaultAccountId: undefined }
			: user;
	return {
		after: await presentAccount(ctx, prepared.after, afterUser),
		before: await presentAccount(ctx, prepared.before, user),
	};
};

export const previewArchive = query({
	args: {
		accountId: v.id("accounts"),
		expectedRevision: v.optional(v.number()),
	},
	returns: v.object({
		after: accountSummaryValidator,
		before: accountSummaryValidator,
	}),
	handler: async (ctx, args) =>
		await withCliErrors(
			async () =>
				await previewArchiveHandler(ctx, { ...args, isArchived: true })
		),
});

export const previewReactivate = query({
	args: {
		accountId: v.id("accounts"),
		expectedRevision: v.optional(v.number()),
	},
	returns: v.object({
		after: accountSummaryValidator,
		before: accountSummaryValidator,
	}),
	handler: async (ctx, args) =>
		await withCliErrors(
			async () =>
				await previewArchiveHandler(ctx, { ...args, isArchived: false })
		),
});

const commitArchive = async (
	ctx: Parameters<typeof commitAccountArchive>[0],
	args: {
		accountId: Parameters<typeof commitAccountArchive>[1]["accountId"];
		expectedRevision: number;
		idempotencyKey: string;
		isArchived: boolean;
	}
) => {
	const user = await getCurrentUser(ctx);
	return await executeIdempotentMutation(ctx, {
		execute: async () => {
			const account = await commitAccountArchive(ctx, { ...args, user });
			const currentUser = (await ctx.db.get(user._id)) ?? user;
			return await presentAccount(ctx, account, currentUser);
		},
		key: args.idempotencyKey,
		operation: args.isArchived ? "accounts.archive" : "accounts.reactivate",
		request: {
			accountId: args.accountId,
			expectedRevision: args.expectedRevision,
		},
		userId: user._id,
	});
};

const lifecycleCommitArgs = {
	accountId: v.id("accounts"),
	expectedRevision: v.number(),
	idempotencyKey: v.string(),
} as const;

export const archive = mutation({
	args: lifecycleCommitArgs,
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(
			async () => await commitArchive(ctx, { ...args, isArchived: true })
		),
});

export const reactivate = mutation({
	args: lifecycleCommitArgs,
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(
			async () => await commitArchive(ctx, { ...args, isArchived: false })
		),
});

export const previewSetDefault = query({
	args: {
		accountId: v.id("accounts"),
		expectedRevision: v.optional(v.number()),
	},
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const account = await prepareDefaultAccount(ctx, { ...args, user });
			return await presentAccount(ctx, account, {
				...user,
				defaultAccountId: account._id,
			});
		}),
});

export const setDefault = mutation({
	args: lifecycleCommitArgs,
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const account = await commitDefaultAccount(ctx, { ...args, user });
					return await presentAccount(ctx, account, {
						...user,
						defaultAccountId: account._id,
					});
				},
				key: args.idempotencyKey,
				operation: "accounts.setDefault",
				request: {
					accountId: args.accountId,
					expectedRevision: args.expectedRevision,
				},
				userId: user._id,
			});
		}),
});

const adjustmentArgs = {
	accountId: v.id("accounts"),
	date: v.optional(v.string()),
	expectedRevision: v.optional(v.number()),
	newBalance: v.number(),
	note: v.optional(v.string()),
} as const;

export const previewBalanceAdjustment = query({
	args: adjustmentArgs,
	returns: balanceAdjustmentPreviewValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const prepared = await prepareBalanceAdjustment(ctx, { ...args, user });
			return {
				account: await presentAccount(ctx, prepared.account, user),
				adjustment: prepared.adjustment,
				currency: prepared.currency,
				date: prepared.date,
				resultingBalance: prepared.resultingBalance,
				warnings: prepared.warnings,
			};
		}),
});

export const adjustBalance = mutation({
	args: {
		...adjustmentArgs,
		expectedRevision: v.number(),
		idempotencyKey: v.string(),
	},
	returns: accountSummaryValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareBalanceAdjustment(ctx, {
						...input,
						user,
					});
					const account = await commitBalanceAdjustment(ctx, prepared);
					return await presentAccount(ctx, account, user);
				},
				key: idempotencyKey,
				operation: "accounts.adjustBalance",
				request: input,
				userId: user._id,
			});
		}),
});

const transferArgs = {
	amount: v.number(),
	date: v.optional(v.string()),
	expectedFromRevision: v.optional(v.number()),
	expectedToRevision: v.optional(v.number()),
	fromAccountId: v.id("accounts"),
	note: v.optional(v.string()),
	toAccountId: v.id("accounts"),
} as const;

export const previewTransfer = query({
	args: transferArgs,
	returns: transferPreviewValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const prepared = await prepareTransfer(ctx, { ...args, user });
			return {
				amount: prepared.amount,
				currency: prepared.currency,
				date: prepared.date,
				fromAccount: await presentAccount(ctx, prepared.fromAccount, user),
				fromBalanceAfter: prepared.fromAccount.currentBalance - prepared.amount,
				note: prepared.note ?? null,
				toAccount: await presentAccount(ctx, prepared.toAccount, user),
				toBalanceAfter: prepared.toAccount.currentBalance + prepared.amount,
				warnings: prepared.warnings,
			};
		}),
});

export const transfer = mutation({
	args: {
		...transferArgs,
		expectedFromRevision: v.number(),
		expectedToRevision: v.number(),
		idempotencyKey: v.string(),
	},
	returns: transferResultValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareTransfer(ctx, { ...input, user });
					const result = await commitTransfer(ctx, prepared);
					return {
						amount: result.transfer.amount,
						currency: prepared.currency,
						date: result.transfer.date,
						fromAccount: await presentAccount(ctx, result.fromAccount, user),
						id: result.transfer._id,
						note: result.transfer.note ?? null,
						toAccount: await presentAccount(ctx, result.toAccount, user),
					};
				},
				key: idempotencyKey,
				operation: "accounts.transfer",
				request: input,
				userId: user._id,
			});
		}),
});
