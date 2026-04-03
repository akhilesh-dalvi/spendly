import type { CompareDerivedTotals } from "@/components/compare/types";
import { cn } from "@/lib/utils";

interface CompareKpiStripProps {
	totals: CompareDerivedTotals;
	formatCurrency: (amount: number) => string;
}

export function CompareKpiStrip({
	totals,
	formatCurrency,
}: CompareKpiStripProps) {
	const hasPlanned = totals.totalPlanned > 0;
	const netNegative = totals.netRemaining < 0;

	return (
		<div className="grid divide-y divide-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Cycles Compared
					</p>

					<h3 className="mt-2 font-medium text-3xl tracking-tight">
						{totals.cycleCount}
					</h3>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<div className="h-1.5 w-1.5 rounded-full bg-primary" />
					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						Active side-by-side selection
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Total Spent
					</p>

					<h3 className="mt-2 font-medium text-3xl tracking-tight">
						{formatCurrency(totals.totalSpent)}
					</h3>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<div className="h-1.5 w-1.5 rounded-full bg-primary" />
					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						Across selected cycles
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Total Planned
					</p>

					<h3 className="mt-2 font-medium text-3xl tracking-tight">
						{hasPlanned ? formatCurrency(totals.totalPlanned) : "—"}
					</h3>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<div className="h-1.5 w-1.5 rounded-full bg-primary" />
					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						Sum of planned category amounts
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Net Remaining
					</p>

					<h3
						className={cn(
							"mt-2 font-medium text-3xl tracking-tight",
							netNegative && "text-destructive"
						)}
					>
						{hasPlanned ? formatCurrency(totals.netRemaining) : "—"}
					</h3>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<div
						className={cn(
							"h-1.5 w-1.5 rounded-full",
							netNegative ? "bg-destructive" : "bg-emerald-500"
						)}
					/>
					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						{hasPlanned
							? "Planned minus spent"
							: "No planned values to compare"}
					</p>
				</div>
			</div>
		</div>
	);
}
