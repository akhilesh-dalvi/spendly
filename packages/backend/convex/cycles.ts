import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	commitCycleCreate,
	commitCycleDelete,
	commitCycleUpdate,
	prepareCycleCreate,
	prepareCycleDelete,
	prepareCycleUpdate,
} from "./domain/cycleOperations";
import {
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

		const prepared = await prepareCycleCreate(ctx, user._id, {
			...args,
			endDateExclusive: args.endDate,
		});
		return await commitCycleCreate(ctx, user._id, prepared, "web");
	},
});

export const saveOnboardingCycle = mutation({
	args: {
		cycleId: v.optional(v.id("expense_cycles")),
		name: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	returns: v.id("expense_cycles"),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const input = {
			name: args.name,
			startDate: args.startDate,
			endDateExclusive: args.endDate,
		};
		const savedCycleId = args.cycleId ?? user.onboardingCycleId;
		let cycleId: Id<"expense_cycles">;
		if (savedCycleId) {
			const prepared = await prepareCycleUpdate(
				ctx,
				user._id,
				savedCycleId,
				input
			);
			cycleId = (await commitCycleUpdate(ctx, prepared, "web"))._id;
		} else {
			const prepared = await prepareCycleCreate(ctx, user._id, input);
			cycleId = (await commitCycleCreate(ctx, user._id, prepared, "web"))._id;
		}
		await ctx.db.patch(user._id, {
			onboardingCycleId: cycleId,
			onboardingStep: user.onboardingPath === "plan" ? "categories" : "account",
		});
		return cycleId;
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
		const prepared = await prepareCycleUpdate(ctx, user._id, args.id, {
			name: args.name,
			startDate: args.startDate,
			endDateExclusive: args.endDate,
		});
		return await commitCycleUpdate(ctx, prepared, "web");
	},
});

export const remove = mutation({
	args: { id: v.id("expense_cycles") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const prepared = await prepareCycleDelete(ctx, user._id, args.id);
		await commitCycleDelete(ctx, user, prepared);
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
