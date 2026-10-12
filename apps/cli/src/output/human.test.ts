import { describe, expect, it } from "vitest";
import {
	formatInclusiveDateRange,
	formatMoney,
	renderHumanLines,
	renderHumanTable,
} from "./human.js";

describe("human terminal formatting", () => {
	it.each([
		undefined,
		0,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("uses safe default terminal width for %s", (columns) => {
		expect(renderHumanLines(["Short message", ""], { columns })).toBe(
			"Short message\n"
		);
	});

	it("wraps words and splits long Unicode tokens at the minimum width", () => {
		const output = renderHumanLines(
			["one two three four five six", "😀".repeat(21)],
			{ columns: 1 }
		);
		expect(output).toBe(`one two three four\nfive six\n${"😀".repeat(20)}\n😀`);
	});

	it("ignores ANSI colors when measuring table cells", () => {
		const output = renderHumanTable(
			["NAME", "VALUE"],
			[["\u001b[31mRed\u001b[0m", "1"]],
			{ columns: 20, emptyMessage: "Empty" }
		);
		expect(output).toBe("NAME  VALUE\n----  -----\n\u001b[31mRed\u001b[0m   1");
		expect(renderHumanLines(["\u001b[31"], { columns: 20 })).toBe("\u001b[31");
	});

	it("renders missing stacked fields and extra table cells safely", () => {
		const stacked = renderHumanTable(
			["DESCRIPTION", "NOTE"],
			[["a description too wide for this terminal"]],
			{ columns: 20, emptyMessage: "Empty" }
		);
		expect(stacked).toContain("NOTE       : -");
		expect(
			renderHumanTable(["A"], [["x", "extra"]], {
				columns: 80,
				emptyMessage: "Empty",
			})
		).toContain("x  extra");
	});

	it.each([
		{ start: "2026-09-28", end: "2026-10-03", expected: "Sep 28-Oct 2, 2026" },
		{
			start: "2025-12-30",
			end: "2026-01-03",
			expected: "Dec 30, 2025-Jan 2, 2026",
		},
	])("formats exclusive ranges across month and year boundaries", ({
		start,
		end,
		expected,
	}) => {
		expect(formatInclusiveDateRange(start, end)).toBe(expected);
	});
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
