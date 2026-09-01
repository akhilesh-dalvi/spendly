import { describe, expect, it } from "vitest";
import { redactText, redactValue } from "./redact.js";

describe("secret redaction", () => {
	it("redacts token-shaped text and bearer credentials", () => {
		const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature";
		expect(redactText(`Bearer secret-value ${jwt}`)).toBe(
			"Bearer [REDACTED] [REDACTED]"
		);
	});

	it("redacts sensitive URL and form parameters", () => {
		expect(
			redactText(
				"https://issuer.example/callback?code=secret&token=other&safe=value"
			)
		).toBe(
			"https://issuer.example/callback?code=[REDACTED]&token=[REDACTED]&safe=value"
		);
	});

	it("redacts sensitive fields recursively", () => {
		expect(
			redactValue({
				authorizationCode: "authorization-secret",
				client_secret: "client-secret",
				cookie: "session-cookie",
				nested: { refresh_token: "refresh" },
				pkceVerifier: "pkce-secret",
				"set-cookie": "response-cookie",
				token: "access",
				value: "safe",
			})
		).toEqual({
			authorizationCode: "[REDACTED]",
			client_secret: "[REDACTED]",
			cookie: "[REDACTED]",
			nested: { refresh_token: "[REDACTED]" },
			pkceVerifier: "[REDACTED]",
			"set-cookie": "[REDACTED]",
			token: "[REDACTED]",
			value: "safe",
		});
	});

	it("preserves non-secret domain codes", () => {
		expect(redactValue({ code: "ACCOUNT_SETUP_REQUIRED" })).toEqual({
			code: "ACCOUNT_SETUP_REQUIRED",
		});
	});
});
