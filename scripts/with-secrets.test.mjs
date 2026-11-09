import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(new URL("./with-secrets.mjs", import.meta.url));
const probe = "console.log(JSON.stringify(process.argv.slice(1)))";

const run = (directory, args, env = {}) =>
	spawnSync(process.execPath, [launcher, ...args], {
		encoding: "utf8",
		env: { PATH: directory, ...env },
		timeout: 5000,
	});

const fixture = async (callback) => {
	const directory = await mkdtemp(join(tmpdir(), "spendly-secrets-test-"));
	try {
		const executable = join(directory, "infisical");
		await writeFile(
			executable,
			`#!${process.execPath}
console.log(JSON.stringify(process.argv.slice(2)));
if (process.env.FAKE_EXIT_SIGNAL) process.kill(process.pid, process.env.FAKE_EXIT_SIGNAL);
process.exitCode = Number(process.env.FAKE_EXIT_CODE || 0);
`
		);
		await chmod(executable, 0o700);
		await callback(directory);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
};

test("local dev and E2E fetch their exact environment and preserve arguments", async () => {
	await fixture((directory) => {
		for (const environment of ["dev", "e2e"]) {
			const result = run(directory, [
				environment,
				process.execPath,
				"-e",
				probe,
				"two words",
			]);
			assert.equal(result.status, 0);
			assert.deepEqual(JSON.parse(result.stdout), [
				"secrets-manager",
				"run",
				`--env=${environment}`,
				"--",
				process.execPath,
				"-e",
				probe,
				"two words",
			]);
		}
	});
});

test("CI reuses explicitly marked OIDC-injected E2E settings without Infisical CLI", () => {
	const result = run(
		"/nonexistent",
		["e2e", process.execPath, "-e", probe, "two words"],
		{
			CI: "true",
			SPENDLY_SECRETS_ENV: "e2e",
		}
	);
	assert.equal(result.status, 0);
	assert.deepEqual(JSON.parse(result.stdout), ["two words"]);
});

test("CI fails closed when injection is missing or belongs to another environment", () => {
	for (const marker of ["", "dev"]) {
		const result = run(
			"/nonexistent",
			["e2e", process.execPath, "-e", "process.exit(0)"],
			{
				CI: "true",
				SPENDLY_SECRETS_ENV: marker,
			}
		);
		assert.equal(result.status, 1);
		assert.equal(result.stdout, "");
		assert.ok(result.stderr.includes("injection"));
	}
});

test("local commands cannot bypass fetching with a CI injection marker alone", async () => {
	await fixture((directory) => {
		const result = run(directory, ["dev", "unused"], {
			SPENDLY_SECRETS_ENV: "dev",
		});
		assert.equal(result.status, 0);
		assert.equal(JSON.parse(result.stdout)[0], "secrets-manager");
	});
});

test("invalid environments and missing commands never start a subprocess", async () => {
	await fixture((directory) => {
		for (const args of [[], ["dev"], ["prod", "unused"]]) {
			const result = run(directory, args);
			assert.equal(result.status, 2);
			assert.equal(result.stdout, "");
		}
	});
});

test("failed Infisical login propagates failure without falling back to local env files", async () => {
	await fixture((directory) => {
		const result = run(directory, ["dev", "unused"], { FAKE_EXIT_CODE: "7" });
		assert.equal(result.status, 7);
	});
});

test("missing Infisical CLI fails with a safe actionable error", () => {
	const result = run("/nonexistent", ["dev", "unused"]);
	assert.equal(result.status, 1);
	assert.ok(result.stderr.includes("Infisical CLI"));
	for (const detail of ["ENOENT", "stack", "node:internal"]) {
		assert.ok(!result.stderr.includes(detail));
	}
});

test("preserves signal termination from the secret-loading process", async () => {
	await fixture((directory) => {
		const result = run(directory, ["dev", "unused"], {
			FAKE_EXIT_SIGNAL: "SIGTERM",
		});
		assert.equal(result.status, null);
		assert.equal(result.signal, "SIGTERM");
	});
});

test("CI propagates the underlying command's exit code", () => {
	const result = run(
		"/nonexistent",
		["e2e", process.execPath, "-e", "process.exit(9)"],
		{
			CI: "true",
			SPENDLY_SECRETS_ENV: "e2e",
		}
	);
	assert.equal(result.status, 9);
});
