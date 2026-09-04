import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { CliError } from "../errors.js";
import type { BackendQuery } from "../runtime.js";
import { queryWithRetry, toBackendCliError } from "./convex-client.js";

describe("Convex read client", () => {
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
