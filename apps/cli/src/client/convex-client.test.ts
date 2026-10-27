import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../errors.js";
import type { BackendQuery } from "../runtime.js";
import { queryWithRetry, toBackendCliError } from "./convex-client.js";

describe("Convex read client", () => {
	it.each([
		new TypeError("Failed to fetch"),
		{ code: "ECONNRESET" },
		new Error("Fetch failed"),
		new Error("Wrapped", { cause: { code: "ETIMEDOUT" } }),
	])("classifies network failure %# as retryable", (failure) => {
		expect(toBackendCliError(failure)).toMatchObject({
			cause: failure,
			code: "NETWORK_ERROR",
			retryable: true,
		});
	});

	it.each([
		null,
		"failure",
		{},
		{ code: "UNKNOWN" },
		new Error("unknown"),
		new Error("wrapped", { cause: "unknown" }),
		new ConvexError({
			code: "FUTURE_CODE",
			details: {},
			message: "unknown",
			retryable: true,
		}),
		new ConvexError("malformed"),
	])("classifies unknown backend failure %# as internal", (failure) => {
		expect(toBackendCliError(failure)).toMatchObject({
			code: "INTERNAL_ERROR",
			retryable: false,
		});
	});

	it("preserves CLI errors and maps backend argument validation to invalid input", () => {
		const error = new CliError("INVALID_INPUT", "already mapped");
		expect(toBackendCliError(error)).toBe(error);
		expect(
			toBackendCliError(new Error("ArgumentValidationError: missing amount"))
		).toMatchObject({ code: "INVALID_INPUT", retryable: false });
	});

	it.each([
		{ attempts: 3, code: "NETWORK_ERROR", retryable: true },
		{ attempts: 1, code: "NETWORK_ERROR", retryable: false },
		{ attempts: 1, code: "INVALID_INPUT", retryable: true },
	] as const)(
		"bounds retries for $code retryable=$retryable",
		async ({ code, retryable, attempts }) => {
			const failure = new CliError(code, "failed", { retryable });
			const query = vi.fn(() => Promise.reject(failure));
			const sleep = vi.fn(async () => undefined);
			await expect(
				queryWithRetry({
					args: {},
					functionName: "expenses:list",
					query,
					retry: true,
					sleep,
				})
			).rejects.toBe(failure);
			expect(query).toHaveBeenCalledTimes(attempts);
			expect(sleep).toHaveBeenCalledTimes(attempts - 1);
		}
	);
	it("retries temporary read failures at most three times", async () => {
		let attempts = 0;
		const delays: number[] = [];
		const query: BackendQuery = async <Result>(): Promise<Result> => {
			attempts += 1;
			if (attempts < 3) {
				throw new CliError("NETWORK_ERROR", "temporary", { retryable: true });
			}
			return await Promise.resolve({ ok: true } as Result);
		};

		const result = await queryWithRetry<{ ok: boolean }>({
			args: {},
			functionName: "cli/v1/context:get",
			query,
			retry: true,
			sleep: async (milliseconds) => {
				delays.push(milliseconds);
				await Promise.resolve();
			},
		});

		expect(result).toEqual({ ok: true });
		expect(attempts).toBe(3);
		expect(delays).toEqual([100, 250]);
	});

	it("does not retry reads when --no-retry is active", async () => {
		let attempts = 0;
		const query: BackendQuery = async <Result>(): Promise<Result> => {
			attempts += 1;
			return await Promise.reject(
				new CliError("NETWORK_ERROR", "temporary", { retryable: true })
			);
		};

		await expect(
			queryWithRetry({
				args: {},
				functionName: "cli/v1/context:get",
				query,
				retry: false,
			})
		).rejects.toMatchObject({ code: "NETWORK_ERROR" });
		expect(attempts).toBe(1);
	});

	it("preserves stable backend error codes and details", () => {
		const error = new ConvexError({
			code: "RESOURCE_NOT_FOUND",
			details: { resource: "expense" },
			message: "The requested resource was not found",
			retryable: false,
		});

		expect(toBackendCliError(error)).toMatchObject({
			code: "RESOURCE_NOT_FOUND",
			details: { resource: "expense" },
			exitCode: 4,
			retryable: false,
		});
	});
});
