import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import type {
	CompareCycleRow,
	CompareDerivedTotals,
} from "@/components/compare/types";

const MAX_COMPARE_CYCLES = 5;

interface SanitizeResult {
	sanitizedIds: Id<"expense_cycles">[];
	invalidCount: number;
	trimmedCount: number;
	duplicateCount: number;
}

export function sanitizeCycleIds(
	rawIds: string[],
	validCycleIds: Set<string>
): SanitizeResult {
	const seen = new Set<string>();
	const deduped: string[] = [];
	let duplicateCount = 0;

	for (const id of rawIds) {
		if (seen.has(id)) {
			duplicateCount += 1;
			continue;
		}
		seen.add(id);
		deduped.push(id);
	}

	const validOnly = deduped.filter((id) => validCycleIds.has(id));
	const invalidCount = deduped.length - validOnly.length;
	const trimmed = validOnly.slice(0, MAX_COMPARE_CYCLES);
	const trimmedCount = validOnly.length - trimmed.length;

	return {
		sanitizedIds: trimmed as Id<"expense_cycles">[],
		invalidCount,
		trimmedCount,
		duplicateCount,
	};
}

export function parseCycleIds(cyclesParam: string | null): string[] {
	if (!cyclesParam) {
		return [];
	}
	return cyclesParam
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}

export function buildCompareHref(selectedIds: string[]): string {
	if (selectedIds.length === 0) {
		return "/compare";
	}
	return `/compare?cycles=${selectedIds.join(",")}`;
}

export function deriveCompareTotals(
	rows: CompareCycleRow[]
): CompareDerivedTotals {
	const cycleCount = rows.length;
	const totalSpent = rows.reduce((sum, row) => sum + row.totalSpent, 0);
	const totalPlanned = rows.reduce((sum, row) => sum + row.totalPlanned, 0);

	return {
		cycleCount,
		totalSpent,
		totalPlanned,
		netRemaining: totalPlanned - totalSpent,
	};
}

export const compareLimits = {
	maxCycles: MAX_COMPARE_CYCLES,
	minCycles: 2,
} as const;
