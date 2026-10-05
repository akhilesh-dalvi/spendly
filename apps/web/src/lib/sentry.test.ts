import type { Event, init } from "@sentry/nextjs";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { reportError } from "./report-error";
import { getDiagnosticTags, isExpectedError } from "./sentry-errors";
import { getSentryOptions } from "./sentry-options";
import { scrubEnvelope, scrubErrorEvent, scrubSpan } from "./sentry-privacy";

type SentrySpan = Parameters<
	NonNullable<Parameters<typeof init>[0]["beforeSendSpan"]>
>[0];

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

describe("Sentry privacy", () => {
	it("scrubs trace envelope metadata and retains trusted deployment details", () => {
		const headers = {
			trace: {
				trace_id: "trace-id",
				public_key: "public-key",
				sampled: "true",
				transaction: "GET /accounts/private-id?note=private",
				release: "private",
				environment: "private",
				user_segment: "private",
			},
		};
		scrubEnvelope([headers, []], {
			environment: "production",
			release: "commit-sha",
		});
		expect(JSON.stringify(headers)).not.toContain("private");
		expect(headers.trace).toEqual({
			trace_id: "trace-id",
			public_key: "public-key",
			sampled: "true",
			transaction: "/accounts/[id]",
			environment: "production",
			release: "commit-sha",
		});
	});
	it("removes financial data from every error payload surface while retaining source locations", () => {
		const sensitive = "Private savings 9876.54 person@example.com";
		const event: Event = {
			event_id: "test-event",
			release: "commit-sha",
			environment: "production",
			message: sensitive,
			logentry: { message: sensitive, params: [sensitive] },
			user: { email: sensitive, ip_address: "192.0.2.1" },
			extra: { amount: sensitive },
			tags: { feature: "accounts", operation: "transfer", account: sensitive },
			breadcrumbs: [{ message: sensitive }],
			server_name: sensitive,
			fingerprint: [sensitive],
			request: {
				url: `https://spendly.example/accounts/private-id?note=${sensitive}`,
				data: sensitive,
				headers: { Authorization: sensitive },
				cookies: { session: sensitive },
			},
			contexts: {
				trace: {
					trace_id: "trace",
					span_id: "span",
					data: { note: sensitive },
				},
				custom: { note: sensitive },
			},
			exception: {
				values: [
					{
						type: "TypeError",
						value: sensitive,
						mechanism: {
							type: "generic",
							handled: true,
							data: { note: sensitive },
						},
						stacktrace: {
							frames: [
								{
									filename: "/src/expense-form.tsx?token=secret",
									function: "submitExpense",
									lineno: 42,
									vars: { amount: sensitive },
									context_line: sensitive,
								},
							],
						},
					},
				],
			},
			threads: { values: [{ name: sensitive }] },
		};
		const scrubbed = scrubErrorEvent(event, {
			originalException: new Error(sensitive),
		});
		expect(JSON.stringify(scrubbed)).not.toContain(sensitive);
		expect(JSON.stringify(scrubbed)).not.toContain("secret");
		expect(JSON.stringify(scrubbed)).not.toContain("private-id");
		expect(scrubbed?.tags).toEqual({
			surface: "web",
			feature: "accounts",
			operation: "transfer",
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
				transaction: "GET /expenses/private-id?amount=99",
				tags: { feature: "private account", operation: "private note" },
			},
			{}
		);
		expect(event?.transaction).toBe("/expenses/[id]");
		expect(event?.tags).toEqual({ surface: "web" });
	});

	it("removes sensitive span names, attributes, and link attributes", () => {
		const span: SentrySpan = {
			trace_id: "trace",
			span_id: "span",
			start_timestamp: 1,
			end_timestamp: 2,
			status: "ok",
			is_segment: true,
			name: "GET /accounts/private-id?note=private",
			attributes: {
				"sentry.op": "http.server",
				"sentry.segment.id": "abcdef0123456789",
				"sentry.segment.name": "/accounts/private-id",
				"http.request.body": "private",
				"user.email": "private",
			},
			links: [
				{
					trace_id: "other",
					span_id: "other",
					attributes: { note: "private" },
				},
			],
		};
		const scrubbed = scrubSpan(span);
		expect(JSON.stringify(scrubbed)).not.toContain("private");
		expect(scrubbed).toMatchObject({
			name: "/accounts/[id]",
			attributes: {
				"sentry.op": "http.server",
				"sentry.segment.id": "abcdef0123456789",
				"sentry.segment.name": "/accounts/[id]",
			},
			trace_id: "trace",
			end_timestamp: 2,
		});
	});

	it("redacts child span descriptions including outbound URLs", () => {
		expect(
			scrubSpan({
				trace_id: "trace",
				span_id: "span",
				start_timestamp: 1,
				status: "error",
				is_segment: false,
				name: "https://private.example?token=secret",
				attributes: { "sentry.op": "http.client" },
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
			getSentryOptions({ dsn, environment: "production", enabled: false })
				.enabled
		).toBe(false);
	});

	it("blocks identity and payload collection and discards logs and metrics", () => {
		const options = getSentryOptions({});
		expect(options.dataCollection).toMatchObject({
			userInfo: false,
			httpBodies: [],
			cookies: false,
			httpHeaders: false,
			urlQueryParams: false,
			stackFrameVariables: false,
			genAI: { inputs: false, outputs: false },
		});
		expect(options.sampleRate).toBe(1);
		expect(options.tracesSampleRate).toBe(0.1);
		expect(options.tracePropagationTargets).toEqual([]);
		expect(
			getSentryOptions({
				environment: "production",
				release: "commit-sha",
			}).beforeSendSpan?.({
				trace_id: "trace-id",
				span_id: "span-id",
				start_timestamp: 1,
				status: "ok",
				is_segment: true,
				name: "/accounts/private-id",
				attributes: { "sentry.op": "pageload", "user.email": "private" },
			})
		).toMatchObject({
			name: "/accounts/[id]",
			attributes: {
				"sentry.environment": "production",
				"sentry.release": "commit-sha",
			},
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
