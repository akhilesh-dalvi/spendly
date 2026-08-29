import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { accountTypeBalanceNatureValidator } from "./accountTypeValidators";

export default defineSchema({
	users: defineTable({
		clerkId: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		currency: v.optional(v.string()),
		dashboardViewMode: v.optional(v.string()),
		defaultAccountId: v.optional(v.id("accounts")),
		onboardingPath: v.optional(v.union(v.literal("free"), v.literal("plan"))),
		onboardingStep: v.optional(
			v.union(
				v.literal("start"),
				v.literal("cycle"),
				v.literal("categories"),
				v.literal("account"),
				v.literal("complete")
			)
		),
		onboardingCycleId: v.optional(v.id("expense_cycles")),
		accountsOnboardingStatus: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("skipped"),
				v.literal("completed")
			)
		),
		onboardingCompletedAt: v.optional(v.number()),
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

	account_types: defineTable({
		userId: v.id("users"),
		name: v.string(),
		normalizedName: v.string(),
		balanceNature: accountTypeBalanceNatureValidator,
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		order: v.number(),
		isArchived: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_order", ["userId", "order"])
		.index("by_userId_normalizedName", ["userId", "normalizedName"]),

	accounts: defineTable({
		userId: v.id("users"),
		name: v.string(),
		accountTypeId: v.id("account_types"),
		startingBalance: v.number(),
		currentBalance: v.number(),
		// Legacy field retained for deployed rows; new accounts use the user's currency.
		currency: v.optional(v.string()),
		isArchived: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_archived", ["userId", "isArchived"])
		.index("by_accountTypeId", ["accountTypeId"]),

	account_transfers: defineTable({
		userId: v.id("users"),
		fromAccountId: v.id("accounts"),
		toAccountId: v.id("accounts"),
		amount: v.number(),
		date: v.string(),
		note: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_userId_date", ["userId", "date"])
		.index("by_fromAccountId", ["fromAccountId"])
		.index("by_toAccountId", ["toAccountId"]),

	account_transactions: defineTable({
		userId: v.id("users"),
		accountId: v.id("accounts"),
		type: v.union(
			v.literal("opening_balance"),
			v.literal("expense"),
			v.literal("manual_adjustment"),
			v.literal("transfer_in"),
			v.literal("transfer_out")
		),
		amount: v.number(),
		balanceAfter: v.number(),
		date: v.string(),
		note: v.optional(v.string()),
		expenseId: v.optional(v.id("expenses")),
		transferId: v.optional(v.id("account_transfers")),
		createdAt: v.number(),
	})
		.index("by_accountId_date", ["accountId", "date"])
		.index("by_userId_date", ["userId", "date"])
		.index("by_expenseId", ["expenseId"])
		.index("by_transferId", ["transferId"]),

	expenses: defineTable({
		userId: v.id("users"), // Denormalized
		cycleId: v.optional(v.id("expense_cycles")),
		categoryId: v.optional(v.id("categories")),
		accountId: v.optional(v.id("accounts")),
		amount: v.number(),
		date: v.string(), // ISO date string YYYY-MM-DD
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
		createdAt: v.number(),
	})
		.index("by_cycleId", ["cycleId"])
		.index("by_categoryId", ["categoryId"])
		.index("by_accountId", ["accountId"])
		.index("by_userId_date", ["userId", "date"]),
});
