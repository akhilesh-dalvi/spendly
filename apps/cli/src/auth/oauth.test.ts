import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import {
	buildAuthorizationUrl,
	discoverOAuth,
	exchangeAuthorizationCode,
	type OAuthDiscovery,
	verifyIdToken,
} from "./oauth.js";

const NOW = 1_800_000_000_000;
const discovery: OAuthDiscovery = {
	authorization_endpoint: "https://issuer.example/authorize",
	issuer: "https://issuer.example",
	jwks_uri: "https://issuer.example/jwks",
	revocation_endpoint: "https://issuer.example/revoke",
	token_endpoint: "https://issuer.example/token",
};

const asFetch = (
	implementation: (
		input: RequestInfo | URL,
		init?: RequestInit
	) => Promise<Response>
): typeof fetch => implementation as typeof fetch;

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
	Response.json(body, init);

describe("OAuth discovery and authorization", () => {
	it("requires exact HTTPS issuer metadata", async () => {
		const fetchImplementation = asFetch((input, init) => {
			expect(input.toString()).toBe(
				"https://issuer.example/.well-known/openid-configuration"
			);
			expect(init?.redirect).toBe("error");
			return Promise.resolve(
				jsonResponse({
					...discovery,
					scopes_supported: ["openid", "offline_access"],
				})
			);
		});

		await expect(
			discoverOAuth("https://issuer.example/", fetchImplementation)
		).resolves.toEqual(discovery);
	});

	it("rejects insecure provider endpoints", async () => {
		const fetchImplementation = asFetch(async () =>
			jsonResponse({
				...discovery,
				token_endpoint: "http://issuer.example/token",
			})
		);

		await expect(
			discoverOAuth("https://issuer.example", fetchImplementation)
		).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
	});

	it("builds a public-client PKCE authorization request", () => {
		const url = buildAuthorizationUrl({
			challenge: "challenge",
			clientId: "client",
			discovery,
			nonce: "nonce",
			redirectUri: "http://127.0.0.1:32100/callback",
			state: "state",
		});

		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: "client",
			code_challenge: "challenge",
			code_challenge_method: "S256",
			nonce: "nonce",
			redirect_uri: "http://127.0.0.1:32100/callback",
			response_type: "code",
			scope: "openid profile email offline_access",
			state: "state",
		});
		expect(url.searchParams.has("client_secret")).toBe(false);
	});
});

describe("OAuth token exchange", () => {
	it("sends the verifier and retains no access token", async () => {
		const fetchImplementation = vi.fn(
			asFetch((_input, init) => {
				const parameters = new URLSearchParams(init?.body?.toString());
				expect(parameters.get("code_verifier")).toBe("verifier");
				expect(parameters.get("redirect_uri")).toBe(
					"http://127.0.0.1:32100/callback"
				);
				expect(parameters.has("client_secret")).toBe(false);
				return Promise.resolve(
					jsonResponse({
						access_token: "access-secret",
						expires_in: 3600,
						id_token: "id-secret",
						refresh_token: "refresh-secret",
						token_type: "Bearer",
					})
				);
			})
		);

		const tokens = await exchangeAuthorizationCode({
			clientId: "client",
			code: "authorization-code",
			discovery,
			fetchImplementation,
			now: NOW,
			redirectUri: "http://127.0.0.1:32100/callback",
			verifier: "verifier",
		});

		expect(tokens).toEqual({
			expiresAt: NOW + 3_600_000,
			idToken: "id-secret",
			refreshToken: "refresh-secret",
		});
		expect(tokens).not.toHaveProperty("accessToken");
		expect(fetchImplementation).toHaveBeenCalledOnce();
	});

	it("classifies provider throttling as retryable", async () => {
		const fetchImplementation = asFetch(async () =>
			jsonResponse({}, { headers: { "retry-after": "2" }, status: 429 })
		);

		await expect(
			exchangeAuthorizationCode({
				clientId: "client",
				code: "authorization-code",
				discovery,
				fetchImplementation,
				redirectUri: "http://127.0.0.1:32100/callback",
				verifier: "verifier",
			})
		).rejects.toMatchObject({
			code: "NETWORK_ERROR",
			details: { retryAfterMs: 2000 },
			retryable: true,
		});
	});

	it("rejects token responses without an explicit Bearer token type", async () => {
		const fetchImplementation = asFetch(() =>
			Promise.resolve(
				jsonResponse({
					access_token: "access-secret",
					expires_in: 3600,
					id_token: "id-secret",
					refresh_token: "refresh-secret",
				})
			)
		);

		await expect(
			exchangeAuthorizationCode({
				clientId: "client",
				code: "authorization-code",
				discovery,
				fetchImplementation,
				redirectUri: "http://127.0.0.1:32100/callback",
				verifier: "verifier",
			})
		).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
	});
});

describe("OIDC ID token validation", () => {
	it("validates RS256 issuer, audience, nonce, expiry, and subject", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(publicKey);
		Object.assign(publicJwk, { alg: "RS256", kid: "key-1", use: "sig" });
		const nowSeconds = Math.floor(NOW / 1000);
		const idToken = await new SignJWT({ nonce: "expected-nonce" })
			.setProtectedHeader({ alg: "RS256", kid: "key-1" })
			.setIssuer(discovery.issuer)
			.setAudience("client")
			.setSubject("user_123")
			.setIssuedAt(nowSeconds)
			.setExpirationTime(nowSeconds + 3600)
			.sign(privateKey);
		const fetchImplementation = asFetch(async () =>
			jsonResponse({ keys: [publicJwk] })
		);

		await expect(
			verifyIdToken({
				clientId: "client",
				discovery,
				fetchImplementation,
				idToken,
				nonce: "expected-nonce",
				now: NOW,
			})
		).resolves.toEqual({
			expiresAt: (nowSeconds + 3600) * 1000,
			subject: "user_123",
		});

		await expect(
			verifyIdToken({
				clientId: "client",
				discovery,
				fetchImplementation,
				idToken,
				nonce: "forged-nonce",
				now: NOW,
			})
		).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
	});
});
