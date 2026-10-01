import { describe, expect, it } from "vitest";
import {
	formatInclusiveDateRange,
	formatMoney,
	renderHumanTable,
} from "./human.js";

describe("human terminal formatting", () => {
	it("formats grouped money and inclusive cycle ranges", () => {
		expect(formatMoney(1250, "INR")).toBe("INR 1,250.00");
		expect(formatMoney(-0, "INR")).toBe("INR 0.00");
		expect(formatInclusiveDateRange("2026-09-01", "2026-10-01")).toBe(
			"Sep 1-30, 2026"
		);
	});

	it("uses an aligned table when it fits", () => {
		const output = renderHumanTable(
			["NAME", "AMOUNT"],
			[
				["Coffee", "INR 20.00"],
				["Groceries", "INR 1,250.00"],
			],
			{ columns: 80, emptyMessage: "No expenses.", rightAlign: [1] }
		);

		expect(output).toContain("NAME             AMOUNT");
		expect(output).toContain("Coffee        INR 20.00");
	});

	it("uses wrapped stacked records without overflowing narrow terminals", () => {
		const output = renderHumanTable(
			["DESCRIPTION", "ID"],
			[["A long coffee description", "expense-with-a-very-long-stable-id"]],
			{ columns: 40, emptyMessage: "No expenses." }
		);

		expect(output).toContain("DESCRIPTION:");
		expect(output).toContain("ID");
		expect(
			Math.max(...output.split("\n").map((line) => line.length))
		).toBeLessThanOrEqual(40);
	});

	it("uses command-specific empty text", () => {
		expect(
			renderHumanTable(["NAME"], [], {
				columns: 80,
				emptyMessage: "No accounts yet.",
			})
		).toBe("No accounts yet.");
	});
});
