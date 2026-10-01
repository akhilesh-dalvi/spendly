import {
	JSON_SCHEMA_VERSION,
	type JsonErrorEnvelope,
	type JsonSuccessEnvelope,
	jsonErrorEnvelopeSchema,
	jsonSuccessEnvelopeSchema,
} from "../domain/schemas.js";
import type { CliError } from "../errors.js";
import type { OutputWriter } from "../runtime.js";
import { redactText, redactValue } from "../security/redact.js";

export const createJsonSuccessEnvelope = (
	data: unknown,
	meta: Readonly<Record<string, unknown>> = {}
): JsonSuccessEnvelope =>
	jsonSuccessEnvelopeSchema.parse({
		data: redactValue(data),
		meta: redactValue(meta),
		schemaVersion: JSON_SCHEMA_VERSION,
	});

export const createJsonErrorEnvelope = (error: CliError): JsonErrorEnvelope =>
	jsonErrorEnvelopeSchema.parse({
		error: {
			code: error.code,
			details: redactValue(error.details),
			message: redactText(error.message),
			retryable: error.retryable,
		},
		schemaVersion: JSON_SCHEMA_VERSION,
	});

export const writeJson = (
	document: JsonErrorEnvelope | JsonSuccessEnvelope,
	stdout: OutputWriter
): void => {
	stdout.write(`${JSON.stringify(document)}\n`);
};
