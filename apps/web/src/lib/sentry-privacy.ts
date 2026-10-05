import type { Event, EventHint, init, StackFrame } from "@sentry/nextjs";
import { getDiagnosticTags, isExpectedError } from "./sentry-errors";

type SentrySpan = Parameters<
	NonNullable<Parameters<typeof init>[0]["beforeSendSpan"]>
>[0];

const ERROR_TYPES = new Set([
	"Error",
	"TypeError",
	"ReferenceError",
	"RangeError",
	"SyntaxError",
	"URIError",
	"EvalError",
	"AggregateError",
	"ConvexError",
	"AbortError",
]);
const FEATURES = new Set([
	"expenses",
	"accounts",
	"account-types",
	"tags",
	"auth",
	"onboarding",
	"app",
]);
const OPERATIONS = new Set([
	"create",
	"update",
	"delete",
	"adjust-balance",
	"transfer",
	"set-default",
	"archive",
	"reactivate",
	"sync",
	"render",
	"start",
	"complete",
	"skip",
]);
const STATIC_ROUTES = new Set([
	"dashboard",
	"compare",
	"settings",
	"pricing",
	"privacy",
	"terms",
]);
const DATA_ROUTES = new Set(["types", "tags", "account-types"]);
const ONBOARDING_ROUTES = new Set(["start", "categories", "cycle", "accounts"]);
const HTTP_METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /;
const URL_SUFFIX = /[?#]/;
const LOCAL_USER_PATH = /\/Users\/[^/]+\//g;
const REQUEST_ID = /^[a-f0-9]{16,64}$/;
const SAFE_OP = /^[a-z][a-z._]{0,60}$/;
const SPAN_ID = /^[a-f0-9]{16}$/;
const SAMPLING_FIELDS = new Set([
	"trace_id",
	"public_key",
	"sample_rate",
	"sampled",
	"sample_rand",
	"org_id",
]);

interface DeploymentMetadata {
	environment: string;
	release?: string;
}

// Route templates keep page-level diagnosis without sending document IDs or searches.
function safeRoute(value: string): string {
	let pathname: string;
	try {
		pathname = new URL(
			value.replace(HTTP_METHOD, ""),
			"https://spendly.invalid"
		).pathname;
	} catch {
		return "/other";
	}
	const [root, detail, action] = pathname.split("/").filter(Boolean);
	if (!root) {
		return "/";
	}
	if (STATIC_ROUTES.has(root)) {
		return `/${root}`;
	}
	if (root === "docs") {
		return "/docs/[...slug]";
	}
	if (root === "sign-in" || root === "sign-up") {
		return `/${root}/[[...rest]]`;
	}
	if (root === "data" && detail && DATA_ROUTES.has(detail)) {
		return `/data/${detail}`;
	}
	if (root === "onboarding" && detail && ONBOARDING_ROUTES.has(detail)) {
		return `/onboarding/${detail}`;
	}
	if (["accounts", "expenses", "cycles", "categories"].includes(root)) {
		if (!detail) {
			return `/${root}`;
		}
		if (detail === "new") {
			return `/${root}/new`;
		}
		return `/${root}/[id]${action === "edit" ? "/edit" : ""}`;
	}
	return "/other";
}

function safeSource(value: string | undefined): string | undefined {
	return value
		?.split(URL_SUFFIX, 1)[0]
		?.replace(LOCAL_USER_PATH, "/Users/[redacted]/");
}

function scrubFrame(frame: StackFrame): StackFrame {
	return {
		filename: safeSource(frame.filename),
		abs_path: safeSource(frame.abs_path),
		function: frame.function,
		module: frame.module,
		lineno: frame.lineno,
		colno: frame.colno,
		in_app: frame.in_app,
		debug_id: frame.debug_id,
	};
}

function safeTags(tags: Event["tags"]): Record<string, string> {
	const result: Record<string, string> = { surface: "web" };
	if (typeof tags?.feature === "string" && FEATURES.has(tags.feature)) {
		result.feature = tags.feature;
	}
	if (typeof tags?.operation === "string" && OPERATIONS.has(tags.operation)) {
		result.operation = tags.operation;
	}
	if (
		typeof tags?.convex_request_id === "string" &&
		REQUEST_ID.test(tags.convex_request_id)
	) {
		result.convex_request_id = tags.convex_request_id;
	}
	if (
		tags?.error_code === "INTERNAL_ERROR" ||
		tags?.error_code === "RESOURCE_LIMIT_EXCEEDED"
	) {
		result.error_code = tags.error_code;
	}
	return result;
}

export function scrubErrorEvent(
	event: Event,
	hint: EventHint
): (Event & { type: undefined }) | null {
	if (isExpectedError(hint.originalException)) {
		return null;
	}
	const trace = event.contexts?.trace;
	// Construct an allowlist instead of trying to detect arbitrary financial/free-text PII.
	return {
		type: undefined,
		event_id: event.event_id,
		timestamp: event.timestamp,
		level: event.level,
		platform: event.platform,
		release: event.release,
		environment: event.environment,
		// An explicit non-routable IP prevents ingestion from inferring connection geolocation.
		user: { ip_address: "0.0.0.0" },
		sdk: event.sdk,
		debug_meta: event.debug_meta,
		message: event.message ? "Unexpected error in Spendly" : undefined,
		tags: {
			...safeTags(event.tags),
			...getDiagnosticTags(hint.originalException),
		},
		transaction: event.transaction ? safeRoute(event.transaction) : undefined,
		request: event.request?.url
			? { url: safeRoute(event.request.url) }
			: undefined,
		contexts: trace
			? {
					trace: {
						trace_id: trace.trace_id,
						span_id: trace.span_id,
						parent_span_id: trace.parent_span_id,
					},
				}
			: undefined,
		exception: event.exception
			? {
					values: event.exception.values?.map((exception) => ({
						type:
							exception.type && ERROR_TYPES.has(exception.type)
								? exception.type
								: "Error",
						value: "Unexpected error in Spendly",
						mechanism: exception.mechanism
							? {
									type: exception.mechanism.type,
									handled: exception.mechanism.handled,
								}
							: undefined,
						stacktrace: exception.stacktrace
							? { frames: exception.stacktrace.frames?.map(scrubFrame) }
							: undefined,
					})),
				}
			: undefined,
	};
}

export function scrubSpan(
	span: SentrySpan,
	deployment?: DeploymentMetadata
): SentrySpan {
	const op = span.attributes["sentry.op"];
	const safeOp = typeof op === "string" && SAFE_OP.test(op) ? op : "operation";
	const segmentId = span.attributes["sentry.segment.id"];
	const segmentName = span.attributes["sentry.segment.name"];
	return {
		trace_id: span.trace_id,
		span_id: span.span_id,
		parent_span_id: span.parent_span_id,
		start_timestamp: span.start_timestamp,
		end_timestamp: span.end_timestamp,
		status: span.status,
		is_segment: span.is_segment,
		name: span.is_segment ? safeRoute(span.name) : `Spendly ${safeOp}`,
		attributes: {
			"sentry.op": safeOp,
			"sentry.trace_lifecycle": "stream",
			...(typeof segmentId === "string" && SPAN_ID.test(segmentId)
				? { "sentry.segment.id": segmentId }
				: {}),
			...(typeof segmentName === "string"
				? { "sentry.segment.name": safeRoute(segmentName) }
				: {}),
			...(deployment ? { "sentry.environment": deployment.environment } : {}),
			...(deployment?.release ? { "sentry.release": deployment.release } : {}),
		},
	};
}

export function scrubEnvelope(
	[headers]: [Record<string, unknown>, unknown[]],
	deployment: DeploymentMetadata
): void {
	const trace = headers.trace;
	if (!trace || typeof trace !== "object") {
		return;
	}
	const scrubbed: Record<string, string> = {
		environment: deployment.environment,
		...(deployment.release ? { release: deployment.release } : {}),
	};
	for (const [key, value] of Object.entries(trace)) {
		if (SAMPLING_FIELDS.has(key) && typeof value === "string") {
			scrubbed[key] = value;
		}
		if (key === "transaction" && typeof value === "string") {
			scrubbed.transaction = safeRoute(value);
		}
	}
	headers.trace = scrubbed;
}

export function registerEnvelopePrivacy(client: ReturnType<typeof init>): void {
	client?.on("beforeEnvelope", (envelope) => {
		const options = client.getOptions();
		scrubEnvelope(envelope, {
			environment: options.environment ?? "development",
			release: options.release,
		});
	});
}
