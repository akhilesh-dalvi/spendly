import type { AuthReadyRuntimeConfig } from "../config.js";
import { CliError } from "../errors.js";
import type { CredentialStore } from "./credential-store.js";
import {
	discoverOAuth,
	refreshOAuthTokens,
	revokeRefreshToken,
	verifyIdToken,
} from "./oauth.js";
import type {
	OAuthTokenSet,
	StoredSession,
	VerifiedIdentity,
} from "./types.js";

const AUTHORIZATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;
const CLOCK_TOLERANCE_MS = 5 * 1000;

export interface ActiveSession {
	idToken: string;
	session: StoredSession;
	verifiedIdentity: VerifiedIdentity;
}

export interface SessionDependencies {
	discoverOAuth: typeof discoverOAuth;
	refreshOAuthTokens: typeof refreshOAuthTokens;
	revokeRefreshToken: typeof revokeRefreshToken;
	verifyIdToken: typeof verifyIdToken;
}

const defaultDependencies: SessionDependencies = {
	discoverOAuth,
	refreshOAuthTokens,
	revokeRefreshToken,
	verifyIdToken,
};

export const isAuthorizationExpired = (
	loginAt: number,
	now = Date.now()
): boolean => now - loginAt >= AUTHORIZATION_LIFETIME_MS;

const isAuthenticationFailure = (error: unknown): boolean =>
	error instanceof CliError &&
	(error.code === "AUTHENTICATION_REQUIRED" ||
		error.code === "AUTHORIZATION_EXPIRED" ||
		error.code === "CREDENTIALS_INVALID");

const deleteAndRethrow = async (
	store: CredentialStore,
	error: unknown
): Promise<never> => {
	await store.delete();
	throw error;
};

const refreshTokens = async (options: {
	config: AuthReadyRuntimeConfig;
	dependencies: SessionDependencies;
	discovery: Awaited<ReturnType<typeof discoverOAuth>>;
	fetchImplementation?: typeof fetch;
	now: number;
	refreshToken: string;
	store: CredentialStore;
}): Promise<OAuthTokenSet> => {
	try {
		return await options.dependencies.refreshOAuthTokens({
			clientId: options.config.clientId,
			discovery: options.discovery,
			fetchImplementation: options.fetchImplementation,
			now: options.now,
			refreshToken: options.refreshToken,
		});
	} catch (error) {
		if (isAuthenticationFailure(error)) {
			return await deleteAndRethrow(options.store, error);
		}
		throw error;
	}
};

const verifyTokens = async (options: {
	config: AuthReadyRuntimeConfig;
	dependencies: SessionDependencies;
	discovery: Awaited<ReturnType<typeof discoverOAuth>>;
	fetchImplementation?: typeof fetch;
	now: number;
	tokens: OAuthTokenSet;
}): Promise<VerifiedIdentity> =>
	await options.dependencies.verifyIdToken({
		clientId: options.config.clientId,
		discovery: options.discovery,
		fetchImplementation: options.fetchImplementation,
		idToken: options.tokens.idToken,
		now: options.now,
	});

const readStoredSession = async (
	store: CredentialStore
): Promise<StoredSession> => {
	let session: StoredSession | null;
	try {
		session = await store.read();
	} catch (error) {
		if (isAuthenticationFailure(error)) {
			return await deleteAndRethrow(store, error);
		}
		throw error;
	}
	if (!session) {
		throw new CliError(
			"AUTHENTICATION_REQUIRED",
			"Run `spendly auth login` first"
		);
	}
	return session;
};

const getVerifiedTokens = async (options: {
	config: AuthReadyRuntimeConfig;
	dependencies: SessionDependencies;
	discovery: Awaited<ReturnType<typeof discoverOAuth>>;
	fetchImplementation?: typeof fetch;
	forceRefresh: boolean;
	now: number;
	session: StoredSession;
	store: CredentialStore;
}): Promise<{
	refreshed: boolean;
	tokens: OAuthTokenSet;
	verifiedIdentity: VerifiedIdentity;
}> => {
	let tokens = options.session.tokens;
	let refreshed =
		options.forceRefresh || tokens.expiresAt - options.now <= REFRESH_SKEW_MS;
	if (refreshed) {
		tokens = await refreshTokens({
			...options,
			refreshToken: tokens.refreshToken,
		});
	}

	try {
		const verifiedIdentity = await verifyTokens({ ...options, tokens });
		return { refreshed, tokens, verifiedIdentity };
	} catch (error) {
		if (refreshed || !isAuthenticationFailure(error)) {
			if (isAuthenticationFailure(error)) {
				return await deleteAndRethrow(options.store, error);
			}
			throw error;
		}
	}

	tokens = await refreshTokens({
		...options,
		refreshToken: tokens.refreshToken,
	});
	refreshed = true;
	try {
		const verifiedIdentity = await verifyTokens({ ...options, tokens });
		return { refreshed, tokens, verifiedIdentity };
	} catch (error) {
		if (isAuthenticationFailure(error)) {
			return await deleteAndRethrow(options.store, error);
		}
		throw error;
	}
};

