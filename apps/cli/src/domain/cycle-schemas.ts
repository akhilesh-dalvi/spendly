import { z } from "zod";
import { cycleSchema } from "./read-schemas.js";

const copiedCategorySchema = z.object({
	name: z.string(),
	plannedAmount: z.number().finite().nonnegative().nullable(),
	sourceCategoryId: z.string().min(1),
});
export const cycleProposalSchema = z.object({
	copiedCategories: copiedCategorySchema.array(),
	copySnapshot: z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.optional(),
	endDateExclusive: z.string(),
	name: z.string(),
	startDate: z.string(),
});

export const cycleDetailSchema = cycleSchema.extend({
	revision: z.number().int().positive(),
});

export const cycleUpdatePreviewSchema = z.object({
	after: cycleDetailSchema,
	before: cycleDetailSchema,
});

export const cycleDeletePreviewSchema = z.object({
	categoryCount: z.number().int().nonnegative(),
	confirmationToken: z.string().min(1),
	cycle: cycleDetailSchema,
	expiresAt: z.iso.datetime({ offset: true }),
});

export const cycleDeleteResultSchema = z.object({
	cycle: cycleDetailSchema,
	deleted: z.literal(true),
	deletedCategoryCount: z.number().int().nonnegative(),
});

export const cycleCreateResultSchema = z.object({
	copiedCategories: copiedCategorySchema.array(),
	cycle: cycleDetailSchema,
});
