import { describe, expect, it } from "vitest";
import { loadEnvironment, webEnvironment } from "./environment";
import { runProcess } from "./process";

const validEnvironment = () => ({
	SPENDLY_E2E_ENABLED: "true",
	E2E_CONVEX_URL: "https://e2e-fixtures.convex.cloud",
	E2E_CONVEX_DEPLOY_KEY: "dev:e2e-fixtures|synthetic-secret",
	E2E_CLERK_ISSUER: "https://fixture.clerk.accounts.dev",
	E2E_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("fixture.clerk.accounts.dev$").toString("base64")}`,
	E2E_CLERK_SECRET_KEY: "sk_test_synthetic-secret",
	E2E_CLERK_OAUTH_CLIENT_ID: "test-oauth-client",
});

describe("live E2E environment boundary", () => {
	it("loads live configuration without collecting offline unit tests", async () => {
		const configUrl = new URL("../vitest.live.config.ts", import.meta.url);
		const result = await runProcess({
			command: process.execPath,
			args: [
				"--experimental-strip-types",
				"--input-type=module",
				"-e",
				`const { default: config } = await import(${JSON.stringify(configUrl.href)}); process.stdout.write(JSON.stringify({ maxWorkers: config.test.maxWorkers, include: config.test.include, allowOnly: config.test.allowOnly }));`,
			],
			env: validEnvironment(),
		});
		expect(result.exitCode).toBe(0);
		expect(result.signal).toBeNull();
		expect(JSON.parse(result.stdout)).toEqual({
			maxWorkers: 1,
			include: ["cli/**/*.e2e.ts"],
			allowOnly: false,
		});
	});

	it("keeps ordinary tooling configuration secret-free and excludes live suites", async () => {
		const configUrl = new URL("../vitest.config.ts", import.meta.url);
		const result = await runProcess({
			command: process.execPath,
			args: [
				"--input-type=module",
				"-e",
				`const { default: config } = await import(${JSON.stringify(configUrl.href)}); process.stdout.write(JSON.stringify({ include: config.test.include, exclude: config.test.exclude, allowOnly: config.test.allowOnly }));`,
			],
			env: {},
		});
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			include: ["src/**/*.test.ts"],
			exclude: ["cli/**", "web/**", ".e2e/**"],
			allowOnly: false,
		});
	});

	it("requires deliberate opt-in and complete configuration", () => {
		expect(() => loadEnvironment({})).toThrow("E2E configuration");
		expect(() =>
			loadEnvironment({ ...validEnvironment(), SPENDLY_E2E_ENABLED: "false" })
		).toThrow("E2E configuration");
	});

	it("accepts matching development endpoints and uses only local Web", () => {
		expect(loadEnvironment(validEnvironment())).toMatchObject({
			baseUrl: "http://localhost:3001",
			convexUrl: "https://e2e-fixtures.convex.cloud",
			clerkIssuer: "https://fixture.clerk.accounts.dev",
		});
	});

	it("pins the Web server's Clerk API and redirects instead of inheriting local overrides", () => {
		expect(webEnvironment(loadEnvironment(validEnvironment()))).toMatchObject({
			CLERK_API_URL: "https://api.clerk.com",
			NEXT_PUBLIC_CLERK_PROXY_URL: "",
			CLERK_PROXY_URL: "",
			NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
			NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
			NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: "/onboarding/start",
			NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: "/onboarding/start",
		});
	});

	it("rejects production or mismatched deployment keys before any connection", () => {
		for (const key of [
			"prod:e2e-fixtures|secret",
			"dev:another-deployment|secret",
		]) {
			expect(() =>
				loadEnvironment({ ...validEnvironment(), E2E_CONVEX_DEPLOY_KEY: key })
			).toThrow("E2E configuration");
		}
		expect(() =>
			loadEnvironment({
				...validEnvironment(),
				E2E_CONVEX_URL: "https://successful-donkey-782.convex.cloud",
				E2E_CONVEX_DEPLOY_KEY: "dev:successful-donkey-782|secret",
			})
		).toThrow("E2E configuration");
	});

	it("rejects empty, project, multiline and malformed deploy keys before writing a deploy file", () => {
		for (const deployKey of [
			"dev:e2e-fixtures|",
			"project:team:project|secret",
			"dev:e2e-fixtures|secret\nCONVEX_DEPLOYMENT=prod:wrong",
			"dev:e2e-fixtures|secret\n",
			"dev:e2e-fixtures|secret|other",
			"dev:e2e-fixtures|secret #comment",
		]) {
			expect(() =>
				loadEnvironment({
					...validEnvironment(),
					E2E_CONVEX_DEPLOY_KEY: deployKey,
				})
			).toThrow("E2E configuration");
		}
	});

	it("rejects credentials, paths, whitespace and non-HTTPS deployment origins", () => {
		for (const convexUrl of [
			"http://e2e-fixtures.convex.cloud",
			"https://user@e2e-fixtures.convex.cloud",
			"https://e2e-fixtures.convex.cloud/path",
			"https://e2e-fixtures.convex.cloud?x=1",
			"https://e2e-fixtures.convex.cloud#fragment",
			"https://e2e-fixtures.convex.cloud\n",
			"https://e2e-fixtures.convex.cloud:8443",
			"https://elsewhere.example.com",
		]) {
			expect(() =>
				loadEnvironment({ ...validEnvironment(), E2E_CONVEX_URL: convexUrl })
			).toThrow("E2E configuration");
		}
	});

	it("limits optional browser projects to explicitly tagged compatibility cases while keeping full Chromium", async () => {
		const configUrl = new URL("../playwright.config.ts", import.meta.url);
		for (const extended of ["false", "true"]) {
			const result = await runProcess({
				command: process.execPath,
				args: [
					"--input-type=module",
					"-e",
					`const { default: config } = await import(${JSON.stringify(configUrl.href)}); process.stdout.write(JSON.stringify(config.projects.map(p => ({ name: p.name, untagged: !p.grep || p.grep.test('ordinary journey'), tagged: !p.grep || p.grep.test('journey @compatibility'), nearMatch: !p.grep || p.grep.test('journey @compatibilityExtra'), hyphenatedTag: !p.grep || p.grep.test('journey @compatibility-other') }))));`,
				],
				env: { ...validEnvironment(), E2E_EXTENDED_BROWSERS: extended },
			});
			expect(result.exitCode).toBe(0);
			const projects = JSON.parse(result.stdout);
			expect(projects[0]).toEqual({
				name: "chromium",
				untagged: true,
				tagged: true,
				nearMatch: true,
				hyphenatedTag: true,
			});
			expect(projects.slice(1)).toEqual(
				extended === "true"
					? ["firefox", "webkit", "narrow-chromium"].map((name) => ({
							name,
							untagged: false,
							tagged: true,
							nearMatch: false,
							hyphenatedTag: false,
						}))
					: []
			);
		}
	});

	it("rejects live Clerk keys and mismatched issuer without echoing secrets", () => {
		const secret = "sk_live_do-not-print-this";
		let message = "";
		try {
			loadEnvironment({ ...validEnvironment(), E2E_CLERK_SECRET_KEY: secret });
		} catch (error) {
			message = error instanceof Error ? error.message : "";
		}
		expect(message).toContain("E2E configuration");
		expect(message).not.toContain(secret);
		expect(() =>
			loadEnvironment({
				...validEnvironment(),
				E2E_CLERK_ISSUER: "https://another.clerk.accounts.dev",
			})
		).toThrow("E2E configuration");
	});
});
