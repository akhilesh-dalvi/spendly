import { afterEach, describe, expect, it, vi } from "vitest";
import type { CredentialStore } from "../src/auth/credential-store.js";
import type { StoredSession } from "../src/auth/types.js";
import { runCli } from "../src/cli.js";
import type { RuntimeConfig } from "../src/config.js";
import { CLI_EXIT_CODE } from "../src/errors.js";
import type { CliRuntime } from "../src/runtime.js";

// Keep these tests away from the developer's real operating-system keychain.
vi.mock("@napi-rs/keyring", () => ({
	Entry: class {
		deletePassword() {
			return undefined;
		}
		getPassword() {
			return null;
		}
	},
}));

const config: RuntimeConfig = {
	authReady: true,
	clientId: "test-client",
	convexUrl: "https://backend.example",
	environment: "development",
	issuer: "https://issuer.example",
	webUrl: "http://localhost:3001",
};

const createHarness = (developmentTools: boolean, store: CredentialStore) => {
	let stdout = "";
	let stderr = "";
	const runtime: CliRuntime = {
		credentialStore: store,
		developmentTools,
		environment: { SPENDLY_E2E_CREDENTIAL_FILE: "/private/secret-credentials" },
		getConfig: () => config,
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
	};
	return { getStderr: () => stderr, getStdout: () => stdout, runtime };
};

const mismatchedSession: StoredSession = {
	clientId: "another-client",
	issuer: "https://another-issuer.example",
	loginAt: Date.now(),
	schemaVersion: 1,
	subject: "test-user",
	tokens: {
		expiresAt: Date.now() + 60_000,
		idToken: "not-a-valid-id-token",
		refreshToken: "private-refresh-token",
	},
};

afterEach(() => {
	vi.unstubAllGlobals();
});

const createMemoryStore = (initial: StoredSession): CredentialStore => {
	let session: StoredSession | null = initial;
	return {
		delete: () => {
			session = null;
			return Promise.resolve();
		},
		read: () => Promise.resolve(session),
		write: (value) => {
			session = value;
			return Promise.resolve();
		},
	};
};

const rejectInjection = (): Promise<never> =>
	Promise.reject(new Error("must not use injected credentials"));

describe("development auth credential injection", () => {
	it.each([
		{ command: ["auth", "status"] },
		{ command: ["context"] },
	])("ignores injected storage for $command in production", async ({
		command,
	}) => {
		const store: CredentialStore = {
			delete: rejectInjection,
			read: rejectInjection,
			write: rejectInjection,
		};
		const harness = createHarness(false, store);
		Object.defineProperty(harness.runtime, "credentialStore", {
			get: () => {
				throw new Error("must not inspect injected credentials");
			},
		});

		expect(await runCli([...command, "--json"], harness.runtime)).toBe(
			CLI_EXIT_CODE.authentication
		);
		expect(JSON.parse(harness.getStdout())).toMatchObject({
			error: {
				code: "AUTHENTICATION_REQUIRED",
				message: "Run `spendly auth login` first",
			},
		});
	});

	it("still verifies injected tokens with the authentication provider", async () => {
		const store = createMemoryStore({
			...mismatchedSession,
			clientId: "test-client",
			issuer: "https://issuer.example",
			tokens: {
				...mismatchedSession.tokens,
				expiresAt: Date.now() + 3_600_000,
			},
		});
		vi.stubGlobal("fetch", (resource: string | URL) => {
			if (String(resource).endsWith("/.well-known/openid-configuration")) {
				return Promise.resolve(
					Response.json({
						authorization_endpoint: "https://issuer.example/authorize",
						issuer: "https://issuer.example",
						jwks_uri: "https://issuer.example/jwks",
						token_endpoint: "https://issuer.example/token",
					})
				);
			}
			return Promise.resolve(
				Response.json({ error: "invalid_grant" }, { status: 400 })
			);
		});
		const harness = createHarness(true, store);

		expect(await runCli(["auth", "status", "--json"], harness.runtime)).toBe(
			CLI_EXIT_CODE.authentication
		);
		expect(JSON.parse(harness.getStdout())).toMatchObject({
			error: { code: "AUTHENTICATION_REQUIRED" },
		});
		expect(await store.read()).toBeNull();
		expect(harness.getStdout()).not.toContain("private-refresh-token");
		expect(harness.getStdout()).not.toContain("not-a-valid-id-token");
	});
	it.each([
		{ command: ["auth", "status"] },
		{ command: ["context"] },
	])("uses injected storage for $command without bypassing authentication", async ({
		command,
	}) => {
		const store = createMemoryStore(mismatchedSession);
		const harness = createHarness(true, store);

		const exitCode = await runCli([...command, "--json"], harness.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.authentication);
		expect(JSON.parse(harness.getStdout())).toMatchObject({
			error: {
				code: "AUTHENTICATION_REQUIRED",
				message:
					"Stored credentials belong to a different authentication configuration",
			},
		});
		expect(await store.read()).toBeNull();
		expect(harness.getStderr()).toBe("");
	});
});
