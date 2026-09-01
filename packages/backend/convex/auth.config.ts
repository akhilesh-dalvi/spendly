import type { AuthConfig } from "convex/server";

const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;
const cliOAuthClientId = process.env.CLERK_CLI_OAUTH_CLIENT_ID;

if (!clerkDomain) {
	throw new Error("CLERK_JWT_ISSUER_DOMAIN is required");
}

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
