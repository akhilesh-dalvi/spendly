import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { describe, expect, it } from "vitest";
import {
	buildCompareHref,
	deriveCompareTotals,
	parseCycleIds,
	sanitizeCycleIds,
} from "./utils";

describe("cycle comparison selection", () => {
	it.each([null, "", " , , "])(
		"treats empty selection %s as no cycles",
		(selection) => {
			expect(parseCycleIds(selection)).toEqual([]);
		}
	);

	it("trims IDs and removes empty entries before building a comparison link", () => {
		const ids = parseCycleIds(" first, , second ,");
		expect(ids).toEqual(["first", "second"]);
		expect(buildCompareHref(ids)).toBe("/compare?cycles=first,second");
		expect(buildCompareHref([])).toBe("/compare");
	});

	it("deduplicates, rejects inaccessible cycles, and limits selection in order", () => {
		const validIds = ["one", "two", "three", "four", "five", "six"];
		expect(
			sanitizeCycleIds(
				[
					"foreign",
					"one",
					"one",
					"two",
					"foreign",
					"three",
					"four",
					"five",
					"six",
				],
				new Set(validIds)
			)
		).toEqual({
			duplicateCount: 2,
			invalidCount: 1,
			sanitizedIds: validIds.slice(0, 5),
			trimmedCount: 1,
		});
	});

	it("handles an empty selection without counts or retained IDs", () => {
		expect(sanitizeCycleIds([], new Set())).toEqual({
			duplicateCount: 0,
			invalidCount: 0,
			sanitizedIds: [],
			trimmedCount: 0,
		});
	});
});

describe("cycle comparison totals", () => {
	it("returns zero totals for no cycles", () => {
		expect(deriveCompareTotals([])).toEqual({
			cycleCount: 0,
			netRemaining: 0,
			totalPlanned: 0,
			totalSpent: 0,
		});
	});

	it("combines cycle budgets and preserves negative remaining amounts", () => {
		const row = {
			categoryBreakdown: [],
			cycleName: "Monthly",
			endDate: "2026-01-31",
			startDate: "2026-01-01",
		};
		expect(
			deriveCompareTotals([
				{
					...row,
					cycleId: "one" as Id<"expense_cycles">,
					totalPlanned: 100,
					totalSpent: 125,
				},
				{
					...row,
					cycleId: "two" as Id<"expense_cycles">,
					totalPlanned: 60,
					totalSpent: 50,
				},
			])
		).toEqual({
			cycleCount: 2,
			netRemaining: -15,
			totalPlanned: 160,
			totalSpent: 175,
		});
	});
});
