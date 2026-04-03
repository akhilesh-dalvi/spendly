import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	users: defineTable({
		clerkId: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		currency: v.optional(v.string()),
		dashboardViewMode: v.optional(v.string()),
		createdAt: v.number(),
	}).index("by_clerkId", ["clerkId"]),

	expense_cycles: defineTable({
		userId: v.id("users"),
		name: v.string(),
		startDate: v.string(), // ISO date string YYYY-MM-DD
		endDate: v.string(), // ISO date string YYYY-MM-DD
		createdAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_dates", ["userId", "startDate", "endDate"]),

	category_types: defineTable({
		userId: v.id("users"),
		name: v.string(),
		color: v.optional(v.string()),
		order: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_order", ["userId", "order"]),

	categories: defineTable({
		cycleId: v.id("expense_cycles"),
		userId: v.id("users"), // Denormalized for easier querying
		name: v.string(),
		categoryTypeId: v.optional(v.id("category_types")),
		plannedAmount: v.optional(v.number()),
		icon: v.optional(v.string()),
		isHidden: v.optional(v.boolean()),
		order: v.number(),
		createdAt: v.number(),
	})
		.index("by_cycleId", ["cycleId"])
		.index("by_userId", ["userId"]),

	tags: defineTable({
		userId: v.id("users"),
		name: v.string(),
		createdAt: v.number(),
	}).index("by_userId", ["userId"]),

	expenses: defineTable({
		userId: v.id("users"), // Denormalized
		cycleId: v.optional(v.id("expense_cycles")),
		categoryId: v.optional(v.id("categories")),
		amount: v.number(),
		date: v.string(), // ISO date string YYYY-MM-DD
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
		createdAt: v.number(),
	})
		.index("by_cycleId", ["cycleId"])
		.index("by_categoryId", ["categoryId"])
		.index("by_userId_date", ["userId", "date"]),
});
