// biome-ignore-all lint/style/useFilenamingConvention: Convex module paths cannot contain hyphens.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	createAccountType,
	getAccountTypeAfterWrite,
	MAX_ACCOUNT_TYPES_PER_USER,
	prepareAccountTypeUpdate,
	seedDefaultAccountTypes,
	validateAccountTypeOwnership,
} from "./accountTypeHelpers";
import {
	accountTypeBalanceNatureValidator,
	accountTypeListValidator,
	accountTypeRemoveResultValidator,
	accountTypeSeedResultValidator,
	accountTypeUsageValidator,
	accountTypeValidator,
} from "./accountTypeValidators";
import { getCurrentUser } from "./helpers";

const MAX_ACCOUNT_TYPE_USAGE_RESULTS = 1000;

const getUserAccountTypes = async (
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">
): Promise<Doc<"account_types">[]> =>
	await ctx.db
		.query("account_types")
		.withIndex("by_userId_order", (q) => q.eq("userId", userId))
		.take(MAX_ACCOUNT_TYPES_PER_USER);

export const list = query({
	args: {
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const accountTypes = await getUserAccountTypes(ctx, user._id);
		if (args.includeArchived) {
			return accountTypes;
		}
		return accountTypes.filter((accountType) => !accountType.isArchived);
	},
	returns: accountTypeListValidator,
});

export const get = query({
	args: {
		accountTypeId: v.id("account_types"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		return await validateAccountTypeOwnership(
			ctx,
			args.accountTypeId,
			user._id
		);
	},
	returns: accountTypeValidator,
});

export const getUsage = query({
	args: {
		accountTypeId: v.id("account_types"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateAccountTypeOwnership(ctx, args.accountTypeId, user._id);
		const accounts = await ctx.db
			.query("accounts")
			.withIndex("by_accountTypeId", (q) =>
				q.eq("accountTypeId", args.accountTypeId)
			)
			.take(MAX_ACCOUNT_TYPE_USAGE_RESULTS + 1);
		const hasMoreAccounts = accounts.length > MAX_ACCOUNT_TYPE_USAGE_RESULTS;
		const accountCount = Math.min(
			accounts.length,
			MAX_ACCOUNT_TYPE_USAGE_RESULTS
		);
		return {
			accountCount,
			canDelete: accounts.length === 0,
			hasMoreAccounts,
		};
	},
	returns: accountTypeUsageValidator,
});

export const create = mutation({
	args: {
		balanceNature: accountTypeBalanceNatureValidator,
		color: v.optional(v.string()),
		icon: v.optional(v.string()),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		return await createAccountType(ctx, user._id, args);
	},
	returns: accountTypeValidator,
});

export const update = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		balanceNature: v.optional(accountTypeBalanceNatureValidator),
		color: v.optional(v.union(v.string(), v.null())),
		icon: v.optional(v.union(v.string(), v.null())),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const accountType = await validateAccountTypeOwnership(
			ctx,
			args.accountTypeId,
			user._id
		);
		const updates = await prepareAccountTypeUpdate(ctx, accountType, args);
		await ctx.db.patch(args.accountTypeId, {
			...updates,
			updatedAt: Date.now(),
		});
		return await getAccountTypeAfterWrite(ctx, args.accountTypeId);
	},
	returns: accountTypeValidator,
});

export const archive = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		isArchived: v.boolean(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateAccountTypeOwnership(ctx, args.accountTypeId, user._id);
		await ctx.db.patch(args.accountTypeId, {
			isArchived: args.isArchived,
			updatedAt: Date.now(),
		});
		return await getAccountTypeAfterWrite(ctx, args.accountTypeId);
	},
	returns: accountTypeValidator,
});

export const remove = mutation({
	args: {
		accountTypeId: v.id("account_types"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateAccountTypeOwnership(ctx, args.accountTypeId, user._id);
		const accountUsingType = await ctx.db
			.query("accounts")
			.withIndex("by_accountTypeId", (q) =>
				q.eq("accountTypeId", args.accountTypeId)
			)
			.first();
		if (accountUsingType) {
			throw new ConvexError("ACCOUNT_TYPE_IN_USE");
		}
		await ctx.db.delete(args.accountTypeId);
		return { success: true } as const;
	},
	returns: accountTypeRemoveResultValidator,
});

export const seedDefaults = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return await seedDefaultAccountTypes(ctx, user._id);
	},
	returns: accountTypeSeedResultValidator,
});
