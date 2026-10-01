import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedGlobalOptions } from "../options.js";
import type { CliRuntime } from "../runtime.js";
import { startBackendProgress } from "./progress.js";

const humanOptions: ResolvedGlobalOptions = {
	accessible: false,
	agent: false,
	allowFileStorage: false,
	color: false,
	debug: false,
	interactive: false,
	json: false,
	nonInteractive: false,
	retry: false,
};

const createRuntime = () => {
	let stderr = "";
	const runtime = {
		promptOutput: { isTTY: true },
		stderr: {
			write: (value: string) => {
				stderr += value;
			},
		},
	} as CliRuntime;
	return { getStderr: () => stderr, runtime };
};

afterEach(() => vi.useRealTimers());

describe("backend progress", () => {
	it("reports a long wait in a human TTY", () => {
		vi.useFakeTimers();
		const testRuntime = createRuntime();
		const stop = startBackendProgress(humanOptions, testRuntime.runtime);

		expect(testRuntime.getStderr()).toBe("Connecting to Spendly...\n");
		vi.advanceTimersByTime(3000);
		expect(testRuntime.getStderr()).toContain("Still waiting for Spendly");
		stop();
	});

	it("stays silent for JSON output", () => {
		vi.useFakeTimers();
		const testRuntime = createRuntime();
		const stop = startBackendProgress(
			{ ...humanOptions, json: true },
			testRuntime.runtime
		);

		vi.advanceTimersByTime(3000);
		expect(testRuntime.getStderr()).toBe("");
		stop();
	});
});
