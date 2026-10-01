import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createOAuthNonce, createPkcePair } from "./pkce.js";

const PKCE_VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

describe("PKCE", () => {
	it("creates an RFC 7636 S256 verifier and challenge", () => {
		const pair = createPkcePair();
		expect(pair.verifier).toMatch(PKCE_VALUE_PATTERN);
		expect(pair.challenge).toBe(
			createHash("sha256").update(pair.verifier).digest("base64url")
		);
	});

	it("creates independent OAuth nonces", () => {
		const first = createOAuthNonce();
		const second = createOAuthNonce();
		expect(first).toHaveLength(43);
		expect(second).not.toBe(first);
	});
});
