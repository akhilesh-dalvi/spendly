import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { loadEnvironment } from "./environment";
import { findClerkUser } from "./users";

const config = loadEnvironment({
	SPENDLY_E2E_ENABLED: "true",
	E2E_CONVEX_URL: "https://e2e-test.convex.cloud",
	E2E_CONVEX_DEPLOY_KEY: "dev:e2e-test|synthetic",
	E2E_CLERK_ISSUER: "https://e2e-test.clerk.accounts.dev",
	E2E_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("e2e-test.clerk.accounts.dev$").toString("base64")}`,
	E2E_CLERK_SECRET_KEY: "sk_test_synthetic",
	E2E_CLERK_OAUTH_CLIENT_ID: "synthetic-client",
});
const email = `spendly-e2e-${randomUUID()}+clerk_test@example.com`;

afterEach(() => {
	vi.unstubAllGlobals();
});

it("resolves only the exact synthetic email, with a bounded lookup rather than a remote sweep", async () => {
	const fetcher = vi.fn(
		async (_request: string | URL | Request, _options?: RequestInit) =>
			Response.json([
				{ id: "user_synthetic", email_addresses: [{ email_address: email }] },
			])
	);
	vi.stubGlobal("fetch", fetcher);
	expect(await findClerkUser(config, email)).toBe("user_synthetic");
	const [request, options] = fetcher.mock.calls[0] ?? [];
	// Assert the complete call without printing any real credentials.
	expect(request).toBe(
		`https://api.clerk.com/v1/users?${new URLSearchParams({ email_address: email, limit: "2" })}`
	);
	expect(options).toMatchObject({ method: "GET" });
});

it("rejects non-fixture emails before any provider request", async () => {
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	await expect(findClerkUser(config, "real@example.com")).rejects.toThrow(
		"exact synthetic email"
	);
	expect(fetcher).not.toHaveBeenCalled();
});

it.each([
	"mismatch",
	"multiple",
	"malformed",
])("refuses %s lookup responses without disclosing provider contents", async (kind) => {
	let response: unknown = [
		{
			id: "user_synthetic",
			email_addresses: [{ email_address: "other@example.com" }],
		},
	];
	if (kind === "multiple") {
		response = [
			{ id: "user_one", email_addresses: [{ email_address: email }] },
			{ id: "user_two", email_addresses: [{ email_address: email }] },
		];
	} else if (kind === "malformed") {
		response = { private_provider_response: "secret-token" };
	}
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json(response))
	);
	await expect(findClerkUser(config, email)).rejects.toThrow(
		"lookup failed; response withheld"
	);
});
