import { differenceInCalendarDays, parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import {
	exclusiveExpenseEndDate,
	expenseDatePresetRange,
	expenseDateRangeError,
	expenseDateRangeLabel,
	isExpenseFilterDate,
} from "./date-range";

describe("expense date presets", () => {
	it.each([
		["today", "2026-07-10", "2026-07-10"],
		["this-week", "2026-07-06", "2026-07-10"],
		["last-week", "2026-06-29", "2026-07-05"],
		["this-month", "2026-07-01", "2026-07-10"],
		["last-month", "2026-06-01", "2026-06-30"],
		["last-30-days", "2026-06-11", "2026-07-10"],
	] as const)(
		"resolves %s into inclusive local calendar dates",
		(preset, from, through) => {
			expect(expenseDatePresetRange(preset, new Date(2026, 6, 10, 12))).toEqual(
				{ from, through }
			);
		}
	);

	it.each([
		["this-week", "2026-07-12", "2026-07-06", "2026-07-12"],
		["this-week", "2026-07-13", "2026-07-13", "2026-07-13"],
		["last-week", "2026-07-13", "2026-07-06", "2026-07-12"],
		["this-week", "2027-01-01", "2026-12-28", "2027-01-01"],
		["last-week", "2027-01-04", "2026-12-28", "2027-01-03"],
		["last-month", "2027-01-01", "2026-12-01", "2026-12-31"],
		["last-month", "2024-03-31", "2024-02-01", "2024-02-29"],
		["last-month", "2025-03-01", "2025-02-01", "2025-02-28"],
		["this-month", "2024-02-29", "2024-02-01", "2024-02-29"],
	] as const)(
		"handles %s at the %s boundary",
		(preset, today, from, through) => {
			expect(expenseDatePresetRange(preset, parseISO(today))).toEqual({
				from,
				through,
			});
		}
	);

	it.each(["2026-03-15", "2026-11-15", "2024-03-01"])(
		"includes exactly 30 calendar dates around %s, including DST and leap day",
		(today) => {
			const range = expenseDatePresetRange("last-30-days", parseISO(today));
			expect(
				differenceInCalendarDays(parseISO(range.through), parseISO(range.from))
			).toBe(29);
			expect(range.through).toBe(today);
			expect(expenseDateRangeError(range)).toBeNull();
		}
	);

	it.each([0, 23])(
		"uses the browser-local date at hour %s rather than the UTC day",
		(hour) => {
			expect(
				expenseDatePresetRange("today", new Date(2026, 0, 1, hour, 30))
			).toEqual({ from: "2026-01-01", through: "2026-01-01" });
		}
	);
});

describe("expense calendar dates", () => {
	it.each(["2024-02-29", "2026-01-01", "0099-12-31"])(
		"accepts a strict calendar date: %s",
		(date) => {
			expect(isExpenseFilterDate(date)).toBe(true);
		}
	);
	it.each([
		"2026-02-29",
		"2026-04-31",
		"2026-13-01",
		"2026-00-01",
		"2026-01-00",
		"2026-1-01",
		"2026-01-01T00:00:00Z",
		"no date",
		"0000-01-01",
		"10000-01-01",
	])("rejects a malformed calendar date: %s", (date) => {
		expect(isExpenseFilterDate(date)).toBe(false);
	});
	it.each([
		["2024-02-28", "2024-02-29"],
		["2024-02-29", "2024-03-01"],
		["2026-12-31", "2027-01-01"],
		["2026-03-08", "2026-03-09"],
		["2026-11-01", "2026-11-02"],
		["0099-12-31", "0100-01-01"],
	])(
		"advances %s to %s without time-zone or duration arithmetic",
		(through, exclusive) => {
			expect(exclusiveExpenseEndDate(through)).toBe(exclusive);
		}
	);
	it("allows same-day, one-sided and empty ranges", () => {
		expect(
			expenseDateRangeError({ from: "2026-07-10", through: "2026-07-10" })
		).toBeNull();
		expect(
			expenseDateRangeError({ from: "2026-07-10", through: "" })
		).toBeNull();
		expect(
			expenseDateRangeError({ from: "", through: "2026-07-10" })
		).toBeNull();
		expect(expenseDateRangeError({ from: "", through: "" })).toBeNull();
	});
	it("explains invalid dates, reversed ranges and an unrepresentable exclusive boundary", () => {
		expect(expenseDateRangeError({ from: "bad", through: "" })).toBe(
			"Enter a valid From date as YYYY-MM-DD."
		);
		expect(expenseDateRangeError({ from: "", through: "2026-02-30" })).toBe(
			"Enter a valid Through date as YYYY-MM-DD."
		);
		expect(
			expenseDateRangeError({ from: "2026-07-11", through: "2026-07-10" })
		).toBe("Through must be on or after From.");
		expect(expenseDateRangeError({ from: "", through: "9999-12-31" })).toBe(
			"Through must be before 9999-12-31."
		);
	});
	it("labels all dates, both bounds, one-sided and invalid ranges", () => {
		expect(expenseDateRangeLabel({ from: "", through: "" })).toBe("All dates");
		expect(
			expenseDateRangeLabel({ from: "2026-07-10", through: "2026-07-10" })
		).toBe("Jul 10, 2026");
		expect(
			expenseDateRangeLabel({ from: "2026-07-10", through: "2026-07-11" })
		).toBe("Jul 10, 2026 – Jul 11, 2026");
		expect(expenseDateRangeLabel({ from: "2026-07-10", through: "" })).toBe(
			"From Jul 10, 2026"
		);
		expect(expenseDateRangeLabel({ from: "", through: "2026-07-10" })).toBe(
			"Through Jul 10, 2026"
		);
		expect(expenseDateRangeLabel({ from: "bad", through: "" })).toBe(
			"Invalid date range"
		);
	});
});
