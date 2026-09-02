// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { v } from "convex/values";
import { query } from "../../_generated/server";
import { getCurrentUser } from "../../helpers";
import { withCliErrors } from "./errors";
import { accountTypeMetadataValidator } from "./validators";

const MAXIMUM_ACCOUNT_TYPES = 1000;

const accountTypeValidator = v.object({
	...accountTypeMetadataValidator.fields,
	createdAt: v.string(),
	isArchived: v.boolean(),
	order: v.number(),
	updatedAt: v.string(),
});

export const list = query({
	args: { includeArchived: v.optional(v.boolean()) },
	returns: v.array(accountTypeValidator),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const accountTypes = await ctx.db
				.query("account_types")
				.withIndex("by_userId_order", (queryBuilder) =>
					queryBuilder.eq("userId", user._id)
				)
				.take(MAXIMUM_ACCOUNT_TYPES);
			return accountTypes
				.filter(
					(accountType) => args.includeArchived || !accountType.isArchived
				)
				.map((accountType) => ({
					balanceNature: accountType.balanceNature,
					color: accountType.color ?? null,
					createdAt: new Date(accountType.createdAt).toISOString(),
					icon: accountType.icon ?? null,
					id: accountType._id,
					isArchived: accountType.isArchived ?? false,
					name: accountType.name,
					order: accountType.order,
					updatedAt: new Date(
						accountType.updatedAt ?? accountType.createdAt
					).toISOString(),
				}));
		}),
});
