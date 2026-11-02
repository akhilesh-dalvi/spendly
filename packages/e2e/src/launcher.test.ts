import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runProcess } from "./process";

const launcher = fileURLToPath(new URL("../run.mjs", import.meta.url));
const validEnvironment = {
	SPENDLY_E2E_ENABLED: "true",
	E2E_CONVEX_URL: "https://e2e-fixtures.convex.cloud",
	E2E_CONVEX_DEPLOY_KEY: "dev:e2e-fixtures|synthetic-secret",
	E2E_CLERK_ISSUER: "https://fixture.clerk.accounts.dev",
	E2E_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("fixture.clerk.accounts.dev$").toString("base64")}`,
	E2E_CLERK_SECRET_KEY: "sk_test_synthetic-secret",
	E2E_CLERK_OAUTH_CLIENT_ID: "test-oauth-client",
};

const withLauncher = async (
	run: (directory: string) => Promise<void>
): Promise<void> => {
	const directory = await mkdtemp(join(tmpdir(), "spendly-launcher-"));
	try {
		const pnpm = join(directory, "pnpm");
		// This executable only records arguments. No runner, connection, build,
		// deployment or server is started by these offline orchestration tests.
		await writeFile(
			pnpm,
			`#!${process.execPath}
import { appendFileSync, readFileSync, statSync } from "node:fs";
const args = process.argv.slice(2);
const backend = args.includes("convex");
const step = backend ? "backend" : args[3];
const envFile = backend ? args[args.indexOf("--env-file") + 1] : null;
appendFileSync(${JSON.stringify(join(directory, "calls.jsonl"))}, JSON.stringify({
  args, step, marker: process.env.E2E_LAUNCHER_PROBE,
  override: process.env.CONVEX_OVERRIDE_ACCESS_TOKEN,
  manageVersions: process.env.npm_config_manage_package_manager_versions,
  secret: process.env.E2E_CLERK_SECRET_KEY,
  envFile, mode: envFile ? statSync(envFile).mode & 0o777 : null,
  deployment: envFile ? readFileSync(envFile, "utf8") : null,
}) + "\\n");
if (backend) process.stdout.write("synthetic-secret must remain withheld");
process.exitCode = JSON.parse(readFileSync(${JSON.stringify(join(directory, "failures.json"))}, "utf8"))[step] || 0;
`
		);
		await chmod(pnpm, 0o700);
		await writeFile(join(directory, "failures.json"), "{}");
		await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};

const calls = async (directory: string) => {
	const content = await readFile(join(directory, "calls.jsonl"), "utf8");
	return content
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
};

it("exposes only the canonical root smoke and full suite commands", async () => {
	const root = JSON.parse(
		await readFile(new URL("../../../package.json", import.meta.url), "utf8")
	);
	const workspace = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8")
	);
	expect(root.scripts["test:e2e:smoke"]).toBe(
		"node packages/e2e/run.mjs smoke"
	);
	expect(root.scripts["test:e2e:full"]).toBe("node packages/e2e/run.mjs full");
	expect(root.scripts).not.toHaveProperty("test:e2e");
	for (const alias of ["test:regression", "test:smoke", "test:full"]) {
		expect(workspace.scripts).not.toHaveProperty(alias);
	}
});

it("forwards file-loaded settings and runner arguments without nested runners", async () => {
	await withLauncher(async (directory) => {
		const environment = join(directory, "fixture.env");
		await writeFile(
			environment,
			Object.entries({ ...validEnvironment, E2E_LAUNCHER_PROBE: "loaded" })
				.map(([key, value]) => `${key}=${value}`)
				.join("\n")
		);
		const result = await runProcess({
			command: process.execPath,
			args: [`--env-file=${environment}`, launcher, "web", "--list"],
			env: { PATH: directory },
		});
		expect(result.exitCode).toBe(0);
		const commands = await calls(directory);
		expect(commands.map((entry) => entry.step)).toEqual([
			"backend",
			"build:development",
			"playwright",
		]);
		expect(commands[2]).toMatchObject({
			marker: "loaded",
			args: [
				"--dir",
				fileURLToPath(new URL("../", import.meta.url)),
				"exec",
				"playwright",
				"test",
				"--list",
			],
		});
	});
});

it("validates before any subprocess, including deployment, and never echoes credentials", async () => {
	await withLauncher(async (directory) => {
		for (const action of [
			"validate",
			"backend",
			"smoke",
			"full",
			"web",
			"cli",
			"cleanup",
		]) {
			const result = await runProcess({
				command: process.execPath,
				args: [launcher, action],
				env: {
					...validEnvironment,
					PATH: directory,
					E2E_CONVEX_DEPLOY_KEY: "prod:e2e-fixtures|do-not-log",
				},
			});
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("E2E configuration");
			expect(result.stderr).not.toContain("do-not-log");
		}
		await expect(
			readFile(join(directory, "calls.jsonl"))
		).rejects.toMatchObject({ code: "ENOENT" });
	});
});

it("supports an entirely offline configuration validation action", async () => {
	const result = await runProcess({
		command: process.execPath,
		args: [launcher, "validate"],
		env: { ...validEnvironment, PATH: "" },
	});
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toContain("configuration: passed");
});

it("deploys only through an isolated owner-only key file and supports an explicit online dry-run check", async () => {
	await withLauncher(async (directory) => {
		const result = await runProcess({
			command: process.execPath,
			args: [launcher, "backend", "--check"],
			env: {
				...validEnvironment,
				PATH: directory,
				CONVEX_OVERRIDE_ACCESS_TOKEN: "ambient-token",
				CONVEX_DEPLOY_KEY: "prod:wrong|key",
			},
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).not.toContain("synthetic-secret");
		const [deployment] = await calls(directory);
		expect(deployment.args).toEqual([
			"--dir",
			fileURLToPath(new URL("../../backend/", import.meta.url)),
			"exec",
			"convex",
			"deploy",
			"--env-file",
			deployment.envFile,
			"--yes",
			"--typecheck",
			"enable",
			"--codegen",
			"disable",
			"--dry-run",
		]);
		expect(deployment).toMatchObject({
			mode: 0o600,
			manageVersions: "false",
			deployment: `CONVEX_DEPLOY_KEY=${validEnvironment.E2E_CONVEX_DEPLOY_KEY}\n`,
		});
		expect(deployment.override).toBeUndefined();
		expect(deployment.secret).toBeUndefined();
		expect(JSON.stringify(deployment.args)).not.toContain("synthetic-secret");
		await expect(readFile(deployment.envFile)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});

it("runs full sequentially, continues after a Web failure, and summarizes without secrets", async () => {
	await withLauncher(async (directory) => {
		await writeFile(
			join(directory, "failures.json"),
			JSON.stringify({ playwright: 7 })
		);
		const summary = join(directory, "summary.md");
		const result = await runProcess({
			command: process.execPath,
			args: [launcher, "full"],
			env: {
				...validEnvironment,
				PATH: directory,
				GITHUB_STEP_SUMMARY: summary,
			},
		});
		expect(result.exitCode).toBe(1);
		const commands = await calls(directory);
		expect(commands.map((entry) => entry.step)).toEqual([
			"test",
			"check-types",
			"backend",
			"build:development",
			"playwright",
			"vitest",
		]);
		expect(commands[4].args.slice(2)).toEqual(["exec", "playwright", "test"]);
		expect(commands[5].args.slice(2)).toEqual([
			"exec",
			"vitest",
			"run",
			"--config",
			"vitest.live.config.ts",
		]);
		const report = await readFile(summary, "utf8");
		expect(report).toContain("Suite: **full**");
		expect(report).toContain("| web | failed |");
		expect(report).toContain("| cli | passed |");
		expect(report).not.toContain("synthetic-secret");
	});
});

it("runs smoke sequentially with fixed Chromium and CLI tag filters, not a partial full gate", async () => {
	await withLauncher(async (directory) => {
		await writeFile(
			join(directory, "failures.json"),
			JSON.stringify({ playwright: 7 })
		);
		const summary = join(directory, "smoke-summary.md");
		const result = await runProcess({
			command: process.execPath,
			args: [launcher, "smoke"],
			env: {
				...validEnvironment,
				PATH: directory,
				E2E_EXTENDED_BROWSERS: "true",
				GITHUB_STEP_SUMMARY: summary,
			},
		});
		expect(result.exitCode).toBe(1);
		const commands = await calls(directory);
		expect(commands.map((entry) => entry.step)).toEqual([
			"test",
			"check-types",
			"backend",
			"build:development",
			"playwright",
			"vitest",
		]);
		const pattern = "(?:^|\\s)@smoke(?:\\s|$)";
		expect(commands[4].args.slice(2)).toEqual([
			"exec",
			"playwright",
			"test",
			"--project=chromium",
			"--grep",
			pattern,
		]);
		expect(commands[5].args.slice(2)).toEqual([
			"exec",
			"vitest",
			"run",
			"--config",
			"vitest.live.config.ts",
			"--testNamePattern",
			pattern,
		]);
		const report = await readFile(summary, "utf8");
		expect(report).toContain("Suite: **smoke**");
		expect(report).toContain("| web | failed |");
		expect(report).toContain("| cli | passed |");
		expect(report).not.toContain("synthetic-secret");
	});
});

it("stops live work if deployment or the prerequisite build fails", async () => {
	await withLauncher(async (directory) => {
		for (const failure of ["backend", "build:development"]) {
			await writeFile(
				join(directory, "failures.json"),
				JSON.stringify({ [failure]: 7 })
			);
			await writeFile(join(directory, "calls.jsonl"), "");
			const result = await runProcess({
				command: process.execPath,
				args: [launcher, "web"],
				env: { ...validEnvironment, PATH: directory },
			});
			expect(result.exitCode).toBe(7);
			expect((await calls(directory)).map((entry) => entry.step)).toEqual(
				failure === "backend" ? ["backend"] : ["backend", "build:development"]
			);
		}
	});
});

it("does not deploy when offline checks fail, but still runs the offline typecheck", async () => {
	await withLauncher(async (directory) => {
		await writeFile(
			join(directory, "failures.json"),
			JSON.stringify({ test: 1 })
		);
		const result = await runProcess({
			command: process.execPath,
			args: [launcher, "full"],
			env: { ...validEnvironment, PATH: directory },
		});
		expect(result.exitCode).toBe(1);
		expect((await calls(directory)).map((entry) => entry.step)).toEqual([
			"test",
			"check-types",
		]);
	});
});

it("preserves a direct backend failure's exit status and removes its key file", async () => {
	await withLauncher(async (directory) => {
		await writeFile(
			join(directory, "failures.json"),
			JSON.stringify({ backend: 7 })
		);
		const result = await runProcess({
			command: process.execPath,
			args: [launcher, "backend"],
			env: { ...validEnvironment, PATH: directory },
		});
		expect(result.exitCode).toBe(7);
		const [deployment] = await calls(directory);
		await expect(readFile(deployment.envFile)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});

it("rejects retired aliases, unknown actions and suite/deploy selection overrides without starting commands", async () => {
	for (const args of [
		["invalid"],
		["regression"],
		["full", "--grep", "subset"],
		["smoke", "--grep", "subset"],
		["smoke", "--project", "firefox"],
		["backend", "--prod"],
		["backend", "--check", "--yes"],
	]) {
		const result = await runProcess({
			command: process.execPath,
			args: [launcher, ...args],
			env: { PATH: "" },
		});
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("Usage:");
	}
});
