import type { CliError } from "../errors.js";
import type { OutputWriter } from "../runtime.js";
import { redactValue } from "../security/redact.js";

const serializeCause = (cause: unknown): unknown => {
	if (cause instanceof Error) {
		return {
			message: cause.message,
			name: cause.name,
			stack: cause.stack,
		};
	}
	return cause;
};

export const writeDebugError = (
	error: CliError,
	stderr: OutputWriter
): void => {
	const diagnostic = redactValue({
		cause: serializeCause(error.cause),
		code: error.code,
		exitCode: error.exitCode,
		message: error.message,
	});
	stderr.write(`Debug: ${JSON.stringify(diagnostic)}\n`);
};
