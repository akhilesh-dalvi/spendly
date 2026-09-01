import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import type { AuthReadyRuntimeConfig } from "../config.js";
import type { CredentialStore } from "./credential-store.js";
import { login } from "./login.js";
import type { OAuthDiscovery } from "./oauth.js";
import type { StoredSession } from "./types.js";

const NOW = 1_800_000_000_000;
const CALLBACK_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/callback$/u;
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

const jsonResponse = (body: unknown): Response => Response.json(body);

describe("OAuth login flow", () => {
	it("completes loopback PKCE login and stores only the refresh-capable session", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(publicKey);
		Object.assign(publicJwk, { alg: "RS256", kid: "key-1", use: "sig" });
		let authorizationUrl: URL | undefined;
		let callbackRequest: Promise<Response> | undefined;
		let storedSession: StoredSession | null = null;
		const store: CredentialStore = {
			delete: () => Promise.resolve(),
			read: () => Promise.resolve(storedSession),
			write: (session) => {
				storedSession = session;
				return Promise.resolve();
			},
		};
		const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
			const url = input.toString();
			if (url.endsWith("/.well-known/openid-configuration")) {
				return jsonResponse(discovery);
			}
			if (url === discovery.jwks_uri) {
				return jsonResponse({ keys: [publicJwk] });
			}
			if (url === discovery.token_endpoint) {
				const parameters = new URLSearchParams(init?.body?.toString());
				const verifier = parameters.get("code_verifier");
				expect(verifier).toBeTruthy();
				expect(parameters.get("code")).toBe("authorization-code");
				expect(parameters.get("redirect_uri")).toBe(
					authorizationUrl?.searchParams.get("redirect_uri")
				);
				expect(
					createHash("sha256")
						.update(verifier ?? "")
						.digest("base64url")
				).toBe(authorizationUrl?.searchParams.get("code_challenge"));
				expect(parameters.has("client_secret")).toBe(false);
				const nowSeconds = Math.floor(NOW / 1000);
				const idToken = await new SignJWT({
					nonce: authorizationUrl?.searchParams.get("nonce"),
				})
					.setProtectedHeader({ alg: "RS256", kid: "key-1" })
					.setIssuer(discovery.issuer)
					.setAudience(config.clientId)
					.setSubject("user_123")
					.setIssuedAt(nowSeconds)
					.setExpirationTime(nowSeconds + 3600)
					.sign(privateKey);
				return jsonResponse({
					access_token: "access-secret",
					expires_in: 3600,
					id_token: idToken,
					refresh_token: "refresh-secret",
					token_type: "Bearer",
				});
			}
			throw new Error(`Unexpected OAuth request: ${url}`);
		});
		const printAuthorizationUrl = vi.fn();

		const session = await login({
			config,
			fetchImplementation,
			now: NOW,
			openBrowser: (url) => {
				authorizationUrl = new URL(url);
				const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
				const state = authorizationUrl.searchParams.get("state");
				expect(redirectUri).toMatch(CALLBACK_URL_PATTERN);
				callbackRequest = fetch(
					`${redirectUri}?code=authorization-code&state=${encodeURIComponent(state ?? "")}`
				);
				return Promise.resolve(true);
			},
			printAuthorizationUrl,
			store,
		});
		await callbackRequest;

		expect(printAuthorizationUrl).toHaveBeenCalledWith(
			expect.stringContaining("code_challenge_method=S256"),
			true
		);
		expect(session).toEqual(storedSession);
		expect(session).toMatchObject({
			clientId: config.clientId,
			issuer: config.issuer,
			loginAt: NOW,
			schemaVersion: 1,
			subject: "user_123",
			tokens: { refreshToken: "refresh-secret" },
		});
		expect(session).not.toHaveProperty("accessToken");
		expect(session.tokens).not.toHaveProperty("accessToken");
	});
});
