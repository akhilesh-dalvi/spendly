import { afterEach, describe, expect, it, vi } from "vitest";

const clerkDomain = "https://clerk.example.com";
const originalProcess = process;

const setEnvironment = (
	cliClientId: string | undefined,
	options: { issuer?: string; cliReadError?: Error } = {}
): void => {
	const env = new Proxy(
		{
			...originalProcess.env,
			CLERK_JWT_ISSUER_DOMAIN: options.issuer ?? clerkDomain,
			CLERK_CLI_OAUTH_CLIENT_ID: cliClientId,
		},
		{
			get(target, property, receiver) {
				if (property === "CLERK_CLI_OAUTH_CLIENT_ID" && options.cliReadError) {
					throw options.cliReadError;
				}
				return Reflect.get(target, property, receiver);
			},
		}
	);
	vi.stubGlobal("process", { ...originalProcess, env });
	vi.resetModules();
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("Clerk authentication configuration", () => {
	it("keeps Web authentication when CLI OAuth is unset", async () => {
		setEnvironment(undefined);
		const { default: config } = await import("./auth.config");
		expect(config.providers).toEqual([
			{ domain: clerkDomain, applicationID: "convex" },
		]);
	});

	it("handles Convex's missing optional environment-variable error", async () => {
		setEnvironment(undefined, {
			cliReadError: new Error(
				"Environment variable CLERK_CLI_OAUTH_CLIENT_ID is used in auth config file but its value was not set.\nGo set it in the dashboard or using `npx convex env set`"
			),
		});
		const { default: config } = await import("./auth.config");
		expect(config.providers).toEqual([
			{ domain: clerkDomain, applicationID: "convex" },
		]);
	});

	it("keeps CLI OAuth disabled for an empty client ID", async () => {
		setEnvironment("");
		const { default: config } = await import("./auth.config");
		expect(config.providers).toHaveLength(1);
	});

	it("requires the exact configured audience and issuer for CLI tokens", async () => {
		setEnvironment("approved-public-client-id");
		const { default: config } = await import("./auth.config");
		expect(config.providers).toEqual([
			{ domain: clerkDomain, applicationID: "convex" },
			{
				algorithm: "RS256",
				applicationID: "approved-public-client-id",
				issuer: clerkDomain,
				jwks: `${clerkDomain}/.well-known/jwks.json`,
				type: "customJwt",
			},
		]);
	});

	it("still rejects a missing required Web issuer", async () => {
		setEnvironment(undefined, { issuer: "" });
		await expect(import("./auth.config")).rejects.toThrow(
			"CLERK_JWT_ISSUER_DOMAIN is required"
		);
	});

	it("does not hide other environment read failures", async () => {
		const cliReadError = new Error("Environment service unavailable");
		setEnvironment(undefined, { cliReadError });
		await expect(import("./auth.config")).rejects.toThrow(cliReadError);
	});
});
