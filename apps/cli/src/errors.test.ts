import { describe, expect, it } from "vitest";
import {
	CLI_EXIT_CODE,
	CliError,
	type CliErrorCode,
	getExitCode,
} from "./errors.js";
import { createJsonErrorEnvelope } from "./output/json.js";

describe("CLI exit codes", () => {
	it("retains a diagnostic cause without exposing it in user-facing errors", () => {
		const cause = new Error("private provider response");
		const error = CliError.fromCause(
			cause,
			"NETWORK_ERROR",
			"Unable to reach the authentication provider",
			{ details: { operation: "login" }, retryable: true }
		);
		expect(error.cause).toBe(cause);
		expect(error.exitCode).toBe(CLI_EXIT_CODE.temporary);
		expect(createJsonErrorEnvelope(error)).toEqual({
			error: {
				code: "NETWORK_ERROR",
				details: { operation: "login" },
				message: "Unable to reach the authentication provider",
				retryable: true,
			},
			schemaVersion: 1,
		});
		expect(JSON.stringify(error)).not.toContain(cause.message);
	});
	it.each<[CliErrorCode, number]>([
		["INTERNAL_ERROR", CLI_EXIT_CODE.internal],
		["INVALID_INPUT", CLI_EXIT_CODE.invalidInput],
		["AUTHENTICATION_REQUIRED", CLI_EXIT_CODE.authentication],
		["RESOURCE_NOT_FOUND", CLI_EXIT_CODE.notFound],
		["REVISION_CONFLICT", CLI_EXIT_CODE.conflict],
		["DELETION_CONFIRMATION_REQUIRED", CLI_EXIT_CODE.confirmation],
		["NETWORK_ERROR", CLI_EXIT_CODE.temporary],
	])("maps %s to %i", (errorCode, exitCode) => {
		expect(getExitCode(errorCode)).toBe(exitCode);
	});
});
