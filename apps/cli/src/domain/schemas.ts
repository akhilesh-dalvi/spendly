import { z } from "zod";

export const JSON_SCHEMA_VERSION = 1 as const;

const metadataSchema = z.record(z.string(), z.unknown());

export const jsonSuccessEnvelopeSchema = z.object({
	schemaVersion: z.literal(JSON_SCHEMA_VERSION),
	data: z.unknown(),
	meta: metadataSchema,
});

export const jsonErrorEnvelopeSchema = z.object({
	schemaVersion: z.literal(JSON_SCHEMA_VERSION),
	error: z.object({
		code: z.string().min(1),
		details: metadataSchema,
		message: z.string(),
		retryable: z.boolean(),
	}),
});

export type JsonSuccessEnvelope = z.infer<typeof jsonSuccessEnvelopeSchema>;
export type JsonErrorEnvelope = z.infer<typeof jsonErrorEnvelopeSchema>;
