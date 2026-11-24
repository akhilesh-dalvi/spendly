// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import {
	createAccountType,
	prepareAccountTypeCreate,
} from "../../accountTypeHelpers";
import { accountTypeBalanceNatureValidator } from "../../accountTypeValidators";
import { executeIdempotentMutation } from "../../domain/idempotency";
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
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const accountTypes = await ctx.db
				.query("account_types")
				.withIndex("by_userId_order", (queryBuilder) =>
					queryBuilder.eq("userId", user._id)
				)
				.take(MAXIMUM_ACCOUNT_TYPES + 1);
			if (accountTypes.length > MAXIMUM_ACCOUNT_TYPES) {
				throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
			}
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
	returns: v.array(accountTypeValidator),
});

const createInput = {
	balanceNature: accountTypeBalanceNatureValidator,
	name: v.string(),
};

const unsafeTerminalText = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const validateCreateName = (name: string): string => {
	if (unsafeTerminalText.test(name)) {
		throw new ConvexError("INVALID_INPUT");
	}
	return name;
};

export const previewCreate = query({
	args: createInput,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { name } = await prepareAccountTypeCreate(
				ctx,
				user._id,
				validateCreateName(args.name)
			);
			return { balanceNature: args.balanceNature, name };
		}),
	returns: v.object(createInput),
});

export const create = mutation({
	args: {
		...createInput,
		agent: v.optional(v.boolean()),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const { idempotencyKey, ...input } = args;
			const user = await getCurrentUser(ctx);
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const type = await createAccountType(ctx, user._id, {
						balanceNature: input.balanceNature,
						name: validateCreateName(input.name),
					});
					return {
						balanceNature: type.balanceNature,
						id: type._id,
						name: type.name,
					};
				},
				key: idempotencyKey,
				operation: "accountTypes.create",
				request: input,
				userId: user._id,
			});
		}),
	returns: v.object({ ...createInput, id: v.id("account_types") }),
});
