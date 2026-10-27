import { describe, expect, it, vi } from "vitest";
import { writeTerminalError, writeTerminalSuccess } from "./terminal.js";

describe("terminal output", () => {
	it.each([
		{ expected: "Ready\n", value: "Ready" },
		{ expected: "null\n", value: null },
		{ expected: "42\n", value: 42 },
		{ expected: "[\n  1,\n  2\n]\n", value: [1, 2] },
		{
			expected:
				'missing: none\nactive: yes\narchived: no\ncount: 0\nname: Wallet\nnested: {"id":"a"}\n',
			value: Object.fromEntries([
				["missing", null],
				["active", true],
				["archived", false],
				["count", 0],
				["name", "Wallet"],
				["nested", { id: "a" }],
			]),
		},
	])("renders scalar, array, and object data %#", ({ value, expected }) => {
		const write = vi.fn();
		writeTerminalSuccess(value, { write });
		expect(write).toHaveBeenCalledExactlyOnceWith(expected);
	});

	it.each([
		{
			code: "AUTHENTICATION_REQUIRED",
			color: false,
			recovery: "\nRun: spendly auth login",
			retryable: false,
		},
		{
			code: "INVALID_INPUT",
			color: true,
			recovery: "\nTry: Check the named value and run the command with --help.",
			retryable: false,
		},
		{
			code: "INVALID_AUTH_CALLBACK",
			color: false,
			recovery:
				"\nTry: The operation may be retried using the existing safety rules.",
			retryable: true,
		},
		{
			code: "CONFIGURATION_ERROR",
			color: false,
			recovery: "",
			retryable: false,
		},
	] as const)(
		"provides appropriate recovery for $code retryable=$retryable",
		({ code, retryable, color, recovery }) => {
			const write = vi.fn();
			writeTerminalError({
				code,
				color,
				message: "Stopped",
				retryable,
				stderr: { write },
			});
			expect(write).toHaveBeenCalledExactlyOnceWith(
				`${color ? "\u001b[31mError\u001b[0m" : "Error"} [${code}]: Stopped${recovery}\n`
			);
		}
	);
});
