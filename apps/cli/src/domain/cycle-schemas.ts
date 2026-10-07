import { z } from "zod";
import { cycleSchema } from "./read-schemas.js";

const copiedCategorySchema = z.object({
	sourceCategoryId: z.string().min(1),
	name: z.string(),
	plannedAmount: z.number().finite().nonnegative().nullable(),
});
export const cycleProposalSchema = z.object({
	copySnapshot: z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.optional(),
	copiedCategories: copiedCategorySchema.array(),
	endDateExclusive: z.string(),
	name: z.string(),
	startDate: z.string(),
});

export const cycleDetailSchema = cycleSchema.extend({
	revision: z.number().int().positive(),
});

export const cycleUpdatePreviewSchema = z.object({
	before: cycleDetailSchema,
	after: cycleDetailSchema,
});

export const cycleDeletePreviewSchema = z.object({
	cycle: cycleDetailSchema,
	categoryCount: z.number().int().nonnegative(),
	confirmationToken: z.string().min(1),
	expiresAt: z.iso.datetime({ offset: true }),
});

export const cycleDeleteResultSchema = z.object({
	cycle: cycleDetailSchema,
	deleted: z.literal(true),
	deletedCategoryCount: z.number().int().nonnegative(),
});

export const cycleCreateResultSchema = z.object({
	cycle: cycleDetailSchema,
	copiedCategories: copiedCategorySchema.array(),
});
