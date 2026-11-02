import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvironment } from "./src/environment.ts";

const workspace = fileURLToPath(new URL("./", import.meta.url));
const backend = fileURLToPath(new URL("../backend/", import.meta.url));
const cli = fileURLToPath(new URL("../../apps/cli/", import.meta.url));
const actions = new Set([
	"validate",
	"backend",
	"smoke",
	"full",
	"web",
	"cli",
	"cleanup",
]);
const [, , action] = process.argv;
const args = process.argv.slice(3);
const suiteActions = new Set(["smoke", "full"]);
const smokePattern = "(?:^|\\s)@smoke(?:\\s|$)";
let tier = "focused";
if (suiteActions.has(action)) {
	tier = action;
}
const results = [];

const record = (name, status) => {
	results.push({ name, status });
	process.stdout.write(
		`E2E ${name}: ${status === 0 ? "passed" : `failed (exit ${status})`}\n`
	);
};

const command = (name, directory, commandArgs, options = {}) => {
	const result = spawnSync("pnpm", ["--dir", directory, ...commandArgs], {
		env: process.env,
		shell: false,
		stdio: ["ignore", "inherit", "inherit"],
		timeout: 30 * 60_000,
		...options,
	});
	const status = result.status ?? 1;
	record(name, status);
	return status;
};

const deployBackend = (config, checkOnly) => {
	const directory = mkdtempSync(join(tmpdir(), "spendly-e2e-deploy-"));
	try {
		const envFile = join(directory, "deployment.env");
		// Convex 1.34 selects the exact deployment encoded by this key, even for
		// `deploy`. An explicit env file bypasses normal .env/.env.local discovery.
		// Keep the key out of argv/logs, and do not inherit Convex auth overrides.
		writeFileSync(envFile, `CONVEX_DEPLOY_KEY=${config.deployKey}\n`, {
			mode: 0o600,
		});
		return command(
			"backend",
			backend,
			[
				"exec",
				"convex",
				"deploy",
				"--env-file",
				envFile,
				"--yes",
				"--typecheck",
				"enable",
				"--codegen",
				"disable",
				...(checkOnly ? ["--dry-run"] : []),
			],
			{
				env: {
					CI: "true",
					CONVEX_DISABLE_TELEMETRY: "1",
					HOME: directory,
					// HOME intentionally has no pnpm-managed version cache. Use the
					// already-installed runner instead of bootstrapping inside it.
					npm_config_manage_package_manager_versions: "false",
					PATH: process.env.PATH ?? "",
				},
				// Deployment failures may include keys or environment values. Report only
				// the step and exit status, never raw Convex output or persisted artifacts.
				stdio: "ignore",
				timeout: 15 * 60_000,
			}
		);
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
};

const runLive = (config) => {
	if (deployBackend(config, false) !== 0) {
		return;
	}
	if (
		command("development CLI build", cli, ["run", "build:development"]) !== 0
	) {
		return;
	}
	// These are sibling runners, never a Vitest invocation inside Playwright.
	// A Web failure must not conceal independent CLI regressions.
	if (suiteActions.has(action) || action === "web") {
		command("web", workspace, [
			"exec",
			"playwright",
			"test",
			...(tier === "smoke"
				? ["--project=chromium", "--grep", smokePattern]
				: args),
		]);
	}
	if (suiteActions.has(action) || action === "cli") {
		command("cli", workspace, [
			"exec",
			"vitest",
			"run",
			"--config",
			"vitest.live.config.ts",
			...(tier === "smoke" ? ["--testNamePattern", smokePattern] : args),
		]);
	}
};

const summarize = () => {
	if (!process.env.GITHUB_STEP_SUMMARY) {
		return;
	}
	const lines = results.map(
		({ name, status }) => `| ${name} | ${status === 0 ? "passed" : "failed"} |`
	);
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		[
			"## E2E regression steps",
			"",
			`Suite: **${tier}**. Smoke is a critical-path subset; only full runs cover every existing journey.`,
			"",
			"| Step | Result |",
			"| --- | --- |",
			...lines,
			"",
			"Only executed steps are listed. Missing steps did not pass. No authentication artifacts are uploaded.",
			"",
		].join("\n")
	);
};

const main = () => {
	if (
		!actions.has(action) ||
		((suiteActions.has(action) || ["validate", "cleanup"].includes(action)) &&
			args.length > 0) ||
		(action === "backend" &&
			(args.length > 1 || (args.length === 1 && args[0] !== "--check")))
	) {
		process.stderr.write(
			"Usage: node packages/e2e/run.mjs <validate|backend [--check]|smoke|full|web|cli|cleanup> [runner arguments]\n"
		);
		return 2;
	}
	// No subprocess, connection, build, or server may precede this boundary.
	const config = loadEnvironment();
	record("configuration", 0);
	if (action === "validate") {
		return 0;
	}
	if (action === "backend") {
		return deployBackend(config, args[0] === "--check");
	}
	if (action === "cleanup") {
		return command("cleanup", workspace, ["exec", "tsx", "src/cleanup.ts"]);
	}
	if (suiteActions.has(action)) {
		process.stdout.write(`E2E suite: ${tier}\n`);
		const tooling = command("offline tooling", workspace, ["run", "test"]);
		const types = command("tooling typecheck", workspace, [
			"run",
			"check-types",
		]);
		if (tooling !== 0 || types !== 0) {
			return 1;
		}
	}
	runLive(config);
	const failure = results.find(({ status }) => status !== 0);
	if (!failure) {
		return 0;
	}
	return suiteActions.has(action) ? 1 : failure.status;
};

try {
	process.exitCode = main();
} catch {
	// Do not echo raw errors: invalid configuration and deployment failures can
	// include credentials. Offline tests cover the boundary without connections.
	process.stderr.write(
		"E2E configuration or runner failure; output withheld. See CONTRIBUTING.md.\n"
	);
	record("configuration or runner", 1);
	process.exitCode = 1;
} finally {
	summarize();
}
