// biome-ignore-all lint/style/useFilenamingConvention: Convex module paths cannot contain hyphens.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const DEFAULT_ACCOUNT_TYPES = [
	{
		balanceNature: "asset",
		icon: "banknote",
		name: "Cash",
	},
	{
		balanceNature: "asset",
		icon: "landmark",
		name: "Checking",
	},
	{
		balanceNature: "asset",
		icon: "piggy-bank",
		name: "Savings",
	},
	{
		balanceNature: "liability",
		icon: "credit-card",
		name: "Credit Card",
	},
	{
		balanceNature: "asset",
		icon: "wallet",
		name: "Wallet",
	},
	{
		balanceNature: "asset",
		icon: "circle-dollar-sign",
		name: "Other",
	},
] as const satisfies ReadonlyArray<{
	balanceNature: Doc<"account_types">["balanceNature"];
	icon: string;
	name: string;
}>;

export const MAX_ACCOUNT_TYPES_PER_USER = 100;

const ACCOUNT_TYPE_COLOR_PATTERN = /^#[\dA-Fa-f]{6}$/;

const SUPPORTED_ACCOUNT_TYPE_ICONS = new Set([
	"banknote",
	"building-2",
	"circle-dollar-sign",
	"coins",
	"credit-card",
	"hand-coins",
	"landmark",
	"piggy-bank",
	"vault",
	"wallet",
]);

interface NormalizedAccountTypeName {
	name: string;
	normalizedName: string;
}

export interface ResolvedAccountTypeMetadata {
	accountTypeBalanceNature: Doc<"account_types">["balanceNature"];
	accountTypeColor: string | null;
	accountTypeIcon: string | null;
	accountTypeName: string;
}

export interface SeedDefaultAccountTypesResult {
	createdAccountTypeIds: Id<"account_types">[];
	createdCount: number;
}

export const normalizeAccountTypeName = (
	value: string
): NormalizedAccountTypeName => {
	const name = value.trim();
	if (name.length === 0) {
		throw new ConvexError("ACCOUNT_TYPE_NAME_REQUIRED");
	}

	return {
		name,
		normalizedName: name.toLocaleLowerCase(),
	};
};

export const normalizeAccountTypeIcon = (
	value?: string | null
): string | undefined => {
	const icon = value?.trim().toLocaleLowerCase();
	if (!icon) {
		return undefined;
	}
	if (!SUPPORTED_ACCOUNT_TYPE_ICONS.has(icon)) {
		throw new ConvexError("INVALID_ACCOUNT_TYPE_ICON");
	}
	return icon;
};

export const normalizeAccountTypeColor = (
	value?: string | null
): string | undefined => {
	const color = value?.trim();
	if (!color) {
		return undefined;
	}
	if (!ACCOUNT_TYPE_COLOR_PATTERN.test(color)) {
		throw new ConvexError("INVALID_ACCOUNT_TYPE_COLOR");
	}
	return color.toUpperCase();
};

export const assertAccountTypeCapacity = async (
	ctx: MutationCtx,
	userId: Id<"users">,
	additionalCount = 1
): Promise<void> => {
	const existingTypes = await ctx.db
		.query("account_types")
		.withIndex("by_userId", (query) => query.eq("userId", userId))
		.take(MAX_ACCOUNT_TYPES_PER_USER + 1);
	if (existingTypes.length + additionalCount > MAX_ACCOUNT_TYPES_PER_USER) {
		throw new ConvexError("ACCOUNT_TYPE_LIMIT_REACHED");
	}
};

export const getNextAccountTypeOrder = async (
	ctx: MutationCtx,
	userId: Id<"users">
): Promise<number> => {
	const lastAccountType = await ctx.db
		.query("account_types")
		.withIndex("by_userId_order", (query) => query.eq("userId", userId))
		.order("desc")
		.first();
	return (lastAccountType?.order ?? -1) + 1;
};

export const seedDefaultAccountTypes = async (
	ctx: MutationCtx,
	userId: Id<"users">
): Promise<SeedDefaultAccountTypesResult> => {
	const missingDefaults: (typeof DEFAULT_ACCOUNT_TYPES)[number][] = [];
	for (const defaultType of DEFAULT_ACCOUNT_TYPES) {
		const { normalizedName } = normalizeAccountTypeName(defaultType.name);
		const existingType = await ctx.db
			.query("account_types")
			.withIndex("by_userId_normalizedName", (query) =>
				query.eq("userId", userId).eq("normalizedName", normalizedName)
			)
			.first();
		if (!existingType) {
			missingDefaults.push(defaultType);
		}
	}

	await assertAccountTypeCapacity(ctx, userId, missingDefaults.length);
	let nextOrder = await getNextAccountTypeOrder(ctx, userId);
	const createdAccountTypeIds: Id<"account_types">[] = [];
	for (const defaultType of missingDefaults) {
		const { name, normalizedName } = normalizeAccountTypeName(defaultType.name);
		const now = Date.now();
		const accountTypeId = await ctx.db.insert("account_types", {
			balanceNature: defaultType.balanceNature,
			createdAt: now,
			icon: normalizeAccountTypeIcon(defaultType.icon),
			isArchived: false,
			name,
			normalizedName,
			order: nextOrder,
			updatedAt: now,
			userId,
		});
		createdAccountTypeIds.push(accountTypeId);
		nextOrder += 1;
	}

	return {
		createdAccountTypeIds,
		createdCount: createdAccountTypeIds.length,
	};
};

export async function validateAccountTypeOwnership(
	ctx: QueryCtx | MutationCtx,
	accountTypeId: Id<"account_types">,
	userId: Id<"users">
): Promise<Doc<"account_types">> {
	const accountType = await ctx.db.get(accountTypeId);
	if (!accountType) {
		throw new ConvexError("ACCOUNT_TYPE_NOT_FOUND");
	}
	if (accountType.userId !== userId) {
		throw new ConvexError("UNAUTHORIZED");
	}
	return accountType;
}

export async function validateActiveAccountType(
	ctx: QueryCtx | MutationCtx,
	accountTypeId: Id<"account_types">,
	userId: Id<"users">
): Promise<Doc<"account_types">> {
	const accountType = await validateAccountTypeOwnership(
		ctx,
		accountTypeId,
		userId
	);
	if (accountType.isArchived) {
		throw new ConvexError("ACCOUNT_TYPE_ARCHIVED");
	}
	return accountType;
}

export const getResolvedAccountTypeMetadata = (
	accountType: Doc<"account_types">
): ResolvedAccountTypeMetadata => ({
	accountTypeBalanceNature: accountType.balanceNature,
	accountTypeColor: accountType.color ?? null,
	accountTypeIcon: accountType.icon ?? null,
	accountTypeName: accountType.name,
});

export async function resolveAccountTypeMetadata(
	ctx: QueryCtx | MutationCtx,
	accountTypeId: Id<"account_types">,
	userId: Id<"users">
): Promise<ResolvedAccountTypeMetadata> {
	const accountType = await validateAccountTypeOwnership(
		ctx,
		accountTypeId,
		userId
	);
	return getResolvedAccountTypeMetadata(accountType);
}
