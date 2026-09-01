import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import type { RuntimeConfig } from "./config.js";
import { CLI_EXIT_CODE } from "./errors.js";
import type { CliRuntime } from "./runtime.js";

const VERSION_OUTPUT_PATTERN = /^0\.1\.0\n$/u;

const productionConfig: RuntimeConfig = {
	authReady: false,
	clientId: null,
	convexUrl: "https://example.convex.cloud",
	environment: "production",
	issuer: "https://issuer.example",
	webUrl: "https://spendly.example",
};

const createTestRuntime = (
	environment: NodeJS.ProcessEnv = {}
): {
	getStderr: () => string;
	getStdout: () => string;
	runtime: CliRuntime;
} => {
	let stderr = "";
	let stdout = "";
	return {
		getStderr: () => stderr,
		getStdout: () => stdout,
		runtime: {
			developmentTools: false,
			environment,
			getConfig: () => productionConfig,
			stderr: {
				write: (value) => {
					stderr += value;
				},
			},
			stdout: {
				write: (value) => {
					stdout += value;
				},
			},
		},
	};
};

describe("CLI foundation", () => {
	it("renders help without loading runtime configuration", async () => {
		const testRuntime = createTestRuntime();
		testRuntime.runtime.getConfig = () => {
			throw new Error("configuration should stay lazy");
		};

		const exitCode = await runCli(["--help"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.getStdout()).toContain("Usage: spendly");
		expect(testRuntime.getStdout()).toContain("--allow-file-storage");
		expect(testRuntime.getStderr()).toBe("");
	});

	it("renders the package version without authentication", async () => {
		const testRuntime = createTestRuntime();
		testRuntime.runtime.getConfig = () => {
			throw new Error("configuration should stay lazy");
		};

		const exitCode = await runCli(["--version"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.getStdout()).toMatch(VERSION_OUTPUT_PATTERN);
	});

	it("keeps help and version machine-readable in JSON mode", async () => {
		const helpRuntime = createTestRuntime();
		const versionRuntime = createTestRuntime();

		const helpExitCode = await runCli(
			["--json", "--help"],
			helpRuntime.runtime
		);
		const versionExitCode = await runCli(
			["--version", "--json"],
			versionRuntime.runtime
		);

		expect(helpExitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(helpRuntime.getStdout())).toMatchObject({
			data: { help: expect.stringContaining("Usage: spendly") },
			schemaVersion: 1,
		});
		expect(versionExitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(versionRuntime.getStdout())).toEqual({
			schemaVersion: 1,
			data: { version: "0.1.0" },
			meta: {},
		});
	});

	it("writes exactly one JSON document for parser failures", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			["unknown", "--json", "--non-interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.getStderr()).toBe("");
		expect(testRuntime.getStdout().trim().split("\n")).toHaveLength(1);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: { code: "INVALID_COMMAND", retryable: false },
			schemaVersion: 1,
		});
	});

	it("accepts global flags after a lazily routed subcommand", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			[
				"auth",
				"status",
				"--json",
				"--non-interactive",
				"--no-color",
				"--no-retry",
				"--debug",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: { code: "CONFIGURATION_ERROR" },
			schemaVersion: 1,
		});
		expect(testRuntime.getStderr()).toContain("Debug:");
	});

	it("respects NO_COLOR for human errors", async () => {
		const testRuntime = createTestRuntime({ NO_COLOR: "1" });

		const exitCode = await runCli(["unknown"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.getStdout()).toBe("");
		expect(testRuntime.getStderr()).toContain("Error:");
		expect(testRuntime.getStderr()).not.toContain("\u001b[");
	});
});
