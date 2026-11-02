import type { Event, init } from "@sentry/nextjs";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./report-error";
import { getSentryEnvironment } from "./sentry-environment";
import { getDiagnosticTags, isExpectedError } from "./sentry-errors";
import { getSentryOptions } from "./sentry-options";
import { scrubEnvelope, scrubErrorEvent, scrubSpan } from "./sentry-privacy";

type SentrySpan = Parameters<
	NonNullable<Parameters<typeof init>[0]["beforeSendSpan"]>
>[0];

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("Sentry deployment environment", () => {
	it("keeps local production builds in development", () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("VERCEL_ENV", undefined);
		vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
		expect(getSentryEnvironment()).toBe("development");
	});

	it("recognizes a Vercel production deployment", () => {
		vi.stubEnv("VERCEL_ENV", "production");
		vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
		expect(getSentryEnvironment()).toBe("production");
	});

	it("keeps Vercel previews out of the production environment", () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("VERCEL_ENV", "preview");
		vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
		expect(getSentryEnvironment()).toBe("preview");
	});

	it("respects an explicit environment override", () => {
		vi.stubEnv("VERCEL_ENV", "production");
		vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "test");
		expect(getSentryEnvironment()).toBe("test");
	});
});

describe("Sentry privacy", () => {
	it("scrubs trace envelope metadata and retains trusted deployment details", () => {
		const headers = {
			trace: {
				environment: "private",
				public_key: "public-key",
				release: "private",
				sampled: "true",
				trace_id: "trace-id",
				transaction: "GET /accounts/private-id?note=private",
				user_segment: "private",
			},
		};
		scrubEnvelope([headers, []], {
			environment: "production",
			release: "commit-sha",
		});
		expect(JSON.stringify(headers)).not.toContain("private");
		expect(headers.trace).toEqual({
			environment: "production",
			public_key: "public-key",
			release: "commit-sha",
			sampled: "true",
			trace_id: "trace-id",
			transaction: "/accounts/[id]",
		});
	});
	it("removes financial data from every error payload surface while retaining source locations", () => {
		const sensitive = "Private savings 9876.54 person@example.com";
		const event: Event = {
			breadcrumbs: [{ message: sensitive }],
			contexts: {
				custom: { note: sensitive },
				trace: {
					data: { note: sensitive },
					span_id: "span",
					trace_id: "trace",
				},
			},
			environment: "production",
			event_id: "test-event",
			exception: {
				values: [
					{
						mechanism: {
							data: { note: sensitive },
							handled: true,
							type: "generic",
						},
						stacktrace: {
							frames: [
								{
									context_line: sensitive,
									filename: "/src/expense-form.tsx?token=secret",
									function: "submitExpense",
									lineno: 42,
									vars: { amount: sensitive },
								},
							],
						},
						type: "TypeError",
						value: sensitive,
					},
				],
			},
			extra: { amount: sensitive },
			fingerprint: [sensitive],
			logentry: { message: sensitive, params: [sensitive] },
			message: sensitive,
			release: "commit-sha",
			request: {
				cookies: { session: sensitive },
				data: sensitive,
				headers: { Authorization: sensitive },
				url: `https://spendly.example/accounts/private-id?note=${sensitive}`,
			},
			server_name: sensitive,
			tags: { account: sensitive, feature: "accounts", operation: "transfer" },
			threads: { values: [{ name: sensitive }] },
			user: { email: sensitive, ip_address: "192.0.2.1" },
		};
		const scrubbed = scrubErrorEvent(event, {
			originalException: new Error(sensitive),
		});
		expect(JSON.stringify(scrubbed)).not.toContain(sensitive);
		expect(JSON.stringify(scrubbed)).not.toContain("secret");
		expect(JSON.stringify(scrubbed)).not.toContain("private-id");
		expect(scrubbed?.tags).toEqual({
			feature: "accounts",
			operation: "transfer",
			surface: "web",
		});
		expect(
			scrubbed?.exception?.values?.[0]?.stacktrace?.frames?.[0]
		).toMatchObject({
			filename: "/src/expense-form.tsx",
			function: "submitExpense",
			lineno: 42,
		});
		expect(event.user?.email).toBe(sensitive);
		expect(scrubbed?.user).toEqual({ ip_address: "0.0.0.0" });
	});

	it("normalizes dynamic routes and discards user-supplied operation tags", () => {
		const event = scrubErrorEvent(
			{
				tags: { feature: "private account", operation: "private note" },
				transaction: "GET /expenses/private-id?amount=99",
			},
			{}
		);
		expect(event?.transaction).toBe("/expenses/[id]");
		expect(event?.tags).toEqual({ surface: "web" });
	});

	it("removes sensitive span names, attributes, and link attributes", () => {
		const span: SentrySpan = {
			attributes: {
				"http.request.body": "private",
				"sentry.op": "http.server",
				"sentry.segment.id": "abcdef0123456789",
				"sentry.segment.name": "/accounts/private-id",
				"user.email": "private",
			},
			end_timestamp: 2,
			is_segment: true,
			links: [
				{
					attributes: { note: "private" },
					span_id: "other",
					trace_id: "other",
				},
			],
			name: "GET /accounts/private-id?note=private",
			span_id: "span",
			start_timestamp: 1,
			status: "ok",
			trace_id: "trace",
		};
		const scrubbed = scrubSpan(span);
		expect(JSON.stringify(scrubbed)).not.toContain("private");
		expect(scrubbed).toMatchObject({
			attributes: {
				"sentry.op": "http.server",
				"sentry.segment.id": "abcdef0123456789",
				"sentry.segment.name": "/accounts/[id]",
			},
			end_timestamp: 2,
			name: "/accounts/[id]",
			trace_id: "trace",
		});
	});

	it("redacts child span descriptions including outbound URLs", () => {
		expect(
			scrubSpan({
				attributes: { "sentry.op": "http.client" },
				is_segment: false,
				name: "https://private.example?token=secret",
				span_id: "span",
				start_timestamp: 1,
				status: "error",
				trace_id: "trace",
			}).name
		).toBe("Spendly http.client");
	});
});

