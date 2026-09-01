import { describe, expect, it } from "vitest";
import { CliError } from "../errors.js";
import { createJsonErrorEnvelope, createJsonSuccessEnvelope } from "./json.js";

describe("JSON output envelopes", () => {
	it("creates a versioned success envelope", () => {
		expect(createJsonSuccessEnvelope({ authenticated: true })).toEqual({
			data: { authenticated: true },
			meta: {},
			schemaVersion: 1,
		});
	});

	it("creates a stable error envelope and redacts its details", () => {
		const error = new CliError("NETWORK_ERROR", "Bearer secret", {
			details: {
				client_secret: "client-secret",
				pkceVerifier: "pkce-secret",
				refresh_token: "refresh-secret",
			},
			retryable: true,
		});

		expect(createJsonErrorEnvelope(error)).toEqual({
			error: {
				code: "NETWORK_ERROR",
				details: {
					client_secret: "[REDACTED]",
					pkceVerifier: "[REDACTED]",
					refresh_token: "[REDACTED]",
				},
				message: "Bearer [REDACTED]",
				retryable: true,
			},
			schemaVersion: 1,
		});
	});
});
