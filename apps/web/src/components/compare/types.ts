import type { Id } from "@spendly/backend/convex/_generated/dataModel";

export interface CompareCategoryRow {
	categoryName: string;
	spent: number;
	planned: number | null;
}

export interface CompareCycleRow {
	cycleId: Id<"expense_cycles">;
	cycleName: string;
	startDate: string;
	endDate: string;
	totalSpent: number;
	totalPlanned: number;
	categoryBreakdown: CompareCategoryRow[];
}

export interface CompareDerivedTotals {
	cycleCount: number;
	totalSpent: number;
	totalPlanned: number;
	netRemaining: number;
}
