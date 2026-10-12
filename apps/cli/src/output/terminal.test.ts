import { describe, expect, it, vi } from "vitest";
import { writeTerminalError, writeTerminalSuccess } from "./terminal.js";

describe("terminal output", () => {
	it.each([
		{ value: "Ready", expected: "Ready\n" },
		{ value: null, expected: "null\n" },
		{ value: 42, expected: "42\n" },
		{ value: [1, 2], expected: "[\n  1,\n  2\n]\n" },
		{
			value: {
				missing: null,
				active: true,
				archived: false,
				count: 0,
				name: "Wallet",
				nested: { id: "a" },
			},
			expected:
				'missing: none\nactive: yes\narchived: no\ncount: 0\nname: Wallet\nnested: {"id":"a"}\n',
		},
	])("renders scalar, array, and object data %#", ({ value, expected }) => {
		const write = vi.fn();
		writeTerminalSuccess(value, { write });
		expect(write).toHaveBeenCalledExactlyOnceWith(expected);
	});

	it.each([
		{
			code: "AUTHENTICATION_REQUIRED",
			retryable: false,
			color: false,
			recovery: "\nRun: spendly auth login",
		},
		{
			code: "INVALID_INPUT",
			retryable: false,
			color: true,
			recovery: "\nTry: Check the named value and run the command with --help.",
		},
		{
			code: "INVALID_AUTH_CALLBACK",
			retryable: true,
			color: false,
			recovery:
				"\nTry: The operation may be retried using the existing safety rules.",
		},
		{
			code: "CONFIGURATION_ERROR",
			retryable: false,
			color: false,
			recovery: "",
		},
	] as const)("provides appropriate recovery for $code retryable=$retryable", ({
		code,
		retryable,
		color,
		recovery,
	}) => {
		const write = vi.fn();
		writeTerminalError({
			code,
			retryable,
			color,
			message: "Stopped",
			stderr: { write },
		});
		expect(write).toHaveBeenCalledExactlyOnceWith(
			`${color ? "\u001b[31mError\u001b[0m" : "Error"} [${code}]: Stopped${recovery}\n`
		);
	});
});
