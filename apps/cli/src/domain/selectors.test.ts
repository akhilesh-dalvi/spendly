import { describe, expect, it } from "vitest";
import { resolveExactName } from "./selectors.js";

const resources = [
	{ id: "one", name: "Daily Wallet" },
	{ id: "two", name: "Savings" },
];

describe("exact resource selectors", () => {
	it("trims and compares names case-insensitively", () => {
		expect(
			resolveExactName({
				kind: "Account",
				name: " daily WALLET ",
				nonInteractive: false,
				resources,
			})
		).toEqual(resources[0]);
	});

	it("returns every exact ambiguity candidate", () => {
		expect(() =>
			resolveExactName({
				kind: "Account",
				name: "daily wallet",
				nonInteractive: false,
				resources: [...resources, { id: "three", name: "DAILY WALLET" }],
			})
		).toThrowError(
			expect.objectContaining({
				code: "INVALID_INPUT",
				details: {
					candidates: [
						{ id: "one", name: "Daily Wallet" },
						{ id: "three", name: "DAILY WALLET" },
					],
				},
			})
		);
	});

	it("never resolves names for non-interactive callers", () => {
		expect(() =>
			resolveExactName({
				kind: "Account",
				name: "Daily Wallet",
				nonInteractive: true,
				resources,
			})
		).toThrowError(
			expect.objectContaining({ code: "NON_INTERACTIVE_INPUT_REQUIRED" })
		);
	});
});
