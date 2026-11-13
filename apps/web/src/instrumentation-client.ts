import { captureRouterTransitionStart, init } from "@sentry/nextjs";
import { env } from "@spendly/env/web";
import posthog from "posthog-js";
import { getSentryOptions } from "./lib/sentry-options";
import { registerEnvelopePrivacy } from "./lib/sentry-privacy";

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!posthogProjectToken || !posthogHost) {
	if (process.env.NODE_ENV === "development") {
		const missingVariable = posthogProjectToken
			? "NEXT_PUBLIC_POSTHOG_HOST"
			: "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";
		throw new Error(
			`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
		);
	}
} else {
	posthog.init(posthogProjectToken, {
		api_host: posthogHost,
		capture_exceptions: true,
		debug: process.env.NODE_ENV === "development",
		defaults: "2025-05-24",
	});
}

const options = getSentryOptions({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN,
	enabled: env.NEXT_PUBLIC_SENTRY_ENABLED,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	release: env.NEXT_PUBLIC_SENTRY_RELEASE,
});

if (options.enabled) {
	const client = init({
		...options,
		profileSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0,
		replaysSessionSampleRate: 0,
	});
	registerEnvelopePrivacy(client);
}

export const onRouterTransitionStart = captureRouterTransitionStart;
