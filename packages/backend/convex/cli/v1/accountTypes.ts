// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { mutation, query } from "../../_generated/server";
import {
	createAccountType,
	getAccountTypeAfterWrite,
	prepareAccountTypeCreate,
	prepareAccountTypeUpdate,
	validateAccountTypeOwnership,
} from "../../accountTypeHelpers";
import { accountTypeBalanceNatureValidator } from "../../accountTypeValidators";
import {
	executeIdempotentMutation,
	fingerprintRequest,
} from "../../domain/idempotency";
import { getCurrentUser } from "../../helpers";
import { withCliErrors } from "./errors";
import { accountTypeMetadataValidator } from "./validators";

const MAXIMUM_ACCOUNT_TYPES = 1000;

const accountTypeEditViewValidator = accountTypeMetadataValidator.extend({
	isArchived: v.boolean(),
});

const accountTypeValidator = accountTypeEditViewValidator.extend({
	createdAt: v.string(),
	order: v.number(),
	updatedAt: v.string(),
});

const presentEditView = (accountType: Doc<"account_types">) => ({
	balanceNature: accountType.balanceNature,
	color: accountType.color ?? null,
	icon: accountType.icon ?? null,
	id: accountType._id,
	isArchived: accountType.isArchived ?? false,
	name: accountType.name,
});

const presentAccountType = (accountType: Doc<"account_types">) => ({
	...presentEditView(accountType),
	createdAt: new Date(accountType.createdAt).toISOString(),
	order: accountType.order,
	updatedAt: new Date(
		accountType.updatedAt ?? accountType.createdAt
	).toISOString(),
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
				.map(presentAccountType);
		}),
	returns: v.array(accountTypeValidator),
});

const createInput = {
	balanceNature: accountTypeBalanceNatureValidator,
	name: v.string(),
};

const unsafeTerminalText = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const validateAccountTypeNameText = (name: string): string => {
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
				validateAccountTypeNameText(args.name)
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
						name: validateAccountTypeNameText(input.name),
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

const editInput = v.object({
	accountTypeId: v.string(),
	balanceNature: v.optional(accountTypeBalanceNatureValidator),
	color: v.optional(v.string()),
	icon: v.optional(v.string()),
	name: v.optional(v.string()),
});

const editSnapshotPattern = /^[a-f0-9]{64}$/u;

const prepareEdit = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	input: Infer<typeof editInput>
) => {
	const accountTypeId = ctx.db.normalizeId(
		"account_types",
		input.accountTypeId
	);
	if (!accountTypeId) {
		throw new ConvexError("ACCOUNT_TYPE_NOT_FOUND");
	}
	const current = await validateAccountTypeOwnership(
		ctx,
		accountTypeId,
		userId
	);
	const { balanceNature, color, icon, name } = input;
	if (
		[balanceNature, color, icon, name].every((value) => value === undefined)
	) {
		throw new ConvexError("INVALID_INPUT");
	}
	if (icon !== undefined && !icon.trim()) {
		throw new ConvexError("INVALID_ACCOUNT_TYPE_ICON");
	}
	if (color !== undefined && !color.trim()) {
		throw new ConvexError("INVALID_ACCOUNT_TYPE_COLOR");
	}
	const patch = await prepareAccountTypeUpdate(ctx, current, {
		balanceNature,
		color,
		icon,
		name: name === undefined ? undefined : validateAccountTypeNameText(name),
	});
	const before = presentEditView(current);
	const next = { ...current, ...patch };
	const changed =
		current.balanceNature !== next.balanceNature ||
		current.color !== next.color ||
		current.icon !== next.icon ||
		current.name !== next.name ||
		current.normalizedName !== next.normalizedName;
	const editSnapshot = await fingerprintRequest({
		before,
		input,
		updatedAt: current.updatedAt,
	});
	return {
		accountTypeId,
		after: presentEditView(next),
		before,
		changed,
		current,
		editSnapshot,
		patch,
	};
};

export const previewEdit = query({
	args: editInput.fields,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { after, before, editSnapshot } = await prepareEdit(
				ctx,
				user._id,
				args
			);
			return { after, before, editSnapshot };
		}),
	returns: v.object({
		after: accountTypeEditViewValidator,
		before: accountTypeEditViewValidator,
		editSnapshot: v.string(),
	}),
});

export const edit = mutation({
	args: {
		...editInput.fields,
		agent: v.optional(v.boolean()),
		expectedEditSnapshot: v.string(),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, expectedEditSnapshot, idempotencyKey, ...input } = args;
			if (!editSnapshotPattern.test(expectedEditSnapshot)) {
				throw new ConvexError("INVALID_INPUT");
			}
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const { accountTypeId, changed, current, editSnapshot, patch } =
						await prepareEdit(ctx, user._id, input);
					if (editSnapshot !== expectedEditSnapshot) {
						throw new ConvexError("ACCOUNT_TYPE_EDIT_CONFLICT");
					}
					if (!changed) {
						return presentAccountType(current);
					}
					await ctx.db.patch(accountTypeId, {
						...patch,
						updatedAt: Date.now(),
					});
					return presentAccountType(
						await getAccountTypeAfterWrite(ctx, accountTypeId)
					);
				},
				key: idempotencyKey,
				operation: "accountTypes.edit",
				request: { ...input, agent, expectedEditSnapshot },
				userId: user._id,
			});
		}),
	returns: accountTypeValidator,
});
