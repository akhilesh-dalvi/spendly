import {
	createRemoteJWKSet,
	customFetch,
	errors as joseErrors,
	jwtVerify,
} from "jose";
import { z } from "zod";
import { httpsUrlSchema } from "../config.js";
import { CliError } from "../errors.js";
import type { OAuthTokenSet, VerifiedIdentity } from "./types.js";

const TRAILING_SLASH_PATTERN = /\/$/u;
const OAUTH_REQUEST_TIMEOUT_MS = 10_000;
const CLOCK_TOLERANCE_SECONDS = 5;
const MAX_TOKEN_LENGTH = 20_000;

const discoverySchema = z.object({
	authorization_endpoint: httpsUrlSchema,
	issuer: httpsUrlSchema,
	jwks_uri: httpsUrlSchema,
	revocation_endpoint: httpsUrlSchema.optional(),
	token_endpoint: httpsUrlSchema,
});

const tokenResponseSchema = z
	.object({
		access_token: z.string().min(1).max(MAX_TOKEN_LENGTH),
		expires_in: z.number().positive().finite(),
		id_token: z.string().min(1).max(MAX_TOKEN_LENGTH),
		refresh_token: z.string().min(1).max(MAX_TOKEN_LENGTH).optional(),
		token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
	})
	.passthrough();

export type OAuthDiscovery = z.infer<typeof discoverySchema>;

const normalizeIssuer = (issuer: string): string =>
	issuer.replace(TRAILING_SLASH_PATTERN, "");

