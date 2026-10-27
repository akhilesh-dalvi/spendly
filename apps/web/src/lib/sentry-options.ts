import type { init } from "@sentry/nextjs";
import { scrubErrorEvent, scrubSpan } from "./sentry-privacy";

interface SentryConfiguration {
	dsn?: string;
	enabled?: boolean;
	environment?: "production" | "preview" | "development" | "test";
	release?: string;
}

export function getSentryOptions(
	configuration: SentryConfiguration
): Parameters<typeof init>[0] {
	const environment = configuration.environment ?? "development";
	return {
		beforeBreadcrumb: () => null,
		beforeSend: scrubErrorEvent,
		beforeSendLog: () => null,
		beforeSendMetric: () => null,
		beforeSendSpan: (span) =>
			scrubSpan(span, { environment, release: configuration.release }),
		dataCollection: {
			cookies: false,
			databaseQueryData: false,
			genAI: { inputs: false, outputs: false },
			graphQL: { document: false, variables: false },
			httpBodies: [],
			httpHeaders: false,
			queues: false,
			stackFrameVariables: false,
			urlQueryParams: false,
			userInfo: false,
		},
		dsn: configuration.dsn,
		enabled:
			Boolean(configuration.dsn) &&
			(configuration.enabled ?? environment === "production"),
		environment,
		maxBreadcrumbs: 0,
		release: configuration.release,
		sampleRate: 1,
		tracePropagationTargets: [],
		tracesSampleRate: 0.1,
	};
}
