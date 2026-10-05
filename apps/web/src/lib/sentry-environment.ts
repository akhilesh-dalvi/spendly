export function getSentryEnvironment(): string {
	// NODE_ENV describes the build mode, not whether this is a live deployment.
	return (
		process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
		process.env.VERCEL_ENV ||
		"development"
	);
}
