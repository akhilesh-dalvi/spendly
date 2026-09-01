import { describe, expect, it } from "vitest";
import { CLI_EXIT_CODE, type CliErrorCode, getExitCode } from "./errors.js";

describe("CLI exit codes", () => {
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
