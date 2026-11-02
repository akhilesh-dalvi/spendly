import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { accountTypeBalanceNatureValidator } from "./accountTypeValidators";
import { actionSourceValidator } from "./domain/actionSource";

export default defineSchema({
	account_transactions: defineTable({
		accountId: v.id("accounts"),
		amount: v.number(),
		balanceAfter: v.number(),
		createdAt: v.number(),
		date: v.string(),
		expenseId: v.optional(v.id("expenses")),
		note: v.optional(v.string()),
		source: v.optional(actionSourceValidator),
		transferId: v.optional(v.id("account_transfers")),
		type: v.union(
			v.literal("opening_balance"),
			v.literal("expense"),
			v.literal("manual_adjustment"),
			v.literal("transfer_in"),
			v.literal("transfer_out")
		),
		userId: v.id("users"),
	})
		.index("by_accountId_date", ["accountId", "date"])
		.index("by_accountId_date_createdAt", ["accountId", "date", "createdAt"])
		.index("by_userId_date", ["userId", "date"])
		.index("by_expenseId", ["expenseId"])
		.index("by_transferId", ["transferId"]),

	account_transfers: defineTable({
		amount: v.number(),
		createdAt: v.number(),
		date: v.string(),
		fromAccountId: v.id("accounts"),
		note: v.optional(v.string()),
		source: v.optional(actionSourceValidator),
		toAccountId: v.id("accounts"),
		userId: v.id("users"),
	})
		.index("by_userId_date", ["userId", "date"])
		.index("by_fromAccountId", ["fromAccountId"])
		.index("by_toAccountId", ["toAccountId"]),

	account_types: defineTable({
		balanceNature: accountTypeBalanceNatureValidator,
		color: v.optional(v.string()),
		createdAt: v.number(),
		icon: v.optional(v.string()),
		isArchived: v.optional(v.boolean()),
		name: v.string(),
		normalizedName: v.string(),
		order: v.number(),
		updatedAt: v.optional(v.number()),
		userId: v.id("users"),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_order", ["userId", "order"])
		.index("by_userId_normalizedName", ["userId", "normalizedName"]),

	accounts: defineTable({
		accountTypeId: v.id("account_types"),
		createdAt: v.number(),
		createdSource: v.optional(actionSourceValidator),
		// Legacy field retained for deployed rows; new accounts use the user's currency.
		currency: v.optional(v.string()),
		currentBalance: v.number(),
		isArchived: v.optional(v.boolean()),
		lastModifiedSource: v.optional(actionSourceValidator),
		name: v.string(),
		revision: v.optional(v.number()),
		startingBalance: v.number(),
		updatedAt: v.optional(v.number()),
		userId: v.id("users"),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_archived", ["userId", "isArchived"])
		.index("by_accountTypeId", ["accountTypeId"]),

	categories: defineTable({
		categoryTypeId: v.optional(v.id("category_types")),
		createdAt: v.number(),
		cycleId: v.id("expense_cycles"),
		icon: v.optional(v.string()),
		isHidden: v.optional(v.boolean()),
		name: v.string(),
		order: v.number(),
		plannedAmount: v.optional(v.number()),
		userId: v.id("users"), // Denormalized for querying.
	})
		.index("by_cycleId", ["cycleId"])
		.index("by_userId", ["userId"]),

	category_types: defineTable({
		color: v.optional(v.string()),
		createdAt: v.number(),
		name: v.string(),
		order: v.optional(v.number()),
		userId: v.id("users"),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_order", ["userId", "order"]),

	cli_cycle_deletion_confirmations: defineTable({
		categorySnapshot: v.string(),
		createdAt: v.number(),
		cycleId: v.id("expense_cycles"),
		expiresAt: v.number(),
		revision: v.number(),
		usedAt: v.optional(v.number()),
		userId: v.id("users"),
	})
		.index("by_userId_cycleId", ["userId", "cycleId"])
		.index("by_expiresAt", ["expiresAt"]),

	cli_deletion_confirmations: defineTable({
		createdAt: v.number(),
		expenseId: v.id("expenses"),
		expiresAt: v.number(),
		revision: v.number(),
		usedAt: v.optional(v.number()),
		userId: v.id("users"),
	})
		.index("by_userId_expenseId", ["userId", "expenseId"])
		.index("by_expiresAt", ["expiresAt"]),

	cli_idempotency: defineTable({
		createdAt: v.number(),
		expiresAt: v.number(),
		key: v.string(),
		operation: v.string(),
		requestFingerprint: v.string(),
		result: v.any(),
		userId: v.id("users"),
	})
		.index("by_userId_key", ["userId", "key"])
		.index("by_expiresAt", ["expiresAt"]),

	expense_cycles: defineTable({
		createdAt: v.number(),
		createdSource: v.optional(actionSourceValidator),
		endDate: v.string(), // YYYY-MM-DD
		lastModifiedSource: v.optional(actionSourceValidator),
		name: v.string(),
		revision: v.optional(v.number()),
		startDate: v.string(), // YYYY-MM-DD
		userId: v.id("users"),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_dates", ["userId", "startDate", "endDate"]),

	expenses: defineTable({
		accountId: v.optional(v.id("accounts")),
		amount: v.number(),
		categoryId: v.optional(v.id("categories")),
		createdAt: v.number(),
		createdSource: v.optional(actionSourceValidator),
		cycleId: v.optional(v.id("expense_cycles")),
		date: v.string(), // YYYY-MM-DD
		lastModifiedSource: v.optional(actionSourceValidator),
		normalizedSpentOn: v.optional(v.string()),
		revision: v.optional(v.number()),
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
		userId: v.id("users"),
	})
		.index("by_cycleId", ["cycleId"])
		.index("by_categoryId", ["categoryId"])
		.index("by_accountId", ["accountId"])
		.index("by_userId_date", ["userId", "date"])
		.index("by_userId_normalizedSpentOn_date", [
			"userId",
			"normalizedSpentOn",
			"date",
		])
		.index("by_userId_date_createdAt", ["userId", "date", "createdAt"]),

	tags: defineTable({
		createdAt: v.number(),
		name: v.string(),
		userId: v.id("users"),
	}).index("by_userId", ["userId"]),
	users: defineTable({
		accountsOnboardingStatus: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("skipped"),
				v.literal("completed")
			)
		),
		clerkId: v.string(),
		createdAt: v.number(),
		currency: v.optional(v.string()),
		dashboardViewMode: v.optional(v.string()),
		defaultAccountId: v.optional(v.id("accounts")),
		email: v.string(),
		name: v.optional(v.string()),
		onboardingCompletedAt: v.optional(v.number()),
		onboardingCycleId: v.optional(v.id("expense_cycles")),
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
	}).index("by_clerkId", ["clerkId"]),
});
