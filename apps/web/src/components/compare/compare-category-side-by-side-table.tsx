import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import type { CompareCycleRow } from "@/components/compare/types";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface CategoryCell {
	spent: number;
	planned: number | null;
}

interface CompareCategorySideBySideTableProps {
	rows: CompareCycleRow[];
	formatCurrency: (amount: number) => string;
}

interface CompareCategoryCellProps {
	cell?: CategoryCell;
	cycleId: string;
	formatCurrency: (amount: number) => string;
}

function CompareCategoryCell({
	cell,
	cycleId,
	formatCurrency,
}: CompareCategoryCellProps) {
	if (!cell) {
		return <TableCell className="text-muted-foreground">—</TableCell>;
	}

	const hasPlan = typeof cell.planned === "number" && cell.planned > 0;
	const plannedAmount = hasPlan ? cell.planned : null;
	const difference = plannedAmount === null ? null : plannedAmount - cell.spent;
	const progressPercentage =
		plannedAmount === null
			? 0
			: Math.min(100, (cell.spent / plannedAmount) * 100);
	const planUsageLabel =
		plannedAmount === null
			? "No plan"
			: `${Math.round((cell.spent / plannedAmount) * 100)}% of plan`;

	return (
		<TableCell className="whitespace-normal" key={cycleId}>
			<div className="space-y-2 text-sm">
				<div className="grid grid-cols-3 gap-2">
					<div>
						<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
							Spent
						</p>
						<p className="tabular-nums">{formatCurrency(cell.spent)}</p>
					</div>
					<div>
						<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
							Planned
						</p>
						<p className="text-muted-foreground tabular-nums">
							{plannedAmount === null ? "-" : formatCurrency(plannedAmount)}
						</p>
					</div>
					<div>
						<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
							Diff
						</p>
						<p
							className={cn(
								"text-muted-foreground tabular-nums",
								typeof difference === "number" &&
									difference < 0 &&
									"text-destructive"
							)}
						>
							{typeof difference === "number"
								? formatCurrency(difference)
								: "-"}
						</p>
					</div>
				</div>
				{plannedAmount !== null && (
					<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
						<div
							className={cn(
								"h-full transition-all",
								difference !== null && difference < 0
									? "bg-destructive"
									: "bg-primary"
							)}
							style={{
								width: `${progressPercentage}%`,
							}}
						/>
					</div>
				)}
				<p
					className={cn(
						"font-medium text-[10px] text-muted-foreground uppercase tracking-widest",
						typeof difference === "number" &&
							difference < 0 &&
							"text-destructive"
					)}
				>
					{planUsageLabel}
				</p>
			</div>
		</TableCell>
	);
}

export function CompareCategorySideBySideTable({
	rows,
	formatCurrency,
}: CompareCategorySideBySideTableProps) {
	const { categoryNames, cycleCategoryStats } = useMemo(() => {
		const names = new Set<string>();
		const perCycle = new Map<string, Map<string, CategoryCell>>();

		for (const cycle of rows) {
			const currentCycleStats = new Map<string, CategoryCell>();
			for (const category of cycle.categoryBreakdown) {
				names.add(category.categoryName);
				const existing = currentCycleStats.get(category.categoryName);
				const nextSpent = (existing?.spent ?? 0) + category.spent;
				const existingPlanned = existing?.planned;
				const nextPlanned =
					typeof category.planned === "number" && category.planned > 0
						? (existingPlanned ?? 0) + category.planned
						: (existingPlanned ?? null);

				currentCycleStats.set(category.categoryName, {
					spent: nextSpent,
					planned: nextPlanned,
				});
			}
			perCycle.set(cycle.cycleId, currentCycleStats);
		}

		return {
			categoryNames: Array.from(names).sort((a, b) => a.localeCompare(b)),
			cycleCategoryStats: perCycle,
		};
	}, [rows]);

	if (categoryNames.length === 0) {
		return (
			<div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
				<div className="p-4 text-muted-foreground text-sm">
					No category breakdown for the selected cycles.
				</div>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="sticky left-0 z-20 min-w-[180px] bg-card">
								Category
							</TableHead>
							{rows.map((cycle) => (
								<TableHead className="min-w-[240px]" key={cycle.cycleId}>
									<div className="space-y-1">
										<p className="font-semibold text-foreground text-sm">
											{cycle.cycleName}
										</p>
										<p className="text-muted-foreground text-xs">
											{format(parseISO(cycle.startDate), "MMM d")} -{" "}
											{format(parseISO(cycle.endDate), "MMM d, yyyy")}
										</p>
										<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
											Spent Planned Diff
										</p>
									</div>
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{categoryNames.map((categoryName) => (
							<TableRow className="odd:bg-card/20" key={categoryName}>
								<TableCell className="sticky left-0 z-10 bg-card font-medium">
									{categoryName}
								</TableCell>
								{rows.map((cycle) => (
									<CompareCategoryCell
										cell={cycleCategoryStats
											.get(cycle.cycleId)
											?.get(categoryName)}
										cycleId={cycle.cycleId}
										formatCurrency={formatCurrency}
										key={cycle.cycleId}
									/>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
