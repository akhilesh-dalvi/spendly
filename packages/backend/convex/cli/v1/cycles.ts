import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { mutation, query } from "../../_generated/server";
import { resolveCliActionSource } from "../../domain/actionSource";
import {
	type CycleCreateInput,
	commitCycleCreate,
	commitCycleDelete,
	commitCycleUpdate,
	prepareCycleCreate,
	prepareCycleDelete,
	prepareCycleUpdate,
	presentCycleCreateProposal,
	validateCycleRevision,
} from "../../domain/cycleOperations";
import {
	DELETION_CONFIRMATION_LIFETIME_MS,
	executeIdempotentMutation,
} from "../../domain/idempotency";
import { getRevision } from "../../domain/revisions";
import { getCurrentUser, validateCycleOwnership } from "../../helpers";
import { withCliErrors } from "./errors";
import { presentCycleDetail } from "./presenters";
import {
	copiedCategoryProposalValidator,
	cycleCreatePreviewValidator,
	cycleDetailValidator,
} from "./validators";

// Normalize IDs inside the error boundary so malformed IDs get stable CLI errors.
const resourceId = <Table extends "expense_cycles" | "categories">(
	ctx: QueryCtx | MutationCtx,
	table: Table,
	value: string
) => {
	const id = ctx.db.normalizeId(table, value);
	if (!id) {
		throw new ConvexError("INVALID_INPUT");
	}
	return id;
};

const createArgs = {
	name: v.string(),
	startDate: v.string(),
	endDateExclusive: v.string(),
	copyFromCycleId: v.optional(v.string()),
	includePlannedAmounts: v.optional(v.boolean()),
	copyCategoryIds: v.optional(v.array(v.string())),
	categoryPlannedOverrides: v.optional(
		v.array(v.object({ id: v.string(), plannedAmount: v.optional(v.number()) }))
	),
};

interface CreateInput {
	name: string;
	startDate: string;
	endDateExclusive: string;
	copyFromCycleId?: string;
	includePlannedAmounts?: boolean;
	copyCategoryIds?: string[];
	categoryPlannedOverrides?: { id: string; plannedAmount?: number }[];
}

const normalizeCreateInput = (
	ctx: QueryCtx | MutationCtx,
	input: CreateInput
): CycleCreateInput => ({
	...input,
	copyFromCycleId:
		input.copyFromCycleId === undefined
			? undefined
			: resourceId(ctx, "expense_cycles", input.copyFromCycleId),
	copyCategoryIds: input.copyCategoryIds?.map((id) =>
		resourceId(ctx, "categories", id)
	),
	categoryPlannedOverrides: input.categoryPlannedOverrides?.map((override) => ({
		...override,
		id: resourceId(ctx, "categories", override.id),
	})),
});

export const get = query({
	args: { cycleId: v.string() },
	returns: cycleDetailValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const cycleId = resourceId(ctx, "expense_cycles", args.cycleId);
			return presentCycleDetail(
				await validateCycleOwnership(ctx, cycleId, user._id)
			);
		}),
});

export const previewCreate = query({
	args: createArgs,
	returns: cycleCreatePreviewValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const input = normalizeCreateInput(ctx, args);
			return presentCycleCreateProposal(
				await prepareCycleCreate(ctx, user._id, input)
			);
		}),
});

export const create = mutation({
	args: {
		...createArgs,
		idempotencyKey: v.string(),
		agent: v.optional(v.boolean()),
	},
	returns: v.object({
		cycle: cycleDetailValidator,
		copiedCategories: v.array(copiedCategoryProposalValidator),
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, idempotencyKey, ...input } = args;
			const source = resolveCliActionSource(agent);
			return await executeIdempotentMutation(ctx, {
				userId: user._id,
				key: idempotencyKey,
				operation: "cycles.create",
				request: { ...input, source },
				execute: async () => {
					const prepared = await prepareCycleCreate(
						ctx,
						user._id,
						normalizeCreateInput(ctx, input)
					);
					const cycle = await commitCycleCreate(
						ctx,
						user._id,
						prepared,
						source
					);
					return {
						cycle: presentCycleDetail(cycle),
						copiedCategories: prepared.copiedCategories,
					};
				},
			});
		}),
});

const updateArgs = {
	cycleId: v.string(),
	name: v.optional(v.string()),
	startDate: v.optional(v.string()),
	endDateExclusive: v.optional(v.string()),
	expectedRevision: v.optional(v.number()),
};

