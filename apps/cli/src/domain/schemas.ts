import { z } from "zod";

export const JSON_SCHEMA_VERSION = 1 as const;

const metadataSchema = z.record(z.string(), z.unknown());

export const jsonSuccessEnvelopeSchema = z.object({
	data: z.unknown(),
	meta: metadataSchema,
	schemaVersion: z.literal(JSON_SCHEMA_VERSION),
});

export const jsonErrorEnvelopeSchema = z.object({
	error: z.object({
		code: z.string().min(1),
		details: metadataSchema,
		message: z.string(),
		retryable: z.boolean(),
	}),
	schemaVersion: z.literal(JSON_SCHEMA_VERSION),
});

export type JsonSuccessEnvelope = z.infer<typeof jsonSuccessEnvelopeSchema>;
export type JsonErrorEnvelope = z.infer<typeof jsonErrorEnvelopeSchema>;
