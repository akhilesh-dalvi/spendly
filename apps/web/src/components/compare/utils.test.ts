import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { describe, expect, it } from "vitest";
import {
	buildCompareHref,
	deriveCompareTotals,
	parseCycleIds,
	sanitizeCycleIds,
} from "./utils";

describe("cycle comparison selection", () => {
	it.each([
		null,
		"",
		" , , ",
	])("treats empty selection %s as no cycles", (selection) => {
		expect(parseCycleIds(selection)).toEqual([]);
	});

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
			sanitizedIds: validIds.slice(0, 5),
			invalidCount: 1,
			duplicateCount: 2,
			trimmedCount: 1,
		});
	});

	it("handles an empty selection without counts or retained IDs", () => {
		expect(sanitizeCycleIds([], new Set())).toEqual({
			sanitizedIds: [],
			invalidCount: 0,
			duplicateCount: 0,
			trimmedCount: 0,
		});
	});
});

describe("cycle comparison totals", () => {
	it("returns zero totals for no cycles", () => {
		expect(deriveCompareTotals([])).toEqual({
			cycleCount: 0,
			totalSpent: 0,
			totalPlanned: 0,
			netRemaining: 0,
		});
	});

	it("combines cycle budgets and preserves negative remaining amounts", () => {
		const row = {
			cycleName: "Monthly",
			startDate: "2026-01-01",
			endDate: "2026-01-31",
			categoryBreakdown: [],
		};
		expect(
			deriveCompareTotals([
				{
					...row,
					cycleId: "one" as Id<"expense_cycles">,
					totalSpent: 125,
					totalPlanned: 100,
				},
				{
					...row,
					cycleId: "two" as Id<"expense_cycles">,
					totalSpent: 50,
					totalPlanned: 60,
				},
			])
		).toEqual({
			cycleCount: 2,
			totalSpent: 175,
			totalPlanned: 160,
			netRemaining: -15,
		});
	});
});
