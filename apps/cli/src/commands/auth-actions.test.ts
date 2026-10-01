import { describe, expect, it } from "vitest";
import type { ConvexIdentityProof } from "../convex-proof.js";
import { resolveIdentityProof } from "./auth-actions.js";

const createProof = (
	overrides: Partial<ConvexIdentityProof> = {}
): ConvexIdentityProof => ({
	authenticated: true,
	backendUserId: "backend-user",
	currency: "INR",
	identitySubject: "clerk-user",
	subjectMatchesBackendUser: true,
	...overrides,
});

describe("authentication identity proof", () => {
	it("returns the verified backend identity", () => {
		expect(
			resolveIdentityProof(
				createProof(),
				"clerk-user",
				"https://spendly.example"
			)
		).toEqual({
			backendUserId: "backend-user",
			currency: "INR",
			identitySubject: "clerk-user",
			subjectMatchesBackendUser: true,
		});
	});

	it("requires account setup when Clerk has no Spendly user", () => {
		expect(() =>
			resolveIdentityProof(
				createProof({ backendUserId: null }),
				"clerk-user",
				"https://spendly.example"
			)
		).toThrowError(
			expect.objectContaining({
				code: "ACCOUNT_SETUP_REQUIRED",
				details: { webUrl: "https://spendly.example" },
			})
		);
	});

	it("rejects a subject mismatch", () => {
		expect(() =>
			resolveIdentityProof(
				createProof({ identitySubject: "another-user" }),
				"clerk-user",
				"https://spendly.example"
			)
		).toThrowError(
			expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" })
		);
	});
});
