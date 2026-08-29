// biome-ignore-all lint/style/useFilenamingConvention: Convex module paths cannot contain hyphens.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	assertAccountTypeCapacity,
	getNextAccountTypeOrder,
	MAX_ACCOUNT_TYPES_PER_USER,
	normalizeAccountTypeColor,
	normalizeAccountTypeIcon,
	normalizeAccountTypeName,
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
): Promise<Doc<"account_types">[]> => {
	return await ctx.db
		.query("account_types")
		.withIndex("by_userId_order", (q) => q.eq("userId", userId))
		.take(MAX_ACCOUNT_TYPES_PER_USER);
};

const assertAccountTypeNameAvailable = async (
	ctx: MutationCtx,
	args: {
		excludeAccountTypeId?: Id<"account_types">;
		normalizedName: string;
		userId: Id<"users">;
	}
): Promise<void> => {
	const matchingTypes = await ctx.db
		.query("account_types")
		.withIndex("by_userId_normalizedName", (q) =>
			q.eq("userId", args.userId).eq("normalizedName", args.normalizedName)
		)
		.take(2);
	const conflictingType = matchingTypes.find(
		(accountType) => accountType._id !== args.excludeAccountTypeId
	);
	if (conflictingType) {
		throw new ConvexError("ACCOUNT_TYPE_NAME_TAKEN");
	}
};

const getAccountTypeAfterWrite = async (
	ctx: MutationCtx,
	accountTypeId: Id<"account_types">
): Promise<Doc<"account_types">> => {
	const accountType = await ctx.db.get(accountTypeId);
	if (!accountType) {
		throw new Error("Account type was not found after write");
	}
	return accountType;
};

export const list = query({
	args: {
		includeArchived: v.optional(v.boolean()),
	},
	returns: accountTypeListValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const accountTypes = await getUserAccountTypes(ctx, user._id);
		if (args.includeArchived) {
			return accountTypes;
		}
		return accountTypes.filter((accountType) => !accountType.isArchived);
	},
});

export const get = query({
	args: {
		accountTypeId: v.id("account_types"),
	},
	returns: accountTypeValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		return await validateAccountTypeOwnership(
			ctx,
			args.accountTypeId,
			user._id
		);
	},
});

export const getUsage = query({
	args: {
		accountTypeId: v.id("account_types"),
	},
	returns: accountTypeUsageValidator,
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
});

export const create = mutation({
	args: {
		balanceNature: accountTypeBalanceNatureValidator,
		color: v.optional(v.string()),
		icon: v.optional(v.string()),
		name: v.string(),
	},
	returns: accountTypeValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const { name, normalizedName } = normalizeAccountTypeName(args.name);
		await assertAccountTypeNameAvailable(ctx, {
			normalizedName,
			userId: user._id,
		});
		await assertAccountTypeCapacity(ctx, user._id);

		const now = Date.now();
		const accountTypeId = await ctx.db.insert("account_types", {
			balanceNature: args.balanceNature,
			color: normalizeAccountTypeColor(args.color),
			createdAt: now,
			icon: normalizeAccountTypeIcon(args.icon),
			isArchived: false,
			name,
			normalizedName,
			order: await getNextAccountTypeOrder(ctx, user._id),
			updatedAt: now,
			userId: user._id,
		});
		return await getAccountTypeAfterWrite(ctx, accountTypeId);
	},
});

export const update = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		balanceNature: v.optional(accountTypeBalanceNatureValidator),
		color: v.optional(v.union(v.string(), v.null())),
		icon: v.optional(v.union(v.string(), v.null())),
		name: v.optional(v.string()),
	},
	returns: accountTypeValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const accountType = await validateAccountTypeOwnership(
			ctx,
			args.accountTypeId,
			user._id
		);
		const updates: Partial<Doc<"account_types">> = {
			updatedAt: Date.now(),
		};

		if (args.name !== undefined) {
			const { name, normalizedName } = normalizeAccountTypeName(args.name);
			await assertAccountTypeNameAvailable(ctx, {
				excludeAccountTypeId: args.accountTypeId,
				normalizedName,
				userId: user._id,
			});
			updates.name = name;
			updates.normalizedName = normalizedName;
		}
		if (args.icon !== undefined) {
			updates.icon = normalizeAccountTypeIcon(args.icon);
		}
		if (args.color !== undefined) {
			updates.color = normalizeAccountTypeColor(args.color);
		}
		if (
			args.balanceNature !== undefined &&
			args.balanceNature !== accountType.balanceNature
		) {
			const accountUsingType = await ctx.db
				.query("accounts")
				.withIndex("by_accountTypeId", (q) =>
					q.eq("accountTypeId", args.accountTypeId)
				)
				.first();
			if (accountUsingType) {
				throw new ConvexError("ACCOUNT_TYPE_BALANCE_NATURE_IN_USE");
			}
			updates.balanceNature = args.balanceNature;
		}

		await ctx.db.patch(args.accountTypeId, updates);
		return await getAccountTypeAfterWrite(ctx, args.accountTypeId);
	},
});

export const archive = mutation({
	args: {
		accountTypeId: v.id("account_types"),
		isArchived: v.boolean(),
	},
	returns: accountTypeValidator,
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateAccountTypeOwnership(ctx, args.accountTypeId, user._id);
		await ctx.db.patch(args.accountTypeId, {
			isArchived: args.isArchived,
			updatedAt: Date.now(),
		});
		return await getAccountTypeAfterWrite(ctx, args.accountTypeId);
	},
});

export const remove = mutation({
	args: {
		accountTypeId: v.id("account_types"),
	},
	returns: accountTypeRemoveResultValidator,
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
});

export const seedDefaults = mutation({
	args: {},
	returns: accountTypeSeedResultValidator,
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return await seedDefaultAccountTypes(ctx, user._id);
	},
});
