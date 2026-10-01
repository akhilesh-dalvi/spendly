import { z } from "zod";
import { expenseSchema } from "./read-schemas.js";

const idSchema = z.string().min(1);

export const accountBalanceEffectSchema = z.object({
	accountId: idSchema,
	accountName: z.string(),
	balanceAfter: z.number().finite(),
	balanceBefore: z.number().finite(),
	currency: z.string().min(1),
	delta: z.number().finite(),
});

export const expenseProposalSchema = z.object({
	accountEffects: z.array(accountBalanceEffectSchema),
	accountId: idSchema.nullable(),
	accountSource: z.enum(["explicit", "user_default", "none"]),
	amount: z.number().finite(),
	categoryId: idSchema.nullable(),
	categorySource: z.enum(["explicit", "history", "none"]),
	currency: z.string().min(1),
	cycleId: idSchema.nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
	revision: z.number().int().positive(),
	spentOn: z.string().nullable(),
	tagIds: z.array(idSchema),
});

export const expenseMutationResultSchema = expenseSchema.extend({
	accountEffects: z.array(accountBalanceEffectSchema),
});

export const expenseCreateResultSchema = expenseMutationResultSchema.extend({
	accountSource: z.enum(["explicit", "user_default", "none"]),
	categorySource: z.enum(["explicit", "history", "none"]),
});

export const expenseUpdatePreviewSchema = z.object({
	accountEffects: z.array(accountBalanceEffectSchema),
	after: expenseSchema,
	before: expenseSchema,
});

export const expenseDeletePreviewSchema = z.object({
	accountEffects: z.array(accountBalanceEffectSchema),
	confirmationToken: idSchema,
	expiresAt: z.iso.datetime({ offset: true }),
	expense: expenseSchema,
	revision: z.number().int().positive(),
});

export const expenseDeleteResultSchema = z.object({
	accountEffects: z.array(accountBalanceEffectSchema),
	deleted: z.literal(true),
	expense: expenseSchema,
});

export type AccountBalanceEffect = z.infer<typeof accountBalanceEffectSchema>;
export type ExpenseDeletePreview = z.infer<typeof expenseDeletePreviewSchema>;
export type ExpenseDeleteResult = z.infer<typeof expenseDeleteResultSchema>;
export type ExpenseCreateResult = z.infer<typeof expenseCreateResultSchema>;
export type ExpenseMutationResult = z.infer<typeof expenseMutationResultSchema>;
export type ExpenseProposal = z.infer<typeof expenseProposalSchema>;
export type ExpenseUpdatePreview = z.infer<typeof expenseUpdatePreviewSchema>;
