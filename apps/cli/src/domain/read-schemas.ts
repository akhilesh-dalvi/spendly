import { z } from "zod";

const idSchema = z.string().min(1);
const timestampSchema = z.iso.datetime({ offset: true });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const accountTypeMetadataSchema = z.object({
	balanceNature: z.enum(["asset", "liability"]),
	color: z.string().nullable(),
	icon: z.string().nullable(),
	id: idSchema,
	name: z.string(),
});

export const accountSchema = z.object({
	accountType: accountTypeMetadataSchema,
	createdAt: timestampSchema,
	currency: z.string().min(1),
	currentBalance: z.number().finite(),
	id: idSchema,
	isArchived: z.boolean(),
	isDefault: z.boolean(),
	name: z.string(),
	revision: z.number().int().positive(),
	startingBalance: z.number().finite(),
	updatedAt: timestampSchema,
});

export const expenseSchema = z.object({
	account: z
		.object({
			accountType: accountTypeMetadataSchema,
			currency: z.string().min(1),
			id: idSchema,
			name: z.string(),
		})
		.nullable(),
	amount: z.number().finite(),
	category: z.object({ id: idSchema, name: z.string() }).nullable(),
	createdAt: timestampSchema,
	currency: z.string().min(1),
	cycle: z
		.object({
			endDateExclusive: dateSchema,
			id: idSchema,
			name: z.string(),
			startDate: dateSchema,
		})
		.nullable(),
	date: dateSchema,
	id: idSchema,
	revision: z.number().int().positive(),
	spentOn: z.string().nullable(),
	tags: z.array(z.object({ id: idSchema, name: z.string() })),
});

export const expensePageSchema = z.object({
	hasMore: z.boolean(),
	items: z.array(expenseSchema),
	nextCursor: z.string().nullable(),
});

export const transactionSchema = z.object({
	accountId: idSchema,
	amount: z.number().finite(),
	balanceAfter: z.number().finite(),
	createdAt: timestampSchema,
	date: dateSchema,
	id: idSchema,
	note: z.string().nullable(),
	relatedId: idSchema.nullable(),
	type: z.enum([
		"opening_balance",
		"expense",
		"manual_adjustment",
		"transfer_in",
		"transfer_out",
	]),
});

export const transactionPageSchema = z.object({
	hasMore: z.boolean(),
	items: z.array(transactionSchema),
	nextCursor: z.string().nullable(),
});

export const accountTypeSchema = accountTypeMetadataSchema.extend({
	createdAt: timestampSchema,
	isArchived: z.boolean(),
	order: z.number(),
	updatedAt: timestampSchema,
});

export const cycleSchema = z.object({
	createdAt: timestampSchema,
	endDateExclusive: dateSchema,
	id: idSchema,
	name: z.string(),
	startDate: dateSchema,
});

export const categorySchema = z.object({
	categoryType: z
		.object({ color: z.string().nullable(), id: idSchema, name: z.string() })
		.nullable(),
	createdAt: timestampSchema,
	cycleId: idSchema,
	icon: z.string().nullable(),
	id: idSchema,
	isHidden: z.boolean(),
	name: z.string(),
	order: z.number(),
	plannedAmount: z.number().finite().nullable(),
});

export const tagSchema = z.object({
	createdAt: timestampSchema,
	id: idSchema,
	name: z.string(),
});

const categoryStatSchema = z.object({
	categoryId: idSchema.nullable(),
	difference: z.number().finite().nullable(),
	icon: z.string().nullable(),
	name: z.string(),
	planned: z.number().finite().nullable(),
	progressPercent: z.number().finite().nullable(),
	spent: z.number().finite(),
	typeId: idSchema.nullable(),
	typeName: z.string().nullable(),
});

export const summarySchema = z.object({
	categories: z.array(categoryStatSchema),
	cycle: cycleSchema,
	daysRemaining: z.number().int().nullable(),
	remaining: z.number().finite(),
	totalPlanned: z.number().finite(),
	totalSpent: z.number().finite(),
	types: z.array(
		z.object({
			categories: z.array(categoryStatSchema),
			totalPlanned: z.number().finite(),
			totalSpent: z.number().finite(),
			typeId: idSchema.nullable(),
			typeName: z.string(),
		})
	),
});

export const contextSchema = z.object({
	accounts: z.array(accountSchema),
	accountsOnboardingStatus: z.enum(["pending", "skipped", "completed"]),
	capabilities: z.object({
		accountMutations: z.boolean(),
		deletionConfirmation: z.boolean(),
		expenseMutations: z.boolean(),
		idempotencyRetentionDays: z.number().int().positive(),
		maximumPageSize: z.number().int().positive(),
		schemaVersion: z.literal(1),
	}),
	categories: z.array(
		z.object({ id: idSchema, name: z.string(), order: z.number() })
	),
	currency: z.string().min(1),
	currentCycle: cycleSchema.omit({ createdAt: true }).nullable(),
	dateSource: z.enum(["explicit", "local_default"]),
	effectiveDate: dateSchema,
	tags: z.array(z.object({ id: idSchema, name: z.string() })),
	timezone: z.string().nullable(),
	totals: z.array(
		z.object({ currency: z.string().min(1), total: z.number().finite() })
	),
	userId: idSchema,
	warnings: z.array(z.string()),
});

export type Account = z.infer<typeof accountSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Context = z.infer<typeof contextSchema>;
export type Cycle = z.infer<typeof cycleSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
