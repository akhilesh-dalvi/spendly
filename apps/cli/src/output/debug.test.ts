import { describe, expect, it } from "vitest";
import { CliError } from "../errors.js";
import { writeDebugError } from "./debug.js";

describe("debug output", () => {
	it("redacts nested causes before writing diagnostics", () => {
		let output = "";
		const error = new CliError("INTERNAL_ERROR", "Unexpected failure", {
			cause: new Error(
				"request failed: Bearer secret-token?refresh_token=refresh-secret"
			),
		});

		writeDebugError(error, {
			write: (value) => {
				output += value;
			},
		});

		expect(output).toContain("Debug:");
		expect(output).toContain("INTERNAL_ERROR");
		expect(output).toContain("[REDACTED]");
		expect(output).not.toContain("secret-token");
		expect(output).not.toContain("refresh-secret");
	});

	it("does not emit OAuth or PKCE values from structured causes", () => {
		let output = "";
		const error = new CliError("INTERNAL_ERROR", "Unexpected failure", {
			cause: {
				authorizationCode: "authorization-secret",
				client_secret: "client-secret",
				idToken: "id-secret",
				pkceVerifier: "pkce-secret",
				refreshToken: "refresh-secret",
			},
		});

		writeDebugError(error, {
			write: (value) => {
				output += value;
			},
		});

		expect(output).not.toContain("authorization-secret");
		expect(output).not.toContain("client-secret");
		expect(output).not.toContain("id-secret");
		expect(output).not.toContain("pkce-secret");
		expect(output).not.toContain("refresh-secret");
	});
});
