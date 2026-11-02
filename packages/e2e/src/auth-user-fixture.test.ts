import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { signInThroughUi, signUpThroughUi } from "./authentication";
import { loadEnvironment } from "./environment";
import { createUser } from "./users";

const state = vi.hoisted(() => ({ email: "", events: [] as string[] }));
vi.mock("./journals", () => ({
	saveJournal: vi.fn(
		(_journal: URL, record: { email: string; clerkId?: string }) => {
			state.email = record.email;
			state.events.push(record.clerkId ? "identified" : "intent");
			return Promise.resolve();
		}
	),
}));
vi.mock("@clerk/testing/playwright", () => ({
	setupClerkTestingToken: vi.fn(() => Promise.resolve()),
}));
vi.mock("./authentication", () => ({
	completeOAuth: vi.fn(),
	interactWithOAuth: vi.fn(),
	signInThroughUi: vi.fn(() => Promise.resolve()),
	signUpThroughUi: vi.fn(() => Promise.resolve()),
}));
vi.mock("convex/browser", () => ({
	ConvexHttpClient: class {
		setAuth() {
			// Only this offline module double accepts a synthetic token.
		}
		query() {
			return Promise.resolve({ clerkId: "user_synthetic", email: state.email });
		}
	},
}));

const config = loadEnvironment({
	E2E_CLERK_ISSUER: "https://e2e-test.clerk.accounts.dev",
	E2E_CLERK_OAUTH_CLIENT_ID: "synthetic-client",
	E2E_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("e2e-test.clerk.accounts.dev$").toString("base64")}`,
	E2E_CLERK_SECRET_KEY: "sk_test_synthetic",
	E2E_CONVEX_DEPLOY_KEY: "dev:e2e-test|synthetic",
	E2E_CONVEX_URL: "https://e2e-test.convex.cloud",
	SPENDLY_E2E_ENABLED: "true",
});

const fakePage = () =>
	({
		close: vi.fn(() => {
			state.events.push("close");
			return Promise.resolve();
		}),
		evaluate: vi.fn(() => Promise.resolve("offline-synthetic-token")),
		goto: vi.fn(() => Promise.resolve(null)),
		isClosed: vi.fn(() => false),
		waitForFunction: vi.fn(() => Promise.resolve()),
	}) as unknown as Page;

beforeEach(() => {
	state.email = "";
	state.events = [];
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string, options: RequestInit) => {
			if (url.endsWith("/api/mutation")) {
				state.events.push(
					state.events.length === 0 ? "preflight" : "backend-cleanup"
				);
				return Promise.resolve(Response.json({ status: "success" }));
			}
			if (options.method === "DELETE") {
				state.events.push("clerk-cleanup");
				return Promise.resolve(Response.json({}));
			}
			if (options.method === "POST") {
				state.events.push("admin-create");
				return Promise.resolve(Response.json({ id: "user_synthetic" }));
			}
			state.events.push("exact-lookup");
			return Promise.resolve(
				Response.json([
					{
						email_addresses: [{ email_address: state.email }],
						id: "user_synthetic",
					},
				])
			);
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it("uses real signup setup without an administrator POST or subsequent sign-in/navigation bypass", async () => {
	const page = fakePage();
	const user = await createUser(page, config, { creationMode: "sign-up" });
	try {
		expect(state.events).toEqual([
			"preflight",
			"intent",
			"exact-lookup",
			"identified",
		]);
		expect(signUpThroughUi).toHaveBeenCalledWith(
			page,
			user.email,
			expect.any(String)
		);
		expect(signInThroughUi).not.toHaveBeenCalled();
		expect(setupClerkTestingToken).toHaveBeenCalledWith({ page });
		expect(page.goto).toHaveBeenCalledExactlyOnceWith(
			`${config.baseUrl}/sign-up`
		);
	} finally {
		await user.dispose();
	}
});

it("keeps default admin fixtures signing in through the UI after journaled allocation", async () => {
	const page = fakePage();
	const user = await createUser(page, config);
	try {
		expect(state.events).toEqual([
			"preflight",
			"intent",
			"admin-create",
			"identified",
		]);
		expect(signInThroughUi).toHaveBeenCalledWith(
			page,
			user.email,
			expect.any(String)
		);
		expect(signUpThroughUi).not.toHaveBeenCalled();
	} finally {
		await user.dispose();
	}
});

it("refuses signup before allocation when the guarded backend cleanup preflight fails", async () => {
	const fetcher = vi.fn(() =>
		Promise.resolve(Response.json({ status: "error" }))
	);
	vi.stubGlobal("fetch", fetcher);
	await expect(
		createUser(fakePage(), config, { creationMode: "sign-up" })
	).rejects.toThrow("fixture cleanup unavailable");
	expect(state.events).toEqual([]);
	expect(signUpThroughUi).not.toHaveBeenCalled();
	expect(signInThroughUi).not.toHaveBeenCalled();
	expect(fetcher).toHaveBeenCalledOnce();
});

it("resolves and cleans up ambiguous signup allocation after closing the page", async () => {
	vi.mocked(signUpThroughUi).mockRejectedValueOnce(
		new Error("private-provider-detail")
	);
	await expect(
		createUser(fakePage(), config, { creationMode: "sign-up" })
	).rejects.toThrow("credentials withheld");
	expect(state.events).toEqual([
		"preflight",
		"intent",
		"close",
		"exact-lookup",
		"identified",
		"clerk-cleanup",
		"backend-cleanup",
	]);
});
