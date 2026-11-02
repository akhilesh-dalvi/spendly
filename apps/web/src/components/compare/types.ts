import type { Id } from "@spendly/backend/convex/_generated/dataModel";

interface CompareCategoryRow {
	categoryName: string;
	planned: number | null;
	spent: number;
}

export interface CompareCycleRow {
	categoryBreakdown: CompareCategoryRow[];
	cycleId: Id<"expense_cycles">;
	cycleName: string;
	endDate: string;
	startDate: string;
	totalPlanned: number;
	totalSpent: number;
}

export interface CompareDerivedTotals {
	cycleCount: number;
	netRemaining: number;
	totalPlanned: number;
	totalSpent: number;
}
