import { describe, expect, it, vi } from "vitest";
import { PRODUCTION_CONFIG } from "../config.js";
import { createProcessRuntime } from "../runtime.js";

import {
	parseAmount,
	parseBalance,
	parseRevision,
	resolveIdempotencyKey,
	validateMutationText,
} from "./mutation-input.js";

const createRuntime = () => createProcessRuntime(PRODUCTION_CONFIG, {});
const UUID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u;

describe("mutation input boundaries", () => {
	it.each(["0", "0.009", "1e2", "+1", "-1", ".1", "1.", " 1", "9".repeat(310)])(
		"rejects unsafe amount %s",
		(value) => {
			expect(() => parseAmount(value)).toThrow(
				expect.objectContaining({ code: "INVALID_INPUT" })
			);
		}
	);
	it.each([
		{ expected: 0.01, value: "0.01" },
		{ expected: 1.5, value: "001.50" },
	])("accepts decimal amount $value", ({ value, expected }) => {
		expect(parseAmount(value)).toBe(expected);
	});
	it.each(["1e2", "+1", "--1", "NaN", "9".repeat(310)])(
		"rejects unsafe balance %s",
		(value) => {
			expect(() => parseBalance(value)).toThrow(
				expect.objectContaining({ code: "INVALID_INPUT" })
			);
		}
	);
	it.each([
		{ expected: -12.5, value: "-12.50" },
		{ expected: 0, value: "0" },
	])("accepts signed balance $value", ({ value, expected }) => {
		expect(parseBalance(value)).toBe(expected);
	});
	it.each(["0", "1.0", "-1", "9007199254740992"])(
		'rejects invalid revision "%s"',
		(value) => {
			expect(() => parseRevision(value)).toThrow(
				expect.objectContaining({ code: "INVALID_INPUT" })
			);
		}
	);
	it("accepts the maximum safe revision and preserves meaningful text", () => {
		expect(parseRevision("9007199254740991")).toBe(9_007_199_254_740_991);
		expect(validateMutationText(undefined, "--note")).toBeUndefined();
		expect(validateMutationText(" note ", "--note")).toBe(" note ");
		expect(() => validateMutationText(" \t", "--note")).toThrow(
			"--note cannot be empty"
		);
	});

	it.each([7, 201])(
		"rejects idempotency keys of length %s even for dry runs",
		(length) => {
			expect(() =>
				resolveIdempotencyKey({
					dryRun: true,
					nonInteractive: false,
					provided: "x".repeat(length),
					runtime: createRuntime(),
				})
			).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
		}
	);
	it.each([8, 200])("accepts trimmed keys at length boundary %s", (length) => {
		expect(
			resolveIdempotencyKey({
				dryRun: false,
				nonInteractive: true,
				provided: ` ${"x".repeat(length)} `,
				runtime: createRuntime(),
			})
		).toBe("x".repeat(length));
	});
	it("omits dry-run keys, requires noninteractive commit keys, and generates interactive keys", () => {
		const runtime = createRuntime();
		expect(
			resolveIdempotencyKey({ dryRun: true, nonInteractive: true, runtime })
		).toBeUndefined();
		expect(() =>
			resolveIdempotencyKey({ dryRun: false, nonInteractive: true, runtime })
		).toThrow(
			expect.objectContaining({ code: "NON_INTERACTIVE_INPUT_REQUIRED" })
		);
		const randomIdempotencyKey = vi.fn(() => "generated-key");
		expect(
			resolveIdempotencyKey({
				dryRun: false,
				nonInteractive: false,
				runtime: { ...runtime, randomIdempotencyKey },
			})
		).toBe("generated-key");
		expect(randomIdempotencyKey).toHaveBeenCalledOnce();
		expect(
			resolveIdempotencyKey({ dryRun: false, nonInteractive: false, runtime })
		).toMatch(UUID_PATTERN);
	});
});
