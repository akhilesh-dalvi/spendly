// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { checkCycleOverlap, validateCycleOwnership } from "../helpers";
import { forEachSequential } from "../lib/async";
import type { ActionSource } from "./actionSource";
import { validateLocalDate } from "./dates";
import { fingerprintRequest } from "./idempotency";
import { assertRevision, INITIAL_REVISION, nextRevision } from "./revisions";

type ReadContext = QueryCtx | MutationCtx;

export interface CycleCreateInput {
	categoryPlannedOverrides?: { id: Id<"categories">; plannedAmount?: number }[];
	copyCategoryIds?: Id<"categories">[];
	copyFromCycleId?: Id<"expense_cycles">;
	endDateExclusive: string;
	includePlannedAmounts?: boolean;
	name: string;
	startDate: string;
}

const validatePlannedAmount = (amount: number | undefined): void => {
	if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
		throw new ConvexError("INVALID_INPUT");
	}
};

const prepareCopySelection = (
	categories: Doc<"categories">[],
	userId: Id<"users">,
	input: CycleCreateInput
) => {
	const byId = new Map(categories.map((category) => [category._id, category]));
	const selectedIds =
		input.copyCategoryIds === undefined ? null : new Set(input.copyCategoryIds);
	if (selectedIds && selectedIds.size !== input.copyCategoryIds?.length) {
		throw new ConvexError("INVALID_INPUT");
	}
	const overrides = new Map<Id<"categories">, number | undefined>();
	for (const id of input.copyCategoryIds ?? []) {
		if (byId.get(id)?.userId !== userId) {
			throw new ConvexError("UNAUTHORIZED");
		}
	}
	for (const override of input.categoryPlannedOverrides ?? []) {
		if (byId.get(override.id)?.userId !== userId) {
			throw new ConvexError("UNAUTHORIZED");
		}
		if (
			overrides.has(override.id) ||
			(selectedIds && !selectedIds.has(override.id))
		) {
			throw new ConvexError("INVALID_INPUT");
		}
		validatePlannedAmount(override.plannedAmount);
		overrides.set(override.id, override.plannedAmount);
	}
	return {
		overrides,
		selected: categories.filter(
			(category) => !selectedIds || selectedIds.has(category._id)
		),
	};
};

const validateCopyCategoryOwnership = async (
	ctx: ReadContext,
	category: Doc<"categories">,
	userId: Id<"users">
): Promise<void> => {
	if (category.userId !== userId) {
		throw new ConvexError("UNAUTHORIZED");
	}
	if (category.categoryTypeId) {
		const type = await ctx.db.get(category.categoryTypeId);
		if (type?.userId !== userId) {
			throw new ConvexError("UNAUTHORIZED");
		}
	}
};

const prepareCopiedCategories = async (
	ctx: ReadContext,
	userId: Id<"users">,
	input: CycleCreateInput
): Promise<Doc<"categories">[]> => {
	const sourceCycleId = input.copyFromCycleId;
	if (!sourceCycleId) {
		if (
			(input.copyCategoryIds?.length ?? 0) > 0 ||
			(input.categoryPlannedOverrides?.length ?? 0) > 0
		) {
			throw new ConvexError("INVALID_INPUT");
		}
		return [];
	}
	await validateCycleOwnership(ctx, sourceCycleId, userId);
	const categories = await ctx.db
		.query("categories")
		.withIndex("by_cycleId", (q) => q.eq("cycleId", sourceCycleId))
		.collect();
	const { selected, overrides } = prepareCopySelection(
		categories,
		userId,
		input
	);
	const copied: Doc<"categories">[] = [];
	await forEachSequential(
		selected.sort(
			(left, right) =>
				left.order - right.order ||
				String(left._id).localeCompare(String(right._id))
		),
		async (category) => {
			await validateCopyCategoryOwnership(ctx, category, userId);
			let plannedAmount = input.includePlannedAmounts
				? category.plannedAmount
				: undefined;
			if (overrides.has(category._id)) {
				plannedAmount = overrides.get(category._id);
			}
			validatePlannedAmount(plannedAmount);
			copied.push({ ...category, plannedAmount });
		}
	);
	return copied;
};

export const presentCycleCreateProposal = (
	prepared: Awaited<ReturnType<typeof prepareCycleCreate>>
) => ({
	copiedCategories: prepared.copiedCategories,
	endDateExclusive: prepared.endDateExclusive,
	name: prepared.name,
	startDate: prepared.startDate,
	...(prepared.copySnapshot === undefined
		? {}
		: { copySnapshot: prepared.copySnapshot }),
});

export const prepareCycleCreate = async (
	ctx: ReadContext,
	userId: Id<"users">,
	input: CycleCreateInput
) => {
	const name = input.name.trim();
	if (!name) {
		throw new ConvexError("INVALID_INPUT");
	}
	const startDate = validateLocalDate(input.startDate);
	const endDateExclusive = validateLocalDate(input.endDateExclusive);
	if (startDate >= endDateExclusive) {
		throw new ConvexError("INVALID_DATE_RANGE");
	}
	if (await checkCycleOverlap(ctx, userId, startDate, endDateExclusive)) {
		throw new ConvexError("CYCLE_OVERLAP");
	}
	const categories = await prepareCopiedCategories(ctx, userId, input);
	const copiedCategories = categories.map((category) => ({
		name: category.name,
		plannedAmount: category.plannedAmount ?? null,
		sourceCategoryId: category._id,
	}));
	// Category edits do not advance the cycle revision; hash the copied fields.
	const copySnapshot =
		input.copyFromCycleId === undefined
			? undefined
			: await fingerprintRequest({
					categories: categories.map((category) => ({
						categoryTypeId: category.categoryTypeId,
						icon: category.icon,
						isHidden: category.isHidden,
						name: category.name,
						order: category.order,
						plannedAmount: category.plannedAmount,
						sourceCategoryId: category._id,
					})),
					copyFromCycleId: input.copyFromCycleId,
				});
	return {
		categories,
		copiedCategories,
		copySnapshot,
		endDateExclusive,
		name,
		startDate,
	};
};

