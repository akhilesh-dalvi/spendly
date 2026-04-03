import { format, parseISO } from "date-fns";
import type { CompareCycleRow } from "@/components/compare/types";
import { Progress } from "@/components/ui/progress";

interface CompareCycleOverviewCardsProps {
	rows: CompareCycleRow[];
	formatCurrency: (amount: number) => string;
}

export function CompareCycleOverviewCards({
	rows,
	formatCurrency,
}: CompareCycleOverviewCardsProps) {
	return (
		<div className="space-y-3">
			{rows.map((row) => {
				const hasPlanned = row.totalPlanned > 0;
				const remaining = row.totalPlanned - row.totalSpent;
				const progress = hasPlanned
					? Math.min(100, (row.totalSpent / row.totalPlanned) * 100)
					: 0;

				return (
					<div
						className="rounded-xl border border-border/70 bg-card/40 p-4"
						key={row.cycleId}
					>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p className="font-semibold text-sm">{row.cycleName}</p>
								<p className="text-muted-foreground text-xs">
									{format(parseISO(row.startDate), "MMM d")} -{" "}
									{format(parseISO(row.endDate), "MMM d, yyyy")}
								</p>
							</div>
							<div className="text-right">
								<p className="text-muted-foreground text-xs">Remaining</p>
								<p className="font-semibold text-sm tabular-nums">
									{hasPlanned ? formatCurrency(remaining) : "—"}
								</p>
							</div>
						</div>

						<div className="mt-3 flex items-center justify-between gap-2 text-xs">
							<p className="text-muted-foreground tabular-nums">
								{formatCurrency(row.totalSpent)} of{" "}
								{hasPlanned ? formatCurrency(row.totalPlanned) : "—"}
							</p>
							<p className="text-muted-foreground tabular-nums">
								{hasPlanned ? `${Math.round(progress)}%` : "0%"} spent
							</p>
						</div>
						<Progress className="mt-2 h-1.5" value={progress} />
					</div>
				);
			})}
		</div>
	);
}
