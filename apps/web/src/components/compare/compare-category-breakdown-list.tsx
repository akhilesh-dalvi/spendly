import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { CompareCycleRow } from "@/components/compare/types";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface CategoryCell {
	spent: number;
	planned: number | null;
}

interface CompareCategoryBreakdownListProps {
	rows: CompareCycleRow[];
	formatCurrency: (amount: number) => string;
}

export function CompareCategoryBreakdownList({
	rows,
	formatCurrency,
}: CompareCategoryBreakdownListProps) {
	const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

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
			<div className="rounded-xl border border-border/70 bg-card/40 p-4 text-muted-foreground text-sm">
				No category breakdown for the selected cycles.
			</div>
		);
	}

	const renderCycleSummary = (categoryName: string, cycle: CompareCycleRow) => {
		const cell = cycleCategoryStats.get(cycle.cycleId)?.get(categoryName);
		if (!cell) {
			return <p className="text-muted-foreground text-xs">—</p>;
		}

		const hasPlan = typeof cell.planned === "number" && cell.planned > 0;
		const plannedAmount = cell.planned ?? 0;
		const progress = hasPlan
			? Math.min(100, (cell.spent / plannedAmount) * 100)
			: 0;

		return (
			<div className="space-y-1.5">
				<p className="font-medium text-sm tabular-nums">
					{formatCurrency(cell.spent)}
					<span className="text-muted-foreground">
						{" "}
						/ {hasPlan ? formatCurrency(plannedAmount) : "—"}
					</span>
				</p>
				<Progress className="h-1" value={progress} />
				<p className="text-[10px] text-muted-foreground">
					{Math.round(progress)}%
				</p>
			</div>
		);
	};

	return (
		<div className="overflow-x-auto">
			<div
				className="space-y-2"
				style={{ minWidth: `${220 + rows.length * 180}px` }}
			>
				<div
					className="grid gap-3 px-3 text-muted-foreground text-xs uppercase tracking-widest"
					style={{
						gridTemplateColumns: `minmax(160px,1.1fr) repeat(${rows.length}, minmax(180px,1fr))`,
					}}
				>
					<p>Category</p>
					{rows.map((row) => (
						<p key={row.cycleId}>{row.cycleName}</p>
					))}
				</div>

				{categoryNames.map((categoryName) => {
					const isExpanded = expandedCategory === categoryName;
					return (
						<div
							className="overflow-hidden rounded-xl border border-border/70 bg-card/40"
							key={categoryName}
						>
							<button
								className="grid w-full items-center gap-3 px-3 py-3 text-left"
								onClick={() =>
									setExpandedCategory(isExpanded ? null : categoryName)
								}
								style={{
									gridTemplateColumns: `minmax(160px,1.1fr) repeat(${rows.length}, minmax(180px,1fr))`,
								}}
								type="button"
							>
								<div className="flex items-center gap-2">
									{isExpanded ? (
										<ChevronDown className="h-4 w-4 text-muted-foreground" />
									) : (
										<ChevronRight className="h-4 w-4 text-muted-foreground" />
									)}
									<span className="font-medium text-sm">{categoryName}</span>
								</div>
								{rows.map((row) => (
									<div key={row.cycleId}>
										{renderCycleSummary(categoryName, row)}
									</div>
								))}
							</button>

							{isExpanded && (
								<div className="border-border/70 border-t px-3 py-3">
									<div
										className="grid gap-3"
										style={{
											gridTemplateColumns: `repeat(${rows.length}, minmax(180px,1fr))`,
										}}
									>
										{rows.map((row) => {
											const cell = cycleCategoryStats
												.get(row.cycleId)
												?.get(categoryName);
											if (!cell) {
												return (
													<div
														className="rounded-lg border border-border/70 bg-background/30 p-3"
														key={row.cycleId}
													>
														<p className="font-medium text-sm">
															{row.cycleName}
														</p>
														<p className="mt-2 text-muted-foreground text-xs">
															No data for this category
														</p>
													</div>
												);
											}

											const hasPlan =
												typeof cell.planned === "number" && cell.planned > 0;
											const plannedAmount = cell.planned ?? 0;
											const difference = hasPlan
												? plannedAmount - cell.spent
												: null;
											const progress = hasPlan
												? Math.min(100, (cell.spent / plannedAmount) * 100)
												: 0;

											return (
												<div
													className="rounded-lg border border-border/70 bg-background/30 p-3"
													key={row.cycleId}
												>
													<p className="font-medium text-sm">{row.cycleName}</p>
													<div className="mt-2 grid grid-cols-3 gap-2">
														<div>
															<p className="text-[10px] text-muted-foreground uppercase tracking-widest">
																Spent
															</p>
															<p className="font-medium text-sm tabular-nums">
																{formatCurrency(cell.spent)}
															</p>
														</div>
														<div>
															<p className="text-[10px] text-muted-foreground uppercase tracking-widest">
																Planned
															</p>
															<p className="font-medium text-sm tabular-nums">
																{hasPlan ? formatCurrency(plannedAmount) : "—"}
															</p>
														</div>
														<div>
															<p className="text-[10px] text-muted-foreground uppercase tracking-widest">
																Diff
															</p>
															<p
																className={cn(
																	"font-medium text-sm tabular-nums",
																	typeof difference === "number" &&
																		difference < 0 &&
																		"text-destructive"
																)}
															>
																{typeof difference === "number"
																	? formatCurrency(difference)
																	: "—"}
															</p>
														</div>
													</div>

													<div className="mt-3 space-y-1">
														<div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest">
															<span>Budget utilization</span>
															<span>{Math.round(progress)}%</span>
														</div>
														<Progress className="h-1" value={progress} />
													</div>
												</div>
											);
										})}
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
