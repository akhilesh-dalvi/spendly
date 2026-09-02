import { v } from "convex/values";
import { accountTypeBalanceNatureValidator } from "../../accountTypeValidators";

export const accountTypeMetadataValidator = v.object({
	balanceNature: accountTypeBalanceNatureValidator,
	color: v.union(v.string(), v.null()),
	icon: v.union(v.string(), v.null()),
	id: v.id("account_types"),
	name: v.string(),
});

export const accountSummaryValidator = v.object({
	accountType: accountTypeMetadataValidator,
	createdAt: v.string(),
	currency: v.string(),
	currentBalance: v.number(),
	id: v.id("accounts"),
	isArchived: v.boolean(),
	isDefault: v.boolean(),
	name: v.string(),
	revision: v.number(),
	startingBalance: v.number(),
	updatedAt: v.string(),
});

export const accountCreateProposalValidator = v.object({
	accountType: accountTypeMetadataValidator,
	currency: v.string(),
	currentBalance: v.number(),
	date: v.string(),
	name: v.string(),
	revision: v.number(),
	startingBalance: v.number(),
});

export const balanceAdjustmentPreviewValidator = v.object({
	account: accountSummaryValidator,
	adjustment: v.number(),
	currency: v.string(),
	date: v.string(),
	resultingBalance: v.number(),
	warnings: v.array(v.string()),
});

export const transferPreviewValidator = v.object({
	amount: v.number(),
	currency: v.string(),
	date: v.string(),
	fromAccount: accountSummaryValidator,
	fromBalanceAfter: v.number(),
	note: v.union(v.string(), v.null()),
	toAccount: accountSummaryValidator,
	toBalanceAfter: v.number(),
	warnings: v.array(v.string()),
});

export const transferResultValidator = v.object({
	amount: v.number(),
	currency: v.string(),
	date: v.string(),
	fromAccount: accountSummaryValidator,
	id: v.id("account_transfers"),
	note: v.union(v.string(), v.null()),
	toAccount: accountSummaryValidator,
});

export const expenseSummaryValidator = v.object({
	account: v.union(
		v.null(),
		v.object({
			accountType: accountTypeMetadataValidator,
			currency: v.string(),
			id: v.id("accounts"),
			name: v.string(),
		})
	),
	amount: v.number(),
	category: v.union(
		v.null(),
		v.object({ id: v.id("categories"), name: v.string() })
	),
	createdAt: v.string(),
	currency: v.string(),
	cycle: v.union(
		v.null(),
		v.object({
			endDateExclusive: v.string(),
			id: v.id("expense_cycles"),
			name: v.string(),
			startDate: v.string(),
		})
	),
	date: v.string(),
	id: v.id("expenses"),
	revision: v.number(),
	spentOn: v.union(v.string(), v.null()),
	tags: v.array(v.object({ id: v.id("tags"), name: v.string() })),
});

export const expenseProposalValidator = v.object({
	accountId: v.union(v.id("accounts"), v.null()),
	accountSource: v.union(
		v.literal("explicit"),
		v.literal("user_default"),
		v.literal("none")
	),
	amount: v.number(),
	categoryId: v.union(v.id("categories"), v.null()),
	categorySource: v.union(
		v.literal("explicit"),
		v.literal("history"),
		v.literal("none")
	),
	currency: v.string(),
	cycleId: v.union(v.id("expense_cycles"), v.null()),
	date: v.string(),
	revision: v.number(),
	spentOn: v.union(v.string(), v.null()),
	tagIds: v.array(v.id("tags")),
});

export const expenseCreateInputValidator = {
	accountId: v.optional(v.union(v.id("accounts"), v.null())),
	amount: v.number(),
	categoryId: v.optional(v.union(v.id("categories"), v.null())),
	date: v.optional(v.string()),
	spentOn: v.optional(v.string()),
	tagIds: v.optional(v.array(v.id("tags"))),
} as const;

export const expenseUpdateInputValidator = {
	accountId: v.optional(v.union(v.id("accounts"), v.null())),
	amount: v.optional(v.number()),
	categoryId: v.optional(v.union(v.id("categories"), v.null())),
	date: v.optional(v.string()),
	expectedRevision: v.optional(v.number()),
	spentOn: v.optional(v.union(v.string(), v.null())),
	tagIds: v.optional(v.array(v.id("tags"))),
} as const;

export const accountTransactionValidator = v.object({
	accountId: v.id("accounts"),
	amount: v.number(),
	balanceAfter: v.number(),
	createdAt: v.string(),
	date: v.string(),
	id: v.id("account_transactions"),
	note: v.union(v.string(), v.null()),
	relatedId: v.union(v.id("expenses"), v.id("account_transfers"), v.null()),
	type: v.union(
		v.literal("opening_balance"),
		v.literal("expense"),
		v.literal("manual_adjustment"),
		v.literal("transfer_in"),
		v.literal("transfer_out")
	),
});
