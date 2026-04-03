import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	checkCycleOverlap,
	findCycleForDate,
	getCurrentUser,
	validateCycleOwnership,
} from "./helpers";

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return await ctx.db
			.query("expense_cycles")
			.withIndex("by_userId_dates", (q) => q.eq("userId", user._id))
			.order("desc")
			.collect();
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		copyFromCycleId: v.optional(v.id("expense_cycles")),
		includePlannedAmounts: v.optional(v.boolean()),
		copyCategoryIds: v.optional(v.array(v.id("categories"))),
		categoryPlannedOverrides: v.optional(
			v.array(
				v.object({
					id: v.id("categories"),
					plannedAmount: v.optional(v.number()),
				})
			)
		),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);

		if (args.startDate >= args.endDate) {
			throw new ConvexError("INVALID_DATE_RANGE");
		}

		const overlapping = await checkCycleOverlap(
			ctx,
			user._id,
			args.startDate,
			args.endDate
		);
		if (overlapping) {
			throw new ConvexError("CYCLE_OVERLAP");
		}

		const newCycleId = await ctx.db.insert("expense_cycles", {
			userId: user._id,
			name: args.name,
			startDate: args.startDate,
			endDate: args.endDate,
			createdAt: Date.now(),
		});

		if (args.copyFromCycleId) {
			await copyCategoriesFromCycle(ctx, {
				newCycleId,
				userId: user._id,
				sourceCycleId: args.copyFromCycleId,
				includePlannedAmounts: args.includePlannedAmounts ?? false,
				copyCategoryIds: args.copyCategoryIds,
				categoryPlannedOverrides: args.categoryPlannedOverrides,
			});
		}

		return await ctx.db.get(newCycleId);
	},
});

export const update = mutation({
	args: {
		id: v.id("expense_cycles"),
		name: v.optional(v.string()),
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const cycle = await validateCycleOwnership(ctx, args.id, user._id);

		const updates: Partial<Doc<"expense_cycles">> = {};
		if (args.name !== undefined) {
			updates.name = args.name;
		}

		if (args.startDate !== undefined || args.endDate !== undefined) {
			const newStart = args.startDate || cycle.startDate;
			const newEnd = args.endDate || cycle.endDate;

			if (newStart >= newEnd) {
				throw new ConvexError("INVALID_DATE_RANGE");
			}

			const overlapping = await checkCycleOverlap(
				ctx,
				user._id,
				newStart,
				newEnd,
				cycle._id
			);
			if (overlapping) {
				throw new ConvexError("CYCLE_OVERLAP");
			}
			updates.startDate = newStart;
			updates.endDate = newEnd;
		}

		await ctx.db.patch(args.id, updates);
		return await ctx.db.get(args.id);
	},
});

async function copyCategoriesFromCycle(
	ctx: MutationCtx,
	args: {
		newCycleId: Doc<"expense_cycles">["_id"];
		userId: Doc<"users">["_id"];
		sourceCycleId: Doc<"expense_cycles">["_id"];
		includePlannedAmounts: boolean;
		copyCategoryIds?: Doc<"categories">["_id"][];
		categoryPlannedOverrides?: {
			id: Doc<"categories">["_id"];
			plannedAmount?: number;
		}[];
	}
) {
	const sourceCategories = await ctx.db
		.query("categories")
		.withIndex("by_cycleId", (q) => q.eq("cycleId", args.sourceCycleId))
		.collect();

	const selectedCategoryIds = args.copyCategoryIds
		? new Set(args.copyCategoryIds)
		: null;
	const plannedOverrideIds = new Set(
		args.categoryPlannedOverrides?.map((override) => override.id) ?? []
	);
	const plannedOverrides = new Map(
		args.categoryPlannedOverrides?.map((override) => [
			override.id,
			override.plannedAmount,
		]) ?? []
	);

	for (const cat of sourceCategories) {
		if (selectedCategoryIds && !selectedCategoryIds.has(cat._id)) {
			continue;
		}
		let plannedAmount: number | undefined;
		if (plannedOverrideIds.has(cat._id)) {
			plannedAmount = plannedOverrides.get(cat._id);
		} else if (args.includePlannedAmounts) {
			plannedAmount = cat.plannedAmount;
		}

		await ctx.db.insert("categories", {
			userId: args.userId,
			cycleId: args.newCycleId,
			name: cat.name,
			categoryTypeId: cat.categoryTypeId,
			plannedAmount,
			icon: cat.icon,
			isHidden: cat.isHidden,
			order: cat.order,
			createdAt: Date.now(),
		});
	}
}

export const remove = mutation({
	args: { id: v.id("expense_cycles") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateCycleOwnership(ctx, args.id, user._id);

		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", args.id))
			.first();

		if (expenses) {
			throw new ConvexError("CYCLE_HAS_EXPENSES");
		}

		const categories = await ctx.db
			.query("categories")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", args.id))
			.collect();

		for (const cat of categories) {
			await ctx.db.delete(cat._id);
		}

		await ctx.db.delete(args.id);
		return { success: true };
	},
});

export const get = query({
	args: { cycleId: v.id("expense_cycles") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		return await validateCycleOwnership(ctx, args.cycleId, user._id);
	},
});

export const getCurrent = query({
	args: { date: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const dateToCheck = args.date || new Date().toISOString().split("T")[0];
		return await findCycleForDate(ctx, user._id, dateToCheck);
	},
});
