import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	getCurrentUser,
	validateCategoryOwnership,
	validateCycleOwnership,
} from "./helpers";

// --- Category Types ---

export const listTypes = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return await ctx.db
			.query("category_types")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();
	},
});

export const listTypesWithUsage = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		const types = await ctx.db
			.query("category_types")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();

		const categories = await ctx.db
			.query("categories")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();

		const typeUsage = new Map<Id<"category_types">, number>();
		for (const category of categories) {
			if (category.categoryTypeId) {
				typeUsage.set(
					category.categoryTypeId,
					(typeUsage.get(category.categoryTypeId) || 0) + 1
				);
			}
		}

		return types.map((type) => ({
			...type,
			usageCount: typeUsage.get(type._id) || 0,
		}));
	},
});

export const createType = mutation({
	args: {
		name: v.string(),
		color: v.optional(v.string()),
		order: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);

		const existing = await ctx.db
			.query("category_types")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.filter((q) => q.eq(q.field("name"), args.name))
			.first();

		if (existing) {
			throw new ConvexError("A category type with this name already exists");
		}

		let order = args.order;
		if (order === undefined) {
			const lastType = await ctx.db
				.query("category_types")
				.withIndex("by_userId_order", (q) => q.eq("userId", user._id))
				.order("desc")
				.first();
			order = (lastType?.order ?? -1) + 1;
		}
		const id = await ctx.db.insert("category_types", {
			userId: user._id,
			name: args.name,
			color: args.color,
			order,
			createdAt: Date.now(),
		});
		return await ctx.db.get(id);
	},
});

export const updateType = mutation({
	args: {
		id: v.id("category_types"),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
		order: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const type = await ctx.db.get(args.id);
		if (!type || type.userId !== user._id) {
			throw new ConvexError("UNAUTHORIZED");
		}

		if (args.name && args.name !== type.name) {
			const existing = await ctx.db
				.query("category_types")
				.withIndex("by_userId", (q) => q.eq("userId", user._id))
				.filter((q) => q.eq(q.field("name"), args.name))
				.first();

			if (existing) {
				throw new ConvexError("A category type with this name already exists");
			}
		}

		await ctx.db.patch(args.id, {
			name: args.name,
			color: args.color,
			order: args.order,
		});
		return await ctx.db.get(args.id);
	},
});

export const deleteType = mutation({
	args: { id: v.id("category_types") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const type = await ctx.db.get(args.id);
		if (!type || type.userId !== user._id) {
			throw new ConvexError("UNAUTHORIZED");
		}

		const categories = await ctx.db
			.query("categories")
			.filter((q) => q.eq(q.field("categoryTypeId"), args.id))
			.collect();

		for (const cat of categories) {
			await ctx.db.patch(cat._id, { categoryTypeId: undefined });
		}

		await ctx.db.delete(args.id);
		return { success: true };
	},
});

export const seedDefaults = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		const existing = await ctx.db
			.query("category_types")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.first();

		if (!existing) {
			await ctx.db.insert("category_types", {
				userId: user._id,
				name: "Needs",
				color: "#3b82f6", // Blue 500
				order: 0,
				createdAt: Date.now(),
			});
			await ctx.db.insert("category_types", {
				userId: user._id,
				name: "Wants",
				color: "#f59e0b", // Amber 500
				order: 1,
				createdAt: Date.now(),
			});
			await ctx.db.insert("category_types", {
				userId: user._id,
				name: "Savings",
				color: "#10b981", // Emerald 500
				order: 2,
				createdAt: Date.now(),
			});
		}
	},
});

// --- Categories (Cycle Scoped) ---

export const list = query({
	args: { cycleId: v.id("expense_cycles") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateCycleOwnership(ctx, args.cycleId, user._id);

		const categories = await ctx.db
			.query("categories")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", args.cycleId))
			.order("asc")
			.collect();

		return await Promise.all(
			categories.map(async (cat) => {
				const type = cat.categoryTypeId
					? await ctx.db.get(cat.categoryTypeId)
					: null;
				return {
					...cat,
					typeName: type?.name,
					typeColor: type?.color,
				};
			})
		);
	},
});

