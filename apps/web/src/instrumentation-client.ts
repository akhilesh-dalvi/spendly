import { captureRouterTransitionStart, init } from "@sentry/nextjs";
import { env } from "@spendly/env/web";
import { getSentryOptions } from "./lib/sentry-options";
import { registerEnvelopePrivacy } from "./lib/sentry-privacy";

const options = getSentryOptions({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN,
	enabled: env.NEXT_PUBLIC_SENTRY_ENABLED,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	release: env.NEXT_PUBLIC_SENTRY_RELEASE,
});

if (options.enabled) {
	const client = init({
		...options,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0,
		profileSessionSampleRate: 0,
	});
	registerEnvelopePrivacy(client);
}

export const onRouterTransitionStart = captureRouterTransitionStart;