describe("Sentry error classification", () => {
	it("filters explicit expected domain failures", () => {
		expect(isExpectedError(new ConvexError("ACCOUNT_ARCHIVED"))).toBe(true);
		expect(
			isExpectedError(new ConvexError({ code: "EXPENSE_REVISION_CONFLICT" }))
		).toBe(true);
		expect(
			scrubErrorEvent(
				{},
				{ originalException: new ConvexError("INVALID_TRANSFER_AMOUNT") }
			)
		).toBeNull();
	});

	it("reports unknown ConvexErrors and internal failures", () => {
		expect(isExpectedError(new ConvexError("UNEXPECTED_LEDGER_BUG"))).toBe(
			false
		);
		expect(isExpectedError(new ConvexError({ code: "INTERNAL_ERROR" }))).toBe(
			false
		);
		expect(isExpectedError(new Error("UNAUTHORIZED"))).toBe(false);
		expect(
			scrubErrorEvent(
				{},
				{ originalException: new ConvexError("UNEXPECTED_LEDGER_BUG") }
			)
		).not.toBeNull();
	});

	it("extracts only a validated request ID and known diagnostic codes", () => {
		expect(
			getDiagnosticTags(
				new Error(
					"[CONVEX M(accounts:transfer)] [Request ID: abcdef0123456789] Server Error\nPrivate account"
				)
			)
		).toEqual({ convex_request_id: "abcdef0123456789" });
		expect(getDiagnosticTags(new Error("[Request ID: private note]"))).toEqual(
			{}
		);
		expect(
			getDiagnosticTags(new ConvexError({ code: "PRIVATE_ACCOUNT" }))
		).toEqual({});
	});

	it("does not capture handled expected errors and captures unexpected ones with safe context", async () => {
		const { captureException } = await import("@sentry/nextjs");
		vi.mocked(captureException).mockClear();
		reportError(new ConvexError("ACCOUNT_ARCHIVED"), {
			feature: "accounts",
			operation: "transfer",
		});
		expect(captureException).not.toHaveBeenCalled();
		const error = new Error("Unexpected transfer failure");
		reportError(error, { feature: "accounts", operation: "transfer" });
		expect(captureException).toHaveBeenCalledWith(error, {
			tags: { feature: "accounts", operation: "transfer", surface: "web" },
		});
	});
});

describe("Sentry configuration", () => {
	it("enables production only by default and requires a DSN", () => {
		const dsn = "https://public@example.com/1";
		expect(getSentryOptions({ dsn, environment: "production" }).enabled).toBe(
			true
		);
		expect(getSentryOptions({ dsn, environment: "preview" }).enabled).toBe(
			false
		);
		expect(getSentryOptions({ dsn }).enabled).toBe(false);
		expect(getSentryOptions({ environment: "production" }).enabled).toBe(false);
	});

	it("respects explicit local opt-in and production opt-out", () => {
		const dsn = "https://public@example.com/1";
		expect(getSentryOptions({ dsn, enabled: true }).enabled).toBe(true);
		expect(
			getSentryOptions({ dsn, enabled: false, environment: "production" })
				.enabled
		).toBe(false);
	});

	it("blocks identity and payload collection and discards logs and metrics", () => {
		const options = getSentryOptions({});
		expect(options.dataCollection).toMatchObject({
			cookies: false,
			genAI: { inputs: false, outputs: false },
			httpBodies: [],
			httpHeaders: false,
			stackFrameVariables: false,
			urlQueryParams: false,
			userInfo: false,
		});
		expect(options.sampleRate).toBe(1);
		expect(options.tracesSampleRate).toBe(0.1);
		expect(options.tracePropagationTargets).toEqual([]);
		expect(
			getSentryOptions({
				environment: "production",
				release: "commit-sha",
			}).beforeSendSpan?.({
				attributes: { "sentry.op": "pageload", "user.email": "private" },
				is_segment: true,
				name: "/accounts/private-id",
				span_id: "span-id",
				start_timestamp: 1,
				status: "ok",
				trace_id: "trace-id",
			})
		).toMatchObject({
			attributes: {
				"sentry.environment": "production",
				"sentry.release": "commit-sha",
			},
			name: "/accounts/[id]",
		});
		expect(
			options.beforeSendLog?.({
				level: "error",
				message: "Private account note",
			})
		).toBeNull();
		expect(
			options.beforeSendMetric?.({
				name: "private.balance",
				type: "gauge",
				value: 9876.54,
			})
		).toBeNull();
	});
});
