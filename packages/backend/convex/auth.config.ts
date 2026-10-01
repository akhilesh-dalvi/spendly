import type { AuthConfig } from "convex/server";

const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

const readCliOAuthClientId = (): string | undefined => {
	try {
		return process.env.CLERK_CLI_OAUTH_CLIENT_ID;
	} catch (error) {
		// Convex auth config throws on missing env reads instead of returning undefined.
		// Web-only deployments must not require the optional CLI OAuth provider.
		if (
			error instanceof Error &&
			error.message.includes(
				"Environment variable CLERK_CLI_OAUTH_CLIENT_ID is used in auth config file but its value was not set"
			)
		) {
			return undefined;
		}
		throw error;
	}
};

if (!clerkDomain) {
	throw new Error("CLERK_JWT_ISSUER_DOMAIN is required");
}

const cliOAuthClientId = readCliOAuthClientId();

const webProvider = {
	// See https://docs.convex.dev/auth/clerk#configuring-dev-and-prod-instances
	domain: clerkDomain,
	applicationID: "convex",
};

export default {
	providers: [
		webProvider,
		...(cliOAuthClientId
			? [
					{
						algorithm: "RS256" as const,
						applicationID: cliOAuthClientId,
						issuer: clerkDomain,
						jwks: `${clerkDomain}/.well-known/jwks.json`,
						type: "customJwt" as const,
					},
				]
			: []),
	],
} satisfies AuthConfig;