export interface CycleUpdateInput {
	endDateExclusive?: string;
	expectedRevision?: number;
	name?: string;
	startDate?: string;
}

export const validateCycleRevision = (expectedRevision: number): void => {
	if (
		!Number.isSafeInteger(expectedRevision) ||
		expectedRevision < INITIAL_REVISION
	) {
		throw new ConvexError("INVALID_INPUT");
	}
};

export const prepareCycleUpdate = async (
	ctx: ReadContext,
	userId: Id<"users">,
	cycleId: Id<"expense_cycles">,
	input: CycleUpdateInput
) => {
	const before = await validateCycleOwnership(ctx, cycleId, userId);
	if (input.expectedRevision !== undefined) {
		validateCycleRevision(input.expectedRevision);
		assertRevision(
			before.revision,
			input.expectedRevision,
			"CYCLE_REVISION_CONFLICT"
		);
	}
	const name = (input.name ?? before.name).trim();
	if (!name) {
		throw new ConvexError("INVALID_INPUT");
	}
	const startDate = validateLocalDate(input.startDate ?? before.startDate);
	const endDate = validateLocalDate(input.endDateExclusive ?? before.endDate);
	if (startDate >= endDate) {
		throw new ConvexError("INVALID_DATE_RANGE");
	}
	if (await checkCycleOverlap(ctx, userId, startDate, endDate, cycleId)) {
		throw new ConvexError("CYCLE_OVERLAP");
	}
	return {
		after: {
			...before,
			endDate,
			name,
			revision: nextRevision(before.revision),
			startDate,
		},
		before,
	};
};

export const commitCycleUpdate = async (
	ctx: MutationCtx,
	prepared: Awaited<ReturnType<typeof prepareCycleUpdate>>,
	source: ActionSource
) => {
	const { after } = prepared;
	await ctx.db.patch(after._id, {
		endDate: after.endDate,
		lastModifiedSource: source,
		name: after.name,
		revision: after.revision,
		startDate: after.startDate,
	});
	return { ...after, lastModifiedSource: source };
};

export const prepareCycleDelete = async (
	ctx: ReadContext,
	userId: Id<"users">,
	cycleId: Id<"expense_cycles">,
	expectedRevision?: number
) => {
	const cycle = await validateCycleOwnership(ctx, cycleId, userId);
	if (expectedRevision !== undefined) {
		validateCycleRevision(expectedRevision);
		assertRevision(cycle.revision, expectedRevision, "CYCLE_REVISION_CONFLICT");
	}
	const expense = await ctx.db
		.query("expenses")
		.withIndex("by_cycleId", (q) => q.eq("cycleId", cycleId))
		.first();
	if (expense) {
		throw new ConvexError("CYCLE_HAS_EXPENSES");
	}
	const categories = await ctx.db
		.query("categories")
		.withIndex("by_cycleId", (q) => q.eq("cycleId", cycleId))
		.collect();
	await forEachSequential(categories, async (category) => {
		if (category.userId !== userId) {
			throw new ConvexError("UNAUTHORIZED");
		}
		const linkedExpense = await ctx.db
			.query("expenses")
			.withIndex("by_categoryId", (q) => q.eq("categoryId", category._id))
			.first();
		if (linkedExpense) {
			throw new ConvexError("CYCLE_HAS_EXPENSES");
		}
	});
	const categorySnapshot = await fingerprintRequest(
		categories.sort((left, right) =>
			String(left._id).localeCompare(String(right._id))
		)
	);
	return { categories, categorySnapshot, cycle };
};

export const commitCycleDelete = async (
	ctx: MutationCtx,
	user: Doc<"users">,
	prepared: Awaited<ReturnType<typeof prepareCycleDelete>>
): Promise<void> => {
	await forEachSequential(prepared.categories, async (category) => {
		await ctx.db.delete(category._id);
	});
	if (user.onboardingCycleId === prepared.cycle._id) {
		await ctx.db.patch(user._id, { onboardingCycleId: undefined });
	}
	await ctx.db.delete(prepared.cycle._id);
};

export const commitCycleCreate = async (
	ctx: MutationCtx,
	userId: Id<"users">,
	prepared: Awaited<ReturnType<typeof prepareCycleCreate>>,
	source: ActionSource
): Promise<Doc<"expense_cycles">> => {
	const id = await ctx.db.insert("expense_cycles", {
		createdAt: Date.now(),
		createdSource: source,
		endDate: prepared.endDateExclusive,
		lastModifiedSource: source,
		name: prepared.name,
		revision: INITIAL_REVISION,
		startDate: prepared.startDate,
		userId,
	});
	await forEachSequential(prepared.categories, async (category) => {
		await ctx.db.insert("categories", {
			categoryTypeId: category.categoryTypeId,
			createdAt: Date.now(),
			cycleId: id,
			icon: category.icon,
			isHidden: category.isHidden,
			name: category.name,
			order: category.order,
			plannedAmount: category.plannedAmount,
			userId,
		});
	});
	const cycle = await ctx.db.get(id);
	if (!cycle) {
		throw new Error("Created cycle was not found");
	}
	return cycle;
};
