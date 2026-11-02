import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { z } from "zod";
import { runProcess } from "./process";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const smokePattern = "(?:^|\\s)@smoke(?:\\s|$)";
const smokeMarker = new RegExp(smokePattern);
const environment = {
	PATH: process.env.PATH ?? "",
	HOME: process.env.HOME ?? "",
	npm_config_manage_package_manager_versions: "false",
	SPENDLY_E2E_ENABLED: "true",
	E2E_CONVEX_URL: "https://e2e-fixtures.convex.cloud",
	E2E_CONVEX_DEPLOY_KEY: "dev:e2e-fixtures|synthetic-secret",
	E2E_CLERK_ISSUER: "https://fixture.clerk.accounts.dev",
	E2E_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("fixture.clerk.accounts.dev$").toString("base64")}`,
	E2E_CLERK_SECRET_KEY: "sk_test_synthetic-secret",
	E2E_CLERK_OAUTH_CLIENT_ID: "test-oauth-client",
	E2E_EXTENDED_BROWSERS: "true",
};

// These are collection-only commands. Playwright --list never starts setup or
// browsers; Vitest --staticParse bypasses global setup and does not evaluate
// live files. Ordinary Vitest list DOES run global setup and is not safe here.
const collect = async (args: string[]): Promise<unknown> => {
	const result = await runProcess({
		command: "pnpm",
		args: ["--dir", workspace, "exec", ...args],
		env: environment,
		timeoutMs: 10_000,
	});
	if (result.exitCode !== 0 || result.signal !== null) {
		throw new Error("Offline E2E suite discovery failed; output withheld");
	}
	return JSON.parse(result.stdout);
};

const webSpec = z.object({
	title: z.string(),
	tags: z.array(z.string()),
	tests: z.array(z.object({ projectName: z.string() })),
});
const webSuite = z.object({
	file: z.string(),
	specs: z.array(webSpec).default([]),
	suites: z.array(z.unknown()).default([]),
});
interface WebCase {
	name: string;
	tags: string[];
	project: string;
}
const webCases = (suites: unknown[]): WebCase[] => {
	const cases: WebCase[] = [];
	for (const value of suites) {
		const suite = webSuite.parse(value);
		for (const spec of suite.specs) {
			for (const test of spec.tests) {
				cases.push({
					name: `${suite.file}:${spec.title}`,
					tags: spec.tags,
					project: test.projectName,
				});
			}
		}
		cases.push(...webCases(suite.suites));
	}
	return cases;
};
const webReport = z.object({
	suites: z.array(z.unknown()),
	errors: z.array(z.unknown()).length(0),
});

it("collects seven Chromium smoke journeys while full retains all Web and compatibility cases", async () => {
	const args = ["playwright", "test", "--list", "--reporter=json"];
	const smoke = webCases(
		webReport.parse(
			await collect([...args, "--project=chromium", "--grep", smokePattern])
		).suites
	);
	const full = webCases(webReport.parse(await collect(args)).suites);
	expect(smoke).toHaveLength(7);
	expect(smoke.every((test) => test.project === "chromium")).toBe(true);
	expect(smoke.every((test) => test.tags.includes("smoke"))).toBe(true);
	const chromium = full.filter((test) => test.project === "chromium");
	expect(chromium.length).toBeGreaterThan(smoke.length);
	const fullNames = new Set(chromium.map((test) => test.name));
	expect(smoke.every((test) => fullNames.has(test.name))).toBe(true);
	expect(full.some((test) => test.project !== "chromium")).toBe(true);
}, 30_000);

it("statically collects five CLI smoke journeys while full retains credential and terminal coverage", async () => {
	const args = [
		"vitest",
		"list",
		"--config",
		"vitest.live.config.ts",
		"--staticParse",
		"--json",
	];
	const schema = z.array(z.object({ name: z.string(), file: z.string() }));
	const smoke = schema.parse(
		await collect([...args, "--testNamePattern", smokePattern])
	);
	const full = schema.parse(await collect(args));
	expect(smoke).toHaveLength(5);
	expect(smoke.every((test) => smokeMarker.test(test.name))).toBe(true);
	expect(full.length).toBeGreaterThan(smoke.length);
	const fullNames = new Set(full.map((test) => test.name));
	expect(smoke.every((test) => fullNames.has(test.name))).toBe(true);
	expect(full.some((test) => test.file.endsWith("credentials.e2e.ts"))).toBe(
		true
	);
	expect(full.some((test) => test.file.endsWith("interactive.e2e.ts"))).toBe(
		true
	);
}, 30_000);
