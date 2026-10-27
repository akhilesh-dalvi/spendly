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
	categoryPlannedOverrides: v.optional(
		v.array(v.object({ id: v.string(), plannedAmount: v.optional(v.number()) }))
	),
	copyCategoryIds: v.optional(v.array(v.string())),
	copyFromCycleId: v.optional(v.string()),
	endDateExclusive: v.string(),
	includePlannedAmounts: v.optional(v.boolean()),
	name: v.string(),
	startDate: v.string(),
};

interface CreateInput {
	categoryPlannedOverrides?: { id: string; plannedAmount?: number }[];
	copyCategoryIds?: string[];
	copyFromCycleId?: string;
	endDateExclusive: string;
	includePlannedAmounts?: boolean;
	name: string;
	startDate: string;
}

const normalizeCreateInput = (
	ctx: QueryCtx | MutationCtx,
	input: CreateInput
): CycleCreateInput => ({
	...input,
	categoryPlannedOverrides: input.categoryPlannedOverrides?.map((override) => ({
		...override,
		id: resourceId(ctx, "categories", override.id),
	})),
	copyCategoryIds: input.copyCategoryIds?.map((id) =>
		resourceId(ctx, "categories", id)
	),
	copyFromCycleId:
		input.copyFromCycleId === undefined
			? undefined
			: resourceId(ctx, "expense_cycles", input.copyFromCycleId),
});

export const get = query({
	args: { cycleId: v.string() },
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const cycleId = resourceId(ctx, "expense_cycles", args.cycleId);
			return presentCycleDetail(
				await validateCycleOwnership(ctx, cycleId, user._id)
			);
		}),
	returns: cycleDetailValidator,
});

export const previewCreate = query({
	args: createArgs,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const input = normalizeCreateInput(ctx, args);
			return presentCycleCreateProposal(
				await prepareCycleCreate(ctx, user._id, input)
			);
		}),
	returns: cycleCreatePreviewValidator,
});

export const create = mutation({
	args: {
		...createArgs,
		agent: v.optional(v.boolean()),
		expectedCopySnapshot: v.optional(v.string()),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, idempotencyKey, expectedCopySnapshot, ...input } = args;
			const source = resolveCliActionSource(agent);
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareCycleCreate(
						ctx,
						user._id,
						normalizeCreateInput(ctx, input)
					);
					if (
						(prepared.copySnapshot === undefined) !==
						(expectedCopySnapshot === undefined)
					) {
						throw new ConvexError("INVALID_INPUT");
					}
					if (prepared.copySnapshot !== expectedCopySnapshot) {
						throw new ConvexError("CYCLE_COPY_CONFLICT");
					}
					const cycle = await commitCycleCreate(
						ctx,
						user._id,
						prepared,
						source
					);
					return {
						copiedCategories: prepared.copiedCategories,
						cycle: presentCycleDetail(cycle),
					};
				},
				key: idempotencyKey,
				operation: "cycles.create",
				request: { ...input, expectedCopySnapshot, source },
				userId: user._id,
			});
		}),
	returns: v.object({
		copiedCategories: v.array(copiedCategoryProposalValidator),
		cycle: cycleDetailValidator,
	}),
});

const updateArgs = {
	cycleId: v.string(),
	endDateExclusive: v.optional(v.string()),
	expectedRevision: v.optional(v.number()),
	name: v.optional(v.string()),
	startDate: v.optional(v.string()),
};

export const previewUpdate = query({
	args: updateArgs,
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
				after: presentCycleDetail(prepared.after),
				before: presentCycleDetail(prepared.before),
			};
		}),
	returns: v.object({
		after: cycleDetailValidator,
		before: cycleDetailValidator,
	}),
});

export const update = mutation({
	args: {
		...updateArgs,
		agent: v.optional(v.boolean()),
		expectedRevision: v.number(),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, idempotencyKey, cycleId, ...input } = args;
			const source = resolveCliActionSource(agent);
			return await executeIdempotentMutation(ctx, {
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
				key: idempotencyKey,
				operation: "cycles.update",
				request: { cycleId, ...input, source },
				userId: user._id,
			});
		}),
	returns: cycleDetailValidator,
});

export const previewDelete = mutation({
	args: { cycleId: v.string() },
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
					categorySnapshot: prepared.categorySnapshot,
					createdAt: now,
					cycleId,
					expiresAt,
					revision: getRevision(prepared.cycle.revision),
					userId: user._id,
				}
			);
			return {
				categoryCount: prepared.categories.length,
				confirmationToken,
				cycle: presentCycleDetail(prepared.cycle),
				expiresAt: new Date(expiresAt).toISOString(),
			};
		}),
	returns: v.object({
		categoryCount: v.number(),
		confirmationToken: v.string(),
		cycle: cycleDetailValidator,
		expiresAt: v.string(),
	}),
});

export const remove = mutation({
	args: {
		agent: v.optional(v.boolean()),
		confirmationToken: v.string(),
		cycleId: v.string(),
		expectedRevision: v.number(),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, idempotencyKey, ...input } = args;
			const source = resolveCliActionSource(agent);
			return await executeIdempotentMutation(ctx, {
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
				key: idempotencyKey,
				operation: "cycles.delete",
				request: { ...input, source },
				userId: user._id,
			});
		}),
	returns: v.object({
		cycle: cycleDetailValidator,
		deleted: v.literal(true),
		deletedCategoryCount: v.number(),
	}),
});
