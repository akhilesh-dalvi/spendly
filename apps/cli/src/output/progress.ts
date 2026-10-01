import type { ResolvedGlobalOptions } from "../options.js";
import type { CliRuntime } from "../runtime.js";

const LONG_WAIT_MILLISECONDS = 3000;

export const startBackendProgress = (
	globalOptions: ResolvedGlobalOptions,
	runtime: CliRuntime
): (() => void) => {
	if (globalOptions.json || runtime.promptOutput?.isTTY !== true) {
		return () => undefined;
	}

	runtime.stderr.write("Connecting to Spendly...\n");
	const longWaitTimer = setTimeout(() => {
		runtime.stderr.write(
			"Still waiting for Spendly. You can press Ctrl+C to cancel.\n"
		);
	}, LONG_WAIT_MILLISECONDS);
	longWaitTimer.unref();

	return () => clearTimeout(longWaitTimer);
};
