import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type CredentialStore,
	createCredentialStore,
} from "../auth/credential-store.js";
import { login } from "../auth/login.js";
import { getActiveSession, logoutSession } from "../auth/session.js";
import type { StoredSession } from "../auth/types.js";
import type { AuthReadyRuntimeConfig, RuntimeConfig } from "../config.js";
import {
	type ConvexIdentityProof,
	proveConvexIdentity,
} from "../convex-proof.js";
import { CliError } from "../errors.js";
import type { CliRuntime } from "../runtime.js";
import {
	resolveIdentityProof,
	runAuthLogin,
	runAuthLogout,
	runAuthStatus,
} from "./auth-actions.js";

vi.mock("../auth/credential-store.js", () => ({
	createCredentialStore: vi.fn(),
}));
vi.mock("../auth/login.js", () => ({ login: vi.fn() }));
vi.mock("../auth/session.js", () => ({
	getActiveSession: vi.fn(),
	logoutSession: vi.fn(),
}));
vi.mock("../convex-proof.js", () => ({ proveConvexIdentity: vi.fn() }));

const config: AuthReadyRuntimeConfig = {
	authReady: true,
	clientId: "client-id",
	convexUrl: "https://example.convex.cloud",
	environment: "development",
	issuer: "https://issuer.example",
	webUrl: "https://spendly.example",
};
const session: StoredSession = {
	clientId: config.clientId,
	issuer: config.issuer,
	loginAt: 1000,
	schemaVersion: 1,
	subject: "clerk-user",
	tokens: {
		expiresAt: 10_000,
		idToken: "test-id-token",
		refreshToken: "test-refresh-token",
	},
};
const store: CredentialStore = {
	delete: vi.fn(),
	read: vi.fn(),
	write: vi.fn(),
};

const createCommand = (
	options: {
		allowFileStorage?: boolean;
		json?: boolean;
		nonInteractive?: boolean;
	} = {}
): Command =>
	new Command()
		.option("--json")
		.option("--non-interactive")
		.option("--allow-file-storage")
		.setOptionValue("json", options.json ?? false)
		.setOptionValue("nonInteractive", options.nonInteractive ?? false)
		.setOptionValue("allowFileStorage", options.allowFileStorage ?? false);

