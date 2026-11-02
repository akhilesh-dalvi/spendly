import { PRODUCTION_CONFIG } from "../../../apps/cli/src/config.ts";

const DEPLOYMENT_HOST = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.convex\.cloud$/u;
const DEVELOPMENT_KEY = /^dev:([a-z0-9]+(?:-[a-z0-9]+)*)\|[A-Za-z0-9_+/=-]+$/u;

export interface E2EEnvironment {
	baseUrl: string;
	clerkIssuer: string;
	convexUrl: string;
	deployKey: string;
	oauthClientId: string;
	publishableKey: string;
	secretKey: string;
}

const invalidConfiguration = () =>
	new Error(
		"E2E configuration requires explicit opt-in, matching development Clerk keys and a matching dev Convex deployment key. See CONTRIBUTING.md."
	);

const parseOrigin = (value: string): URL => {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw invalidConfiguration();
	}
	if (
		url.protocol !== "https:" ||
		url.pathname !== "/" ||
		url.search ||
		url.hash ||
		url.username ||
		url.password ||
		url.port ||
		(value !== url.origin && value !== `${url.origin}/`)
	) {
		throw invalidConfiguration();
	}
	return url;
};

export const loadEnvironment = (
	env: NodeJS.ProcessEnv = process.env
): E2EEnvironment => {
	const convexUrl = env.E2E_CONVEX_URL ?? "";
	const deployKey = env.E2E_CONVEX_DEPLOY_KEY ?? "";
	const clerkIssuer = env.E2E_CLERK_ISSUER ?? "";
	const publishableKey = env.E2E_CLERK_PUBLISHABLE_KEY ?? "";
	const secretKey = env.E2E_CLERK_SECRET_KEY ?? "";
	const oauthClientId = env.E2E_CLERK_OAUTH_CLIENT_ID ?? "";
	if (
		env.SPENDLY_E2E_ENABLED !== "true" ||
		!oauthClientId ||
		!publishableKey.startsWith("pk_test_") ||
		!secretKey.startsWith("sk_test_")
	) {
		throw invalidConfiguration();
	}
	const deployment = parseOrigin(convexUrl);
	const issuer = parseOrigin(clerkIssuer);
	const deploymentName = DEPLOYMENT_HOST.exec(deployment.hostname)?.[1];
	const keyMatch = DEVELOPMENT_KEY.exec(deployKey);
	const publishedHost = Buffer.from(
		publishableKey.slice("pk_test_".length),
		"base64"
	).toString("utf8");
	if (
		!(deploymentName && keyMatch?.[1] === deploymentName) ||
		keyMatch?.[0] !== deployKey ||
		deployment.origin === PRODUCTION_CONFIG.convexUrl ||
		!issuer.hostname.endsWith(".accounts.dev") ||
		publishedHost !== `${issuer.hostname}$`
	) {
		throw invalidConfiguration();
	}
	return {
		baseUrl: "http://localhost:3001",
		clerkIssuer: issuer.origin,
		convexUrl: deployment.origin,
		deployKey,
		oauthClientId,
		publishableKey,
		secretKey,
	};
};

export const webEnvironment = (
	config: E2EEnvironment
): Record<string, string> => ({
	CI: process.env.CI ?? "",
	CLERK_API_URL: "https://api.clerk.com",
	CLERK_PROXY_URL: "",
	CLERK_SECRET_KEY: config.secretKey,
	CLERK_SIGN_IN_URL: "/sign-in",
	CLERK_SIGN_UP_URL: "/sign-up",
	HOME: process.env.HOME ?? "",
	NEXT_PUBLIC_CLERK_PROXY_URL: "",
	NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: config.publishableKey,
	NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL: "/onboarding/start",
	NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
	NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: "/onboarding/start",
	NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
	NEXT_PUBLIC_CONVEX_URL: config.convexUrl,
	NEXT_PUBLIC_SENTRY_ENABLED: "false",
	NEXT_PUBLIC_SITE_URL: config.baseUrl,
	PATH: process.env.PATH ?? "",
	SENTRY_AUTH_TOKEN: "",
	TZ: "UTC",
});
