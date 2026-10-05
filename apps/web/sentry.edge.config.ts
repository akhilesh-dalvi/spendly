import { init } from "@sentry/nextjs";
import { env } from "@spendly/env/web";
import { getSentryOptions } from "./src/lib/sentry-options";
import { registerEnvelopePrivacy } from "./src/lib/sentry-privacy";

const options = getSentryOptions({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN,
	enabled: env.NEXT_PUBLIC_SENTRY_ENABLED,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	release: env.NEXT_PUBLIC_SENTRY_RELEASE,
});

if (options.enabled) {
	registerEnvelopePrivacy(init(options));
}
