// biome-ignore-all lint/style/useFilenamingConvention: Convex module paths cannot contain hyphens.
import { v } from "convex/values";

export const accountTypeBalanceNatureValidator = v.union(
	v.literal("asset"),
	v.literal("liability")
);

export const resolvedAccountTypeFields = {
	accountTypeBalanceNature: accountTypeBalanceNatureValidator,
	accountTypeColor: v.union(v.string(), v.null()),
	accountTypeIcon: v.union(v.string(), v.null()),
	accountTypeName: v.string(),
} as const;

export const nullableResolvedAccountTypeFields = {
	accountTypeBalanceNature: v.union(
		accountTypeBalanceNatureValidator,
		v.null()
	),
	accountTypeColor: v.union(v.string(), v.null()),
	accountTypeIcon: v.union(v.string(), v.null()),
	accountTypeId: v.union(v.id("account_types"), v.null()),
	accountTypeName: v.union(v.string(), v.null()),
} as const;

export const accountTypeValidator = v.object({
	_id: v.id("account_types"),
	_creationTime: v.number(),
	userId: v.id("users"),
	name: v.string(),
	normalizedName: v.string(),
	icon: v.optional(v.string()),
	color: v.optional(v.string()),
	balanceNature: accountTypeBalanceNatureValidator,
	order: v.number(),
	isArchived: v.optional(v.boolean()),
	createdAt: v.number(),
	updatedAt: v.optional(v.number()),
});

export const accountTypeListValidator = v.array(accountTypeValidator);

export const accountTypeUsageValidator = v.object({
	accountCount: v.number(),
	canDelete: v.boolean(),
	hasMoreAccounts: v.boolean(),
});

export const accountTypeSeedResultValidator = v.object({
	createdAccountTypeIds: v.array(v.id("account_types")),
	createdCount: v.number(),
});

export const accountTypeRemoveResultValidator = v.object({
	success: v.literal(true),
});
