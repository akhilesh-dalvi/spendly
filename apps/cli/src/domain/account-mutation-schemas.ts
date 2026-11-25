import { z } from "zod";
import {
	accountSchema,
	accountTypeMetadataSchema,
	transactionSchema,
} from "./read-schemas.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const warningSchema = z.enum(["NEGATIVE_BALANCE", "NEGATIVE_SOURCE_BALANCE"]);

export const accountCurrencyModeSchema = z.enum(["fixed", "inherited"]);

export const accountCreateProposalSchema = z.object({
	accountType: accountTypeMetadataSchema,
	currency: z.string().min(1),
	currencyMode: accountCurrencyModeSchema.optional(),
	currentBalance: z.number().finite(),
	date: dateSchema,
	name: z.string(),
	preferredCurrency: z.string().min(1).optional(),
	revision: z.number().int().positive(),
	startingBalance: z.number().finite(),
});

export const accountCreateResultSchema = accountSchema.extend({
	openingTransaction: transactionSchema,
});

export const accountUpdatePreviewSchema = z.object({
	after: accountSchema,
	before: accountSchema,
});

export const accountUpdatePreviewArraySchema = z.array(
	accountUpdatePreviewSchema
);

const balanceAdjustmentFields = {
	account: accountSchema,
	adjustment: z.number().finite(),
	currency: z.string().min(1),
	date: dateSchema,
	resultingBalance: z.number().finite(),
	warnings: z.array(warningSchema),
};

export const balanceAdjustmentPreviewSchema = z.object({
	...balanceAdjustmentFields,
	preferredCurrency: z.string().min(1).optional(),
});

export const balanceAdjustmentResultSchema = z.object({
	...balanceAdjustmentFields,
	transaction: transactionSchema.nullable(),
});

export const transferPreviewSchema = z.object({
	amount: z.number().finite(),
	currency: z.string().min(1),
	date: dateSchema,
	fromAccount: accountSchema,
	fromBalanceAfter: z.number().finite(),
	note: z.string().nullable(),
	preferredCurrency: z.string().min(1).optional(),
	toAccount: accountSchema,
	toBalanceAfter: z.number().finite(),
	warnings: z.array(warningSchema),
});

export const transferResultSchema = z.object({
	amount: z.number().finite(),
	currency: z.string().min(1),
	date: dateSchema,
	fromAccount: accountSchema,
	fromTransaction: transactionSchema,
	id: z.string().min(1),
	note: z.string().nullable(),
	toAccount: accountSchema,
	toTransaction: transactionSchema,
	warnings: z.array(warningSchema),
});

export type AccountCreateProposal = z.infer<typeof accountCreateProposalSchema>;
export type AccountCreateResult = z.infer<typeof accountCreateResultSchema>;
export type AccountUpdatePreview = z.infer<typeof accountUpdatePreviewSchema>;
export type BalanceAdjustmentPreview = z.infer<
	typeof balanceAdjustmentPreviewSchema
>;
export type BalanceAdjustmentResult = z.infer<
	typeof balanceAdjustmentResultSchema
>;
export type TransferPreview = z.infer<typeof transferPreviewSchema>;
export type TransferResult = z.infer<typeof transferResultSchema>;
