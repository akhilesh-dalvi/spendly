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
		dsn: configuration.dsn,
		enabled:
			Boolean(configuration.dsn) &&
			(configuration.enabled ?? environment === "production"),
		environment,
		release: configuration.release,
		sampleRate: 1,
		tracesSampleRate: 0.1,
		tracePropagationTargets: [],
		maxBreadcrumbs: 0,
		beforeBreadcrumb: () => null,
		beforeSend: scrubErrorEvent,
		beforeSendSpan: (span) =>
			scrubSpan(span, { environment, release: configuration.release }),
		beforeSendLog: () => null,
		beforeSendMetric: () => null,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			databaseQueryData: false,
			stackFrameVariables: false,
			queues: false,
			graphQL: { document: false, variables: false },
			genAI: { inputs: false, outputs: false },
		},
	};
}