const requestWithTimeout = async (
	resource: string | URL,
	init: RequestInit,
	fetchImplementation: typeof fetch
): Promise<Response> => {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		OAUTH_REQUEST_TIMEOUT_MS
	);
	timeout.unref();
	try {
		return await fetchImplementation(resource, {
			...init,
			redirect: "error",
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
};

const readJson = async (
	response: Response,
	errorCode: "AUTHENTICATION_REQUIRED" | "CONFIGURATION_ERROR"
): Promise<unknown> => {
	try {
		return await response.json();
	} catch {
		throw new CliError(
			errorCode,
			"The authentication provider returned an invalid JSON response"
		);
	}
};

const isTemporaryStatus = (status: number): boolean =>
	status === 408 || status === 425 || status === 429 || status >= 500;

const retryAfterDetails = (response: Response): Record<string, number> => {
	const retryAfter = response.headers.get("retry-after");
	if (!retryAfter) {
		return {};
	}
	const seconds = Number(retryAfter);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return { retryAfterMs: Math.ceil(seconds * 1000) };
	}
	return {};
};

export const discoverOAuth = async (
	issuer: string,
	fetchImplementation: typeof fetch = fetch
): Promise<OAuthDiscovery> => {
	const normalizedIssuer = normalizeIssuer(issuer);
	const discoveryUrl = new URL(
		`${normalizedIssuer}/.well-known/openid-configuration`
	);
	let response: Response;
	try {
		response = await requestWithTimeout(
			discoveryUrl,
			{ headers: { accept: "application/json" } },
			fetchImplementation
		);
	} catch (error) {
		throw new CliError(
			"NETWORK_ERROR",
			"Unable to reach the authentication provider",
			{ cause: error, retryable: true }
		);
	}

	if (!response.ok) {
		if (isTemporaryStatus(response.status)) {
			throw new CliError(
				"NETWORK_ERROR",
				"Authentication provider discovery is temporarily unavailable",
				{
					details: retryAfterDetails(response),
					retryable: true,
				}
			);
		}
		throw new CliError(
			"CONFIGURATION_ERROR",
			"Authentication provider discovery failed"
		);
	}

	const result = discoverySchema.safeParse(
		await readJson(response, "CONFIGURATION_ERROR")
	);
	if (
		!result.success ||
		normalizeIssuer(result.data.issuer) !== normalizedIssuer
	) {
		throw new CliError(
			"CONFIGURATION_ERROR",
			"Authentication provider metadata did not match the configured issuer"
		);
	}

	return {
		...result.data,
		issuer: normalizedIssuer,
	};
};

export const buildAuthorizationUrl = (options: {
	challenge: string;
	clientId: string;
	discovery: OAuthDiscovery;
	nonce: string;
	redirectUri: string;
	state: string;
}): URL => {
	const url = new URL(options.discovery.authorization_endpoint);
	url.search = new URLSearchParams({
		client_id: options.clientId,
		code_challenge: options.challenge,
		code_challenge_method: "S256",
		nonce: options.nonce,
		redirect_uri: options.redirectUri,
		response_type: "code",
		scope: "openid profile email offline_access",
		state: options.state,
	}).toString();
	return url;
};

const requestTokens = async (
	endpoint: string,
	parameters: URLSearchParams,
	fetchImplementation: typeof fetch
): Promise<z.infer<typeof tokenResponseSchema>> => {
	let response: Response;
	try {
		response = await requestWithTimeout(
			endpoint,
			{
				body: parameters,
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
				method: "POST",
			},
			fetchImplementation
		);
	} catch (error) {
		throw new CliError("NETWORK_ERROR", "Token request failed", {
			cause: error,
			retryable: true,
		});
	}

	if (!response.ok) {
		if (isTemporaryStatus(response.status)) {
			throw new CliError(
				"NETWORK_ERROR",
				"The authentication provider is temporarily unavailable",
				{
					details: retryAfterDetails(response),
					retryable: true,
				}
			);
		}
		throw new CliError(
			"AUTHENTICATION_REQUIRED",
			"The authentication provider rejected the token request"
		);
	}

	const result = tokenResponseSchema.safeParse(
		await readJson(response, "AUTHENTICATION_REQUIRED")
	);
	if (!result.success) {
		throw new CliError(
			"AUTHENTICATION_REQUIRED",
			"The authentication provider returned an invalid token response"
		);
	}
	return result.data;
};

export const exchangeAuthorizationCode = async (options: {
	clientId: string;
	code: string;
	discovery: OAuthDiscovery;
	redirectUri: string;
	verifier: string;
	fetchImplementation?: typeof fetch;
	now?: number;
}): Promise<OAuthTokenSet> => {
	const response = await requestTokens(
		options.discovery.token_endpoint,
		new URLSearchParams({
			client_id: options.clientId,
			code: options.code,
			code_verifier: options.verifier,
			grant_type: "authorization_code",
			redirect_uri: options.redirectUri,
		}),
		options.fetchImplementation ?? fetch
	);

	if (!response.refresh_token) {
		throw new CliError(
			"AUTHENTICATION_REQUIRED",
			"The authentication provider did not issue a refresh token"
		);
	}

	return {
		expiresAt: (options.now ?? Date.now()) + response.expires_in * 1000,
		idToken: response.id_token,
		refreshToken: response.refresh_token,
	};
};

export const refreshOAuthTokens = async (options: {
	clientId: string;
	discovery: OAuthDiscovery;
	fetchImplementation?: typeof fetch;
	now?: number;
	refreshToken: string;
}): Promise<OAuthTokenSet> => {
	const response = await requestTokens(
		options.discovery.token_endpoint,
		new URLSearchParams({
			client_id: options.clientId,
			grant_type: "refresh_token",
			refresh_token: options.refreshToken,
		}),
		options.fetchImplementation ?? fetch
	);

	return {
		expiresAt: (options.now ?? Date.now()) + response.expires_in * 1000,
		idToken: response.id_token,
		refreshToken: response.refresh_token ?? options.refreshToken,
	};
};

const defaultRemoteKeySets = new Map<
	string,
	ReturnType<typeof createRemoteJWKSet>
>();

const getRemoteKeySet = (
	jwksUri: string,
	fetchImplementation: typeof fetch
): ReturnType<typeof createRemoteJWKSet> => {
	if (fetchImplementation !== fetch) {
		return createRemoteJWKSet(new URL(jwksUri), {
			[customFetch]: (url, init) => fetchImplementation(url, init),
		});
	}
	const cached = defaultRemoteKeySets.get(jwksUri);
	if (cached) {
		return cached;
	}
	const keySet = createRemoteJWKSet(new URL(jwksUri));
	defaultRemoteKeySets.set(jwksUri, keySet);
	return keySet;
};

const isNetworkVerificationError = (error: unknown): boolean =>
	error instanceof TypeError || error instanceof joseErrors.JWKSTimeout;

export const verifyIdToken = async (options: {
	clientId: string;
	discovery: OAuthDiscovery;
	fetchImplementation?: typeof fetch;
	idToken: string;
	nonce?: string;
	now?: number;
}): Promise<VerifiedIdentity> => {
	try {
		const fetchImplementation = options.fetchImplementation ?? fetch;
		const keySet = getRemoteKeySet(
			options.discovery.jwks_uri,
			fetchImplementation
		);
		const { payload } = await jwtVerify(options.idToken, keySet, {
			algorithms: ["RS256"],
			audience: options.clientId,
			clockTolerance: CLOCK_TOLERANCE_SECONDS,
			currentDate: new Date(options.now ?? Date.now()),
			issuer: options.discovery.issuer,
			requiredClaims: ["sub", "exp", "iat"],
		});
		if (!(payload.sub && payload.exp && payload.iat)) {
			throw new Error("ID token is missing required identity claims");
		}
		if (options.nonce !== undefined && payload.nonce !== options.nonce) {
			throw new Error("ID token nonce did not match");
		}
		const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
		if (payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
			throw new Error("ID token issue time is in the future");
		}
		return { expiresAt: payload.exp * 1000, subject: payload.sub };
	} catch (error) {
		if (isNetworkVerificationError(error)) {
			throw new CliError(
				"NETWORK_ERROR",
				"Unable to retrieve authentication verification keys",
				{ cause: error, retryable: true }
			);
		}
		throw new CliError(
			"AUTHENTICATION_REQUIRED",
			"ID token validation failed",
			{ cause: error }
		);
	}
};

export const revokeRefreshToken = async (options: {
	clientId: string;
	discovery: OAuthDiscovery;
	fetchImplementation?: typeof fetch;
	refreshToken: string;
}): Promise<boolean> => {
	if (!options.discovery.revocation_endpoint) {
		return false;
	}
	try {
		const response = await requestWithTimeout(
			options.discovery.revocation_endpoint,
			{
				body: new URLSearchParams({
					client_id: options.clientId,
					token: options.refreshToken,
					token_type_hint: "refresh_token",
				}),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
				method: "POST",
			},
			options.fetchImplementation ?? fetch
		);
		return response.ok;
	} catch {
		return false;
	}
};