export const getActiveSession = async (options: {
	config: AuthReadyRuntimeConfig;
	dependencies?: SessionDependencies;
	fetchImplementation?: typeof fetch;
	forceRefresh?: boolean;
	now?: number;
	store: CredentialStore;
}): Promise<ActiveSession> => {
	const dependencies = options.dependencies ?? defaultDependencies;
	const session = await readStoredSession(options.store);
	if (
		session.issuer !== options.config.issuer ||
		session.clientId !== options.config.clientId
	) {
		return await deleteAndRethrow(
			options.store,
			new CliError(
				"AUTHENTICATION_REQUIRED",
				"Stored credentials belong to a different authentication configuration"
			)
		);
	}

	const now = options.now ?? Date.now();
	if (session.loginAt > now + CLOCK_TOLERANCE_MS) {
		return await deleteAndRethrow(
			options.store,
			new CliError(
				"CREDENTIALS_INVALID",
				"Stored credential login time is invalid"
			)
		);
	}
	if (isAuthorizationExpired(session.loginAt, now)) {
		await logoutSession({
			config: options.config,
			dependencies,
			fetchImplementation: options.fetchImplementation,
			store: options.store,
		});
		throw new CliError(
			"AUTHORIZATION_EXPIRED",
			"CLI authorization is older than 30 days; sign in again"
		);
	}

	const discovery = await dependencies.discoverOAuth(
		options.config.issuer,
		options.fetchImplementation
	);
	const { refreshed, tokens, verifiedIdentity } = await getVerifiedTokens({
		config: options.config,
		dependencies,
		discovery,
		fetchImplementation: options.fetchImplementation,
		forceRefresh: options.forceRefresh === true,
		now,
		session,
		store: options.store,
	});

	if (verifiedIdentity.subject !== session.subject) {
		return await deleteAndRethrow(
			options.store,
			new CliError(
				"AUTHENTICATION_REQUIRED",
				"Refreshed identity did not match the original login"
			)
		);
	}

	const normalizedTokens = {
		...tokens,
		expiresAt: verifiedIdentity.expiresAt,
	};
	const updatedSession = { ...session, tokens: normalizedTokens };
	if (refreshed || normalizedTokens.expiresAt !== session.tokens.expiresAt) {
		await options.store.write(updatedSession);
	}

	return {
		idToken: normalizedTokens.idToken,
		session: updatedSession,
		verifiedIdentity,
	};
};

export const logoutSession = async (options: {
	config: AuthReadyRuntimeConfig;
	dependencies?: SessionDependencies;
	fetchImplementation?: typeof fetch;
	store: CredentialStore;
}): Promise<{ hadSession: boolean; revocationConfirmed: boolean }> => {
	const dependencies = options.dependencies ?? defaultDependencies;
	let session: StoredSession | null = null;
	let hadSession = false;
	let revocationConfirmed = false;
	try {
		try {
			session = await options.store.read();
			hadSession = session !== null;
		} catch {
			hadSession = true;
		}
		if (
			session &&
			session.issuer === options.config.issuer &&
			session.clientId === options.config.clientId
		) {
			try {
				const discovery = await dependencies.discoverOAuth(
					options.config.issuer,
					options.fetchImplementation
				);
				revocationConfirmed = await dependencies.revokeRefreshToken({
					clientId: options.config.clientId,
					discovery,
					fetchImplementation: options.fetchImplementation,
					refreshToken: session.tokens.refreshToken,
				});
			} catch {
				revocationConfirmed = false;
			}
		}
	} finally {
		await options.store.delete();
	}

	return { hadSession, revocationConfirmed };
};
