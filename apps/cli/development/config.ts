import { type RuntimeConfig, runtimeConfigSchema } from "../src/config.js";
import { CliError } from "../src/errors.js";

const TRAILING_SLASH_PATTERN = /\/$/u;

export const loadDevelopmentConfig = (
	environment: NodeJS.ProcessEnv = process.env
): RuntimeConfig => {
	const result = runtimeConfigSchema.safeParse({
		authReady: true,
		clientId: environment.SPENDLY_CLERK_OAUTH_CLIENT_ID,
		convexUrl: environment.SPENDLY_CONVEX_URL,
		environment: "development",
		issuer: environment.SPENDLY_CLERK_ISSUER,
		webUrl: environment.SPENDLY_WEB_URL ?? "http://localhost:3001",
	});

	if (!result.success) {
		throw new CliError(
			"CONFIGURATION_ERROR",
			"Development authentication is not configured. Copy apps/cli/.env.local.example to apps/cli/.env.local and fill in the development values."
		);
	}

	return {
		...result.data,
		issuer: result.data.issuer.replace(TRAILING_SLASH_PATTERN, ""),
	};
};
