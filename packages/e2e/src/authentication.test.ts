import { clerkSetup } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import { expect, it, vi } from "vitest";
import {
	completeOAuth,
	configureClerk,
	signUpThroughUi,
} from "./authentication";
import { loadEnvironment } from "./environment";
import { startProcess } from "./process";

vi.mock("@clerk/testing/playwright", () => ({ clerkSetup: vi.fn() }));

const environment = () =>
	loadEnvironment({
		E2E_CLERK_ISSUER: "https://e2e-test.clerk.accounts.dev",
		E2E_CLERK_OAUTH_CLIENT_ID: "synthetic-client",
		E2E_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("e2e-test.clerk.accounts.dev$").toString("base64")}`,
		E2E_CLERK_SECRET_KEY: "sk_test_synthetic",
		E2E_CONVEX_DEPLOY_KEY: "dev:e2e-test|synthetic",
		E2E_CONVEX_URL: "https://e2e-test.convex.cloud",
		SPENDLY_E2E_ENABLED: "true",
	});

it("pins Clerk setup to the approved API, disables dotenv and discards ambient tokens", async () => {
	vi.stubEnv("CLERK_TESTING_TOKEN", "wrong-instance-token");
	vi.stubEnv("CLERK_API_URL", "https://untrusted.invalid");
	try {
		const config = environment();
		await configureClerk(config);
		expect(clerkSetup).toHaveBeenCalledWith({
			apiUrl: "https://api.clerk.com",
			dotenv: false,
			publishableKey: config.publishableKey,
			secretKey: config.secretKey,
		});
		expect(process.env.CLERK_TESTING_TOKEN).toBe("");
	} finally {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	}
});

it.each(["host", "query"])(
	"waits for a whole OAuth URL line when the %s is fragmented",
	async (split) => {
		const url =
			"https://e2e-test.clerk.accounts.dev/oauth/authorize?client_id=synthetic-client&state=private-state";
		const position = split === "host" ? 14 : url.indexOf("_id=");
		const login = startProcess({
			args: [
				"-e",
				`process.stdout.write(${JSON.stringify(url.slice(0, position))}); setTimeout(() => process.stdout.write(${JSON.stringify(`${url.slice(position)}\n`)}), 40);`,
			],
			command: process.execPath,
			timeoutMs: 1000,
		});
		const visit = vi.fn(() => Promise.resolve());
		await completeOAuth({
			clientId: "synthetic-client",
			issuer: environment().clerkIssuer,
			login,
			visit,
		});
		expect(visit).toHaveBeenCalledOnce();
		expect(visit).toHaveBeenCalledWith(url);
	}
);

it("withholds browser navigation errors containing authorization secrets", async () => {
	const url =
		"https://e2e-test.clerk.accounts.dev/oauth/authorize?client_id=synthetic-client&state=private-state";
	const login = startProcess({
		args: [
			"-e",
			`process.stdout.write(${JSON.stringify(`${url}\n`)}); setInterval(() => {}, 1000);`,
		],
		command: process.execPath,
		timeoutMs: 1000,
	});
	const authorization = completeOAuth({
		clientId: "synthetic-client",
		issuer: environment().clerkIssuer,
		login,
		visit: () =>
			Promise.reject(new Error(`page.goto: navigation failed ${url}`)),
	});
	await expect(authorization).rejects.toMatchObject({
		message:
			"E2E CLI OAuth failed; credentials and authorization details withheld.",
	});
	await expect(authorization).rejects.not.toHaveProperty("cause");
});

it("submits signup through form controls and waits for the real session", async () => {
	const email =
		"spendly-e2e-00000000-0000-0000-0000-000000000001+clerk_test@example.com";
	const password = "synthetic-password";
	const fillEmail = vi.fn();
	const fillPassword = vi.fn();
	const submit = vi.fn();
	const page = {
		evaluate: vi.fn(async () => true),
		getByLabel: (label: string | RegExp) => {
			if (label instanceof RegExp && label.test("Email address")) {
				return { fill: fillEmail };
			}
			if (label instanceof RegExp && label.test("Password")) {
				return { fill: fillPassword };
			}
			return { isVisible: async () => false };
		},
		getByRole: () => ({ click: submit }),
		locator: () => ({ isVisible: async () => false }),
	} as unknown as Page;
	await signUpThroughUi(page, email, password);
	expect(fillEmail).toHaveBeenCalledWith(email);
	expect(fillPassword).toHaveBeenCalledWith(password);
	expect(submit).toHaveBeenCalledOnce();
	expect(page.evaluate).toHaveBeenCalledOnce();
});

it("answers only a prepared signup email challenge through the verification textbox", async () => {
	const sdk: { user: object | null; client: object } = {
		client: {
			signUp: {
				verifications: {
					emailAddress: {
						expireAt: new Date("2030-01-01T00:00:00Z"),
						status: "unverified",
						strategy: "email_code",
					},
				},
			},
		},
		user: null,
	};
	vi.stubGlobal("window", { Clerk: sdk });
	vi.stubGlobal("document", { title: "Spendly signup" });
	const fillCode = vi.fn(() => {
		sdk.user = {};
		return Promise.resolve();
	});
	const field = { fill: vi.fn(), isVisible: () => Promise.resolve(false) };
	const page = {
		evaluate: (callback: () => unknown) => Promise.resolve(callback()),
		getByLabel: () => field,
		getByRole: (role: string) =>
			role === "button"
				? { click: () => Promise.resolve() }
				: { fill: fillCode, isVisible: () => Promise.resolve(true) },
		locator: () => field,
		waitForFunction: (callback: () => unknown) =>
			Promise.resolve({
				dispose: () => Promise.resolve(),
				jsonValue: () => Promise.resolve(callback()),
			}),
	} as unknown as Page;
	try {
		await signUpThroughUi(
			page,
			"spendly-e2e-00000000-0000-0000-0000-000000000001+clerk_test@example.com",
			"synthetic-password"
		);
		expect(fillCode).toHaveBeenCalledExactlyOnceWith("424242");
	} finally {
		vi.unstubAllGlobals();
	}
});

it("refuses signup for non-synthetic email before touching the browser", async () => {
	const page = { getByLabel: vi.fn() } as unknown as Page;
	await expect(
		signUpThroughUi(page, "real@example.com", "private-password")
	).rejects.toMatchObject({
		message:
			"E2E Web signup failed; credentials and provider response withheld.",
	});
	expect(page.getByLabel).not.toHaveBeenCalled();
});

it("withholds signup form errors containing credentials and provider details", async () => {
	const page = {
		getByLabel: () => ({
			fill: () => {
				throw new Error("private-password provider-response");
			},
		}),
	} as unknown as Page;
	const result = signUpThroughUi(
		page,
		"spendly-e2e-00000000-0000-0000-0000-000000000001+clerk_test@example.com",
		"private-password"
	);
	await expect(result).rejects.toThrow(
		"credentials and provider response withheld"
	);
	await expect(result).rejects.not.toHaveProperty("cause");
	await expect(result).rejects.not.toThrow("private-password");
});

it("rejects authorization requests for a different client before navigation", async () => {
	const url =
		"https://e2e-test.clerk.accounts.dev/oauth/authorize?client_id=wrong-client&state=private-state";
	const login = startProcess({
		args: ["-e", `process.stdout.write(${JSON.stringify(`${url}\n`)});`],
		command: process.execPath,
		timeoutMs: 1000,
	});
	const visit = vi.fn(() => Promise.resolve());
	await expect(
		completeOAuth({
			clientId: "synthetic-client",
			issuer: environment().clerkIssuer,
			login,
			visit,
		})
	).rejects.toThrow("authorization details withheld");
	expect(visit).not.toHaveBeenCalled();
});
