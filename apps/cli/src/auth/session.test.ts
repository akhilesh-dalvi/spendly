import { describe, expect, it, vi } from "vitest";
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
	it("requires login when no credentials exist", async () => {
		const memory = createMemoryStore(null);
		await expect(
			getActiveSession({
				config,
				dependencies: createDependencies(),
				now: NOW,
				store: memory.store,
			})
		).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
		expect(memory.deleted()).toBe(0);
	});

	it.each(["issuer", "clientId"] as const)(
		"deletes credentials for a mismatched %s",
		async (field) => {
			const memory = createMemoryStore(createSession({ [field]: "other" }));
			await expect(
				getActiveSession({
					config,
					dependencies: createDependencies(),
					now: NOW,
					store: memory.store,
				})
			).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
			expect(memory.deleted()).toBe(1);
		}
	);

	it.each([
		"CREDENTIALS_INVALID",
		"AUTHORIZATION_EXPIRED",
		"NETWORK_ERROR",
	] as const)("handles stored-session read error %s", async (code) => {
		const memory = createMemoryStore(null);
		const error = new CliError(code, "read failed");
		memory.store.read = () => Promise.reject(error);
		await expect(
			getActiveSession({
				config,
				dependencies: createDependencies(),
				now: NOW,
				store: memory.store,
			})
		).rejects.toBe(error);
		expect(memory.deleted()).toBe(code === "NETWORK_ERROR" ? 0 : 1);
	});

	it("does not rewrite unchanged verified tokens", async () => {
		const session = createSession();
		const memory = createMemoryStore(session);
		const refresh = vi.fn(createDependencies().refreshOAuthTokens);
		const active = await getActiveSession({
			config,
			dependencies: createDependencies({
				refreshOAuthTokens: refresh,
				verifyIdToken: async () => ({
					expiresAt: session.tokens.expiresAt,
					subject: session.subject,
				}),
			}),
			now: NOW,
			store: memory.store,
		});
		expect(active.idToken).toBe("original-id-token");
		expect(memory.writes).toHaveLength(0);
		expect(refresh).not.toHaveBeenCalled();
	});

	it("refreshes once after an unexpired token fails authentication", async () => {
		const memory = createMemoryStore(createSession());
		const verify = vi
			.fn(createDependencies().verifyIdToken)
			.mockRejectedValueOnce(
				new CliError("AUTHENTICATION_REQUIRED", "invalid token")
			);
		const refresh = vi.fn(createDependencies().refreshOAuthTokens);
		const active = await getActiveSession({
			config,
			dependencies: createDependencies({
				refreshOAuthTokens: refresh,
				verifyIdToken: verify,
			}),
			now: NOW,
			store: memory.store,
		});
		expect(active.idToken).toBe("refreshed-id-token");
		expect(refresh).toHaveBeenCalledOnce();
		expect(verify).toHaveBeenCalledTimes(2);
		expect(memory.deleted()).toBe(0);
	});

	it.each([
		{
			calls: 1,
			code: "AUTHENTICATION_REQUIRED",
			deleted: 1,
			forceRefresh: true,
		},
		{
			calls: 2,
			code: "AUTHENTICATION_REQUIRED",
			deleted: 1,
			forceRefresh: false,
		},
		{ calls: 1, code: "NETWORK_ERROR", deleted: 0, forceRefresh: false },
		{ calls: 1, code: "NETWORK_ERROR", deleted: 0, forceRefresh: true },
	] as const)(
		"handles verification $code with forced refresh $forceRefresh",
		async ({ forceRefresh, code, deleted, calls }) => {
			const memory = createMemoryStore(createSession());
			const error = new CliError(code, "verification failed");
			const verify = vi.fn(() => Promise.reject(error));
			await expect(
				getActiveSession({
					config,
					dependencies: createDependencies({ verifyIdToken: verify }),
					forceRefresh,
					now: NOW,
					store: memory.store,
				})
			).rejects.toBe(error);
			expect(verify).toHaveBeenCalledTimes(calls);
			expect(memory.deleted()).toBe(deleted);
			expect(memory.writes).toHaveLength(0);
		}
	);

	it("preserves credentials when verification after a recovery refresh is offline", async () => {
		const memory = createMemoryStore(createSession());
		const verify = vi
			.fn(createDependencies().verifyIdToken)
			.mockRejectedValueOnce(new CliError("AUTHENTICATION_REQUIRED", "invalid"))
			.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "offline"));
		await expect(
			getActiveSession({
				config,
				dependencies: createDependencies({ verifyIdToken: verify }),
				now: NOW,
				store: memory.store,
			})
		).rejects.toMatchObject({ code: "NETWORK_ERROR" });
		expect(memory.deleted()).toBe(0);
	});

	it("deletes credentials if refreshed identity changes subject", async () => {
		const memory = createMemoryStore(createSession());
		await expect(
			getActiveSession({
				config,
				dependencies: createDependencies({
					verifyIdToken: async () => ({
						expiresAt: NOW + DAY_MS,
						subject: "different-user",
					}),
				}),
				forceRefresh: true,
				now: NOW,
				store: memory.store,
			})
		).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
		expect(memory.deleted()).toBe(1);
	});

	it.each([
		null,
		createSession({ issuer: "https://other.example" }),
		createSession({ clientId: "other" }),
	])(
		"clears local credentials without revoking a foreign or missing session %#",
		async (session) => {
			const memory = createMemoryStore(session);
			const revoke = vi.fn(createDependencies().revokeRefreshToken);
			await expect(
				logoutSession({
					config,
					dependencies: createDependencies({ revokeRefreshToken: revoke }),
					store: memory.store,
				})
			).resolves.toEqual({
				hadSession: session !== null,
				revocationConfirmed: false,
			});
			expect(revoke).not.toHaveBeenCalled();
			expect(memory.deleted()).toBe(1);
		}
	);

	it("still clears unreadable credentials on logout", async () => {
		const memory = createMemoryStore(null);
		memory.store.read = () => Promise.reject(new Error("unreadable"));
		await expect(
			logoutSession({
				config,
				dependencies: createDependencies(),
				store: memory.store,
			})
		).resolves.toEqual({ hadSession: true, revocationConfirmed: false });
		expect(memory.deleted()).toBe(1);
	});
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