export const listPreviousCycleUnused = query({
	args: { currentCycleId: v.id("expense_cycles") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateCycleOwnership(ctx, args.currentCycleId, user._id);

		const currentCycle = await ctx.db.get(args.currentCycleId);
		if (!currentCycle) {
			return [];
		}

		// Find the most recent cycle before the current one
		const previousCycle = await ctx.db
			.query("expense_cycles")
			.withIndex("by_userId_dates", (q) => q.eq("userId", user._id))
			.filter((q) => q.lt(q.field("startDate"), currentCycle.startDate))
			.order("desc")
			.first();

		if (!previousCycle) {
			return [];
		}

		const previousCategories = await ctx.db
			.query("categories")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", previousCycle._id))
			.collect();

		const currentCategories = await ctx.db
			.query("categories")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", currentCycle._id))
			.collect();

		const currentCategoryNames = new Set(
			currentCategories.map((c) => c.name.toLowerCase())
		);

		return previousCategories.filter(
			(c) => !currentCategoryNames.has(c.name.toLowerCase())
		);
	},
});

export const get = query({
	args: { id: v.id("categories") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const category = await ctx.db.get(args.id);
		if (!category || category.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}
		return category;
	},
});

export const create = mutation({
	args: {
		cycleId: v.id("expense_cycles"),
		name: v.string(),
		categoryTypeId: v.optional(v.id("category_types")),
		plannedAmount: v.optional(v.number()),
		icon: v.optional(v.string()),
		isHidden: v.optional(v.boolean()),
		order: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateCycleOwnership(ctx, args.cycleId, user._id);

		let order = args.order;
		if (order === undefined) {
			const lastCat = await ctx.db
				.query("categories")
				.withIndex("by_cycleId", (q) => q.eq("cycleId", args.cycleId))
				.order("desc")
				.first();
			order = (lastCat?.order ?? -1) + 1;
		}

		const id = await ctx.db.insert("categories", {
			userId: user._id,
			cycleId: args.cycleId,
			name: args.name,
			categoryTypeId: args.categoryTypeId,
			plannedAmount: args.plannedAmount,
			icon: args.icon,
			isHidden: args.isHidden ?? false,
			order,
			createdAt: Date.now(),
		});
		return await ctx.db.get(id);
	},
});

export const update = mutation({
	args: {
		id: v.id("categories"),
		name: v.optional(v.string()),
		categoryTypeId: v.optional(v.id("category_types")),
		plannedAmount: v.optional(v.number()),
		icon: v.optional(v.string()),
		isHidden: v.optional(v.boolean()),
		order: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateCategoryOwnership(ctx, args.id, user._id);

		const updates: Partial<Doc<"categories">> = {};
		if (args.name !== undefined) {
			updates.name = args.name;
		}
		if (args.categoryTypeId !== undefined) {
			updates.categoryTypeId = args.categoryTypeId;
		}
		if (args.plannedAmount !== undefined) {
			updates.plannedAmount = args.plannedAmount;
		}
		if (args.icon !== undefined) {
			updates.icon = args.icon;
		}
		if (args.isHidden !== undefined) {
			updates.isHidden = args.isHidden;
		}
		if (args.order !== undefined) {
			updates.order = args.order;
		}

		await ctx.db.patch(args.id, updates);
		return await ctx.db.get(args.id);
	},
});

export const remove = mutation({
	args: { categoryId: v.id("categories") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await validateCategoryOwnership(ctx, args.categoryId, user._id);

		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
			.collect();

		for (const exp of expenses) {
			await ctx.db.patch(exp._id, { categoryId: undefined });
		}

		await ctx.db.delete(args.categoryId);
		return { success: true, affectedExpenses: expenses.length };
	},
});
