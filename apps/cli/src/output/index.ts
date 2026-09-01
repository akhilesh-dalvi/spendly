import type { CliError } from "../errors.js";
import type { ResolvedGlobalOptions } from "../options.js";
import type { CliRuntime } from "../runtime.js";
import { redactText, redactValue } from "../security/redact.js";
import {
	createJsonErrorEnvelope,
	createJsonSuccessEnvelope,
	writeJson,
} from "./json.js";
import { writeTerminalError, writeTerminalSuccess } from "./terminal.js";

export interface OutputOptions {
	globalOptions: ResolvedGlobalOptions;
	runtime: CliRuntime;
}

export const writeSuccess = (
	data: unknown,
	options: OutputOptions,
	meta: Readonly<Record<string, unknown>> = {}
): void => {
	if (options.globalOptions.json) {
		writeJson(createJsonSuccessEnvelope(data, meta), options.runtime.stdout);
		return;
	}
	writeTerminalSuccess(redactValue(data), options.runtime.stdout);
};

export const writeError = (error: CliError, options: OutputOptions): void => {
	if (options.globalOptions.json) {
		writeJson(createJsonErrorEnvelope(error), options.runtime.stdout);
		return;
	}
	writeTerminalError({
		color: options.globalOptions.color,
		message: redactText(error.message),
		stderr: options.runtime.stderr,
	});
};
