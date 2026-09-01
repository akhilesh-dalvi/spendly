import type { Command } from "commander";
import { createCredentialStore } from "../auth/credential-store.js";
import { runKeychainSmokeTest } from "../auth/keychain-smoke.js";
import { login } from "../auth/login.js";
import { getActiveSession, logoutSession } from "../auth/session.js";
import type { AuthReadyRuntimeConfig } from "../config.js";
import { proveConvexIdentity } from "../convex-proof.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import { writeSuccess } from "../output/index.js";
import type { CliRuntime } from "../runtime.js";

interface AuthCommandContext {
	config: AuthReadyRuntimeConfig;
	globalOptions: ReturnType<typeof resolveGlobalOptions>;
	store: ReturnType<typeof createCredentialStore>;
	warn: (message: string) => void;
	warnings: string[];
}

const getAuthContext = (
	command: Command,
	runtime: CliRuntime
): AuthCommandContext => {
	const config = runtime.getConfig();
	if (!config.authReady) {
		throw new CliError(
			"CONFIGURATION_ERROR",
			"Authentication is not configured in this prerelease build"
		);
	}

	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const warnings: string[] = [];
	const warn = (message: string): void => {
		if (globalOptions.json) {
			warnings.push(message);
			return;
		}
		runtime.stderr.write(`${message}\n`);
	};
	const store = createCredentialStore({
		allowFileStorage: globalOptions.allowFileStorage,
		clientId: config.clientId,
		issuer: config.issuer,
		warn,
	});
	return { config, globalOptions, store, warn, warnings };
};

export const resolveIdentityProof = (
	proof: Awaited<ReturnType<typeof proveConvexIdentity>>,
	expectedSubject: string,
	webUrl: string
): {
	backendUserId: string;
	currency: string | null;
	identitySubject: string;
	subjectMatchesBackendUser: true;
} => {
	if (!proof.backendUserId) {
		throw new CliError(
			"ACCOUNT_SETUP_REQUIRED",
			"Authentication succeeded, but no Spendly user exists. Open Spendly Web once, then retry.",
			{ details: { webUrl } }
		);
	}
	const identitiesMatch =
		proof.authenticated &&
		proof.subjectMatchesBackendUser &&
		proof.identitySubject === expectedSubject;
	if (!identitiesMatch) {
		throw new CliError(
			"AUTHENTICATION_REQUIRED",
			"Clerk and Convex resolved different user identities"
		);
	}
	return {
		backendUserId: proof.backendUserId,
		currency: proof.currency,
		identitySubject: proof.identitySubject,
		subjectMatchesBackendUser: true,
	};
};

const verifyStoredIdentity = async (
	context: AuthCommandContext,
	options: { forceRefresh?: boolean } = {}
): Promise<{
	backendUserId: string;
	currency: string | null;
	identitySubject: string;
	subjectMatchesBackendUser: true;
}> => {
	const activeSession = await getActiveSession({
		config: context.config,
		forceRefresh: options.forceRefresh,
		store: context.store,
	});
	const proof = await proveConvexIdentity({
		convexUrl: context.config.convexUrl,
		idToken: activeSession.idToken,
	});
	return resolveIdentityProof(
		proof,
		activeSession.verifiedIdentity.subject,
		context.config.webUrl
	);
};

const writeAuthSuccess = (
	data: unknown,
	context: AuthCommandContext,
	runtime: CliRuntime
): void => {
	const meta =
		context.warnings.length > 0 ? { warnings: context.warnings } : {};
	writeSuccess(data, { globalOptions: context.globalOptions, runtime }, meta);
};

const getRevocationStatus = (result: {
	hadSession: boolean;
	revocationConfirmed: boolean;
}): "confirmed" | "not-confirmed" | "not-needed" => {
	if (!result.hadSession) {
		return "not-needed";
	}
	return result.revocationConfirmed ? "confirmed" : "not-confirmed";
};

export const runAuthKeychainTest = (
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const context = getAuthContext(command, runtime);
	writeAuthSuccess(runKeychainSmokeTest(), context, runtime);
	return Promise.resolve();
};

export const runAuthLogin = async (
	options: { browser: boolean },
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const context = getAuthContext(command, runtime);
	if (context.globalOptions.nonInteractive) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Browser login is interactive; remove --non-interactive"
		);
	}
	if (context.globalOptions.json && !options.browser) {
		throw new CliError(
			"INVALID_INPUT",
			"--no-browser cannot be combined with --json"
		);
	}

	await login({
		config: context.config,
		openBrowser: options.browser ? undefined : async () => false,
		printAuthorizationUrl: (url, browserOpened) => {
			if (browserOpened) {
				return;
			}
			if (context.globalOptions.json) {
				throw new CliError(
					"INVALID_INPUT",
					"The browser could not be opened; retry without --json to receive the same-machine authorization URL"
				);
			}
			runtime.stderr.write(`Open this URL on this computer:\n${url}\n`);
		},
		store: context.store,
	});
	const proof = await verifyStoredIdentity(context);
	writeAuthSuccess({ authenticated: true, ...proof }, context, runtime);
};

export const runAuthLogout = async (
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const context = getAuthContext(command, runtime);
	const result = await logoutSession({
		config: context.config,
		store: context.store,
	});
	if (result.hadSession && !result.revocationConfirmed) {
		context.warn("Remote refresh-token revocation could not be confirmed");
	}
	writeAuthSuccess(
		{
			authenticated: false,
			localCredentialsRemoved: true,
			remoteRevocation: getRevocationStatus(result),
		},
		context,
		runtime
	);
};

export const runAuthRefreshTest = async (
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const context = getAuthContext(command, runtime);
	const proof = await verifyStoredIdentity(context, { forceRefresh: true });
	writeAuthSuccess(
		{ authenticated: true, refreshConfirmed: true, ...proof },
		context,
		runtime
	);
};

export const runAuthStatus = async (
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const context = getAuthContext(command, runtime);
	const proof = await verifyStoredIdentity(context);
	writeAuthSuccess({ authenticated: true, ...proof }, context, runtime);
};