const createTestRuntime = (runtimeConfig: RuntimeConfig = config) => {
	let stderr = "";
	let stdout = "";
	const runtime: CliRuntime = {
		developmentTools: false,
		environment: {},
		getConfig: () => runtimeConfig,
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
	return {
		getStderr: () => stderr,
		getStdout: () => stdout,
		runtime,
	};
};

const createProof = (
	overrides: Partial<ConvexIdentityProof> = {}
): ConvexIdentityProof => ({
	authenticated: true,
	backendUserId: "backend-user",
	currency: "INR",
	identitySubject: "clerk-user",
	subjectMatchesBackendUser: true,
	...overrides,
});

describe("authentication commands", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(createCredentialStore).mockReturnValue(store);
		vi.mocked(login).mockResolvedValue(session);
		vi.mocked(getActiveSession).mockResolvedValue({
			idToken: session.tokens.idToken,
			session,
			verifiedIdentity: {
				expiresAt: session.tokens.expiresAt,
				subject: session.subject,
			},
		});
		vi.mocked(proveConvexIdentity).mockResolvedValue(createProof());
	});

	it.each([
		{ currency: "INR", displayedCurrency: "INR" },
		{ currency: null, displayedCurrency: "not configured" },
	])(
		"renders status with currency $displayedCurrency",
		async ({ currency, displayedCurrency }) => {
			const testRuntime = createTestRuntime();
			vi.mocked(proveConvexIdentity).mockResolvedValue(
				createProof({ currency })
			);

			await runAuthStatus(createCommand(), testRuntime.runtime);

			expect(testRuntime.getStdout()).toBe(
				`Signed in to Spendly.\nCurrency: ${displayedCurrency}\n`
			);
			expect(testRuntime.getStderr()).toBe("");
			expect(getActiveSession).toHaveBeenCalledWith({
				config,
				forceRefresh: undefined,
				store,
			});
			expect(proveConvexIdentity).toHaveBeenCalledWith({
				convexUrl: config.convexUrl,
				idToken: session.tokens.idToken,
			});
		}
	);

	it("includes credential warnings in JSON status without writing to stderr", async () => {
		const testRuntime = createTestRuntime();
		const warning = "Using file credential storage";
		vi.mocked(createCredentialStore).mockImplementation((options) => {
			options.warn(warning);
			return store;
		});

		await runAuthStatus(
			createCommand({ allowFileStorage: true, json: true }),
			testRuntime.runtime
		);

		expect(JSON.parse(testRuntime.getStdout())).toEqual({
			data: { authenticated: true, ...createProof() },
			meta: { warnings: [warning] },
			schemaVersion: 1,
		});
		expect(testRuntime.getStderr()).toBe("");
		expect(createCredentialStore).toHaveBeenCalledWith({
			allowFileStorage: true,
			clientId: config.clientId,
			issuer: config.issuer,
			warn: expect.any(Function),
		});
	});

	it.each([
		{
			hadSession: false,
			message: "Already signed out. No local Spendly credentials were found.",
			remoteRevocation: "not-needed",
			revocationConfirmed: false,
		},
		{
			hadSession: true,
			message: "Signed out of Spendly. Local credentials were removed.",
			remoteRevocation: "confirmed",
			revocationConfirmed: true,
		},
		{
			hadSession: true,
			message:
				"Local credentials removed; remote revocation was not confirmed.",
			remoteRevocation: "not-confirmed",
			revocationConfirmed: false,
		},
	])(
		"reports $remoteRevocation logout in human and JSON output",
		async ({ hadSession, message, remoteRevocation, revocationConfirmed }) => {
			vi.mocked(logoutSession).mockResolvedValue({
				hadSession,
				revocationConfirmed,
			});
			const humanRuntime = createTestRuntime();
			const jsonRuntime = createTestRuntime();
			const warnings =
				hadSession && !revocationConfirmed
					? ["Remote refresh-token revocation could not be confirmed"]
					: [];

			await runAuthLogout(createCommand(), humanRuntime.runtime);
			await runAuthLogout(createCommand({ json: true }), jsonRuntime.runtime);

			expect(humanRuntime.getStdout()).toBe(`${message}\n`);
			expect(humanRuntime.getStderr()).toBe(
				warnings.length ? `${warnings[0]}\n` : ""
			);
			expect(JSON.parse(jsonRuntime.getStdout())).toEqual({
				data: {
					authenticated: false,
					localCredentialsRemoved: true,
					remoteRevocation,
				},
				meta: warnings.length ? { warnings } : {},
				schemaVersion: 1,
			});
			expect(jsonRuntime.getStderr()).toBe("");
			expect(logoutSession).toHaveBeenCalledWith({ config, store });
			expect(getActiveSession).not.toHaveBeenCalled();
		}
	);

	it("prints the same-machine login URL in no-browser mode and verifies the saved session", async () => {
		const testRuntime = createTestRuntime();
		const url = "https://issuer.example/authorize";
		vi.mocked(login).mockImplementation(async (options) => {
			const browserOpened = await options.openBrowser?.(url);
			options.printAuthorizationUrl(url, browserOpened ?? true);
			return session;
		});

		await runAuthLogin(
			{ browser: false },
			createCommand(),
			testRuntime.runtime
		);

		expect(testRuntime.getStderr()).toBe(
			`Waiting for Spendly sign-in on this computer...\nOpen this URL on this computer. Do not share it:\n${url}\n`
		);
		expect(testRuntime.getStdout()).toBe(
			"Signed in to Spendly.\nCurrency: INR\n"
		);
		expect(login).toHaveBeenCalledWith(
			expect.objectContaining({ config, store })
		);
		expect(getActiveSession).toHaveBeenCalledOnce();
		expect(proveConvexIdentity).toHaveBeenCalledOnce();
	});

	it("returns verified JSON login output without progress messages or authorization URLs", async () => {
		const testRuntime = createTestRuntime();
		vi.mocked(login).mockImplementation(async (options) => {
			options.printAuthorizationUrl("https://issuer.example/authorize", true);
			return await Promise.resolve(session);
		});

		await runAuthLogin(
			{ browser: true },
			createCommand({ json: true }),
			testRuntime.runtime
		);

		expect(JSON.parse(testRuntime.getStdout())).toEqual({
			data: { authenticated: true, ...createProof() },
			meta: {},
			schemaVersion: 1,
		});
		expect(testRuntime.getStderr()).toBe("");
		expect(login).toHaveBeenCalledWith(
			expect.objectContaining({ openBrowser: undefined })
		);
	});

	it.each([
		{
			browser: true,
			code: "NON_INTERACTIVE_INPUT_REQUIRED",
			json: false,
			nonInteractive: true,
		},
		{
			browser: false,
			code: "INVALID_INPUT",
			json: true,
			nonInteractive: false,
		},
	])(
		"rejects incompatible login options with $code before starting OAuth",
		async ({ browser, code, json, nonInteractive }) => {
			const testRuntime = createTestRuntime();

			await expect(
				runAuthLogin(
					{ browser },
					createCommand({ json, nonInteractive }),
					testRuntime.runtime
				)
			).rejects.toMatchObject({ code });

			expect(login).not.toHaveBeenCalled();
			expect(getActiveSession).not.toHaveBeenCalled();
			expect(testRuntime.getStdout()).toBe("");
			expect(testRuntime.getStderr()).toBe("");
		}
	);

	it("rejects JSON login when the browser cannot open without leaking the URL", async () => {
		const testRuntime = createTestRuntime();
		vi.mocked(login).mockImplementation(async (options) => {
			options.printAuthorizationUrl("https://issuer.example/authorize", false);
			return await Promise.resolve(session);
		});

		await expect(
			runAuthLogin(
				{ browser: true },
				createCommand({ json: true }),
				testRuntime.runtime
			)
		).rejects.toMatchObject({
			code: "INVALID_INPUT",
			message:
				"The browser could not be opened; retry without --json to receive the same-machine authorization URL",
		});

		expect(getActiveSession).not.toHaveBeenCalled();
		expect(testRuntime.getStdout()).toBe("");
		expect(testRuntime.getStderr()).toBe("");
	});

	it("rejects unconfigured authentication before creating a credential store", async () => {
		const testRuntime = createTestRuntime({
			...config,
			authReady: false,
			clientId: null,
		});

		await expect(
			runAuthStatus(createCommand(), testRuntime.runtime)
		).rejects.toMatchObject({
			code: "CONFIGURATION_ERROR",
		});

		expect(createCredentialStore).not.toHaveBeenCalled();
		expect(getActiveSession).not.toHaveBeenCalled();
		expect(testRuntime.getStdout()).toBe("");
	});

	it("propagates a missing-session error without proving identity or reporting success", async () => {
		const testRuntime = createTestRuntime();
		const error = new CliError(
			"AUTHENTICATION_REQUIRED",
			"Run `spendly auth login` first"
		);
		vi.mocked(getActiveSession).mockRejectedValue(error);

		await expect(
			runAuthStatus(createCommand({ json: true }), testRuntime.runtime)
		).rejects.toBe(error);

		expect(proveConvexIdentity).not.toHaveBeenCalled();
		expect(testRuntime.getStdout()).toBe("");
		expect(testRuntime.getStderr()).toBe("");
	});
});

describe("authentication identity proof", () => {
	it("returns the verified backend identity", () => {
		expect(
			resolveIdentityProof(
				createProof(),
				"clerk-user",
				"https://spendly.example"
			)
		).toEqual({
			backendUserId: "backend-user",
			currency: "INR",
			identitySubject: "clerk-user",
			subjectMatchesBackendUser: true,
		});
	});

	it("requires account setup when Clerk has no Spendly user", () => {
		expect(() =>
			resolveIdentityProof(
				createProof({ backendUserId: null }),
				"clerk-user",
				"https://spendly.example"
			)
		).toThrowError(
			expect.objectContaining({
				code: "ACCOUNT_SETUP_REQUIRED",
				details: { webUrl: "https://spendly.example" },
			})
		);
	});

	it("rejects a subject mismatch", () => {
		expect(() =>
			resolveIdentityProof(
				createProof({ identitySubject: "another-user" }),
				"clerk-user",
				"https://spendly.example"
			)
		).toThrowError(
			expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" })
		);
	});
});