export const previewUpdate = query({
	args: updateArgs,
	returns: v.object({
		before: cycleDetailValidator,
		after: cycleDetailValidator,
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { cycleId, ...input } = args;
			const prepared = await prepareCycleUpdate(
				ctx,
				user._id,
				resourceId(ctx, "expense_cycles", cycleId),
				input
			);
			return {
				before: presentCycleDetail(prepared.before),
				after: presentCycleDetail(prepared.after),
			};
		}),
});

export const update = mutation({
	args: {
		...updateArgs,
		expectedRevision: v.number(),
		idempotencyKey: v.string(),
		agent: v.optional(v.boolean()),
	},
	returns: cycleDetailValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, idempotencyKey, cycleId, ...input } = args;
			const source = resolveCliActionSource(agent);
			return await executeIdempotentMutation(ctx, {
				userId: user._id,
				key: idempotencyKey,
				operation: "cycles.update",
				request: { cycleId, ...input, source },
				execute: async () => {
					const prepared = await prepareCycleUpdate(
						ctx,
						user._id,
						resourceId(ctx, "expense_cycles", cycleId),
						input
					);
					return presentCycleDetail(
						await commitCycleUpdate(ctx, prepared, source)
					);
				},
			});
		}),
});

export const previewDelete = mutation({
	args: { cycleId: v.string() },
	returns: v.object({
		cycle: cycleDetailValidator,
		categoryCount: v.number(),
		confirmationToken: v.string(),
		expiresAt: v.string(),
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const cycleId = resourceId(ctx, "expense_cycles", args.cycleId);
			const prepared = await prepareCycleDelete(ctx, user._id, cycleId);
			const now = Date.now();
			const expiresAt = now + DELETION_CONFIRMATION_LIFETIME_MS;
			const confirmationToken = await ctx.db.insert(
				"cli_cycle_deletion_confirmations",
				{
					userId: user._id,
					cycleId,
					revision: getRevision(prepared.cycle.revision),
					categorySnapshot: prepared.categorySnapshot,
					createdAt: now,
					expiresAt,
				}
			);
			return {
				cycle: presentCycleDetail(prepared.cycle),
				categoryCount: prepared.categories.length,
				confirmationToken,
				expiresAt: new Date(expiresAt).toISOString(),
			};
		}),
});

export const remove = mutation({
	args: {
		cycleId: v.string(),
		expectedRevision: v.number(),
		confirmationToken: v.string(),
		idempotencyKey: v.string(),
		agent: v.optional(v.boolean()),
	},
	returns: v.object({
		cycle: cycleDetailValidator,
		deleted: v.literal(true),
		deletedCategoryCount: v.number(),
	}),
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, idempotencyKey, ...input } = args;
			const source = resolveCliActionSource(agent);
			return await executeIdempotentMutation(ctx, {
				userId: user._id,
				key: idempotencyKey,
				operation: "cycles.delete",
				request: { ...input, source },
				execute: async () => {
					validateCycleRevision(input.expectedRevision);
					const cycleId = resourceId(ctx, "expense_cycles", input.cycleId);
					const tokenId = ctx.db.normalizeId(
						"cli_cycle_deletion_confirmations",
						input.confirmationToken
					);
					const confirmation = tokenId ? await ctx.db.get(tokenId) : null;
					if (
						!confirmation ||
						confirmation.userId !== user._id ||
						confirmation.cycleId !== cycleId ||
						confirmation.revision !== input.expectedRevision ||
						confirmation.usedAt !== undefined
					) {
						throw new ConvexError("DELETION_CONFIRMATION_INVALID");
					}
					const now = Date.now();
					if (confirmation.expiresAt <= now) {
						throw new ConvexError("DELETION_CONFIRMATION_EXPIRED");
					}
					const prepared = await prepareCycleDelete(
						ctx,
						user._id,
						cycleId,
						input.expectedRevision
					);
					if (prepared.categorySnapshot !== confirmation.categorySnapshot) {
						throw new ConvexError("DELETION_CONFIRMATION_INVALID");
					}
					await commitCycleDelete(ctx, user, prepared);
					await ctx.db.patch(confirmation._id, { usedAt: now });
					return {
						cycle: presentCycleDetail(prepared.cycle),
						deleted: true as const,
						deletedCategoryCount: prepared.categories.length,
					};
				},
			});
		}),
});
