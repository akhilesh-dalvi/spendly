import { describe, expect, it } from "vitest";
import type { AuthReadyRuntimeConfig } from "../config.js";
import { CliError } from "../errors.js";
import type { CredentialStore } from "./credential-store.js";
import type { OAuthDiscovery } from "./oauth.js";
import {
	getActiveSession,
	isAuthorizationExpired,
	logoutSession,
	type SessionDependencies,
} from "./session.js";
import type { StoredSession } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const config: AuthReadyRuntimeConfig = {
	authReady: true,
	clientId: "client",
	convexUrl: "https://example.convex.cloud",
	environment: "development",
	issuer: "https://issuer.example",
	webUrl: "https://spendly.example",
};

const discovery: OAuthDiscovery = {
	authorization_endpoint: "https://issuer.example/authorize",
	issuer: config.issuer,
	jwks_uri: "https://issuer.example/jwks",
	revocation_endpoint: "https://issuer.example/revoke",
	token_endpoint: "https://issuer.example/token",
};

const createSession = (
	overrides: Partial<StoredSession> = {}
): StoredSession => ({
	clientId: config.clientId,
	issuer: config.issuer,
	loginAt: NOW - DAY_MS,
	schemaVersion: 1,
	subject: "user_123",
	tokens: {
		expiresAt: NOW + 10 * DAY_MS,
		idToken: "original-id-token",
		refreshToken: "original-refresh-token",
	},
	...overrides,
});

const createMemoryStore = (
	initialSession: StoredSession | null
): {
	deleted: () => number;
	store: CredentialStore;
	writes: StoredSession[];
} => {
	let currentSession = initialSession;
	let deleteCount = 0;
	const writes: StoredSession[] = [];
	return {
		deleted: () => deleteCount,
		store: {
			delete: () => {
				deleteCount += 1;
				currentSession = null;
				return Promise.resolve();
			},
			read: () => Promise.resolve(currentSession),
			write: (session) => {
				currentSession = session;
				writes.push(session);
				return Promise.resolve();
			},
		},
		writes,
	};
};

const createDependencies = (
	overrides: Partial<SessionDependencies> = {}
): SessionDependencies => ({
	discoverOAuth: () => Promise.resolve(discovery),
	refreshOAuthTokens: () =>
		Promise.resolve({
			expiresAt: NOW + DAY_MS,
			idToken: "refreshed-id-token",
			refreshToken: "refreshed-refresh-token",
		}),
	revokeRefreshToken: () => Promise.resolve(true),
	verifyIdToken: () =>
		Promise.resolve({ expiresAt: NOW + DAY_MS, subject: "user_123" }),
	...overrides,
});

describe("authorization lifetime", () => {
	it("allows refresh within the 30-day window", () => {
		expect(isAuthorizationExpired(0, 30 * DAY_MS - 1)).toBe(false);
	});

	it("requires browser reauthentication at 30 days", () => {
		expect(isAuthorizationExpired(0, 30 * DAY_MS)).toBe(true);
	});
});

describe("active authentication session", () => {
	it("refreshes inside the expiry skew and persists only the new token set", async () => {
		const memory = createMemoryStore(
			createSession({
				tokens: {
					expiresAt: NOW + 30_000,
					idToken: "expiring-id-token",
					refreshToken: "original-refresh-token",
				},
			})
		);

		const activeSession = await getActiveSession({
			config,
			dependencies: createDependencies(),
			now: NOW,
			store: memory.store,
		});

		expect(activeSession.idToken).toBe("refreshed-id-token");
		expect(memory.writes).toHaveLength(1);
		expect(memory.writes[0]?.tokens).toEqual({
			expiresAt: NOW + DAY_MS,
			idToken: "refreshed-id-token",
			refreshToken: "refreshed-refresh-token",
		});
		expect(memory.writes[0]).not.toHaveProperty("accessToken");
	});

	it("revokes and removes credentials at the 30-day boundary", async () => {
		const memory = createMemoryStore(
			createSession({ loginAt: NOW - 30 * DAY_MS })
		);
		let revocations = 0;
		const dependencies = createDependencies({
			revokeRefreshToken: () => {
				revocations += 1;
				return Promise.resolve(true);
			},
		});

		await expect(
			getActiveSession({ config, dependencies, now: NOW, store: memory.store })
		).rejects.toMatchObject({ code: "AUTHORIZATION_EXPIRED" });
		expect(revocations).toBe(1);
		expect(memory.deleted()).toBe(1);
	});

	it("rejects a credential login time in the future", async () => {
		const memory = createMemoryStore(createSession({ loginAt: NOW + 60_000 }));

		await expect(
			getActiveSession({
				config,
				dependencies: createDependencies(),
				now: NOW,
				store: memory.store,
			})
		).rejects.toMatchObject({ code: "CREDENTIALS_INVALID" });
		expect(memory.deleted()).toBe(1);
	});

	it("removes credentials after the provider rejects a refresh token", async () => {
		const memory = createMemoryStore(createSession());
		const dependencies = createDependencies({
			refreshOAuthTokens: () =>
				Promise.reject(
					new CliError("AUTHENTICATION_REQUIRED", "refresh rejected")
				),
		});

		await expect(
			getActiveSession({
				config,
				dependencies,
				forceRefresh: true,
				now: NOW,
				store: memory.store,
			})
		).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
		expect(memory.deleted()).toBe(1);
	});

	it("preserves credentials across a temporary refresh failure", async () => {
		const memory = createMemoryStore(createSession());
		const dependencies = createDependencies({
			refreshOAuthTokens: () =>
				Promise.reject(
					new CliError("NETWORK_ERROR", "temporarily unavailable")
				),
		});

		await expect(
			getActiveSession({
				config,
				dependencies,
				forceRefresh: true,
				now: NOW,
				store: memory.store,
			})
		).rejects.toMatchObject({ code: "NETWORK_ERROR" });
		expect(memory.deleted()).toBe(0);
	});

	it("removes local credentials even when revocation cannot start", async () => {
		const memory = createMemoryStore(createSession());
		const result = await logoutSession({
			config,
			dependencies: createDependencies({
				discoverOAuth: () => Promise.reject(new Error("offline")),
			}),
			store: memory.store,
		});

		expect(result).toEqual({ hadSession: true, revocationConfirmed: false });
		expect(memory.deleted()).toBe(1);
	});
});
