import { format, parseISO } from "date-fns";
import { Calendar, Clock3, History, Layers3, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

interface ActiveCycleKpi {
	name: string;
	startDate: string;
	endDate: string;
	planned?: number;
	spent?: number;
}

interface CyclesKpiStripProps {
	totalCycles: number;
	upcomingCount: number;
	historyCount: number;
	activeCycle: ActiveCycleKpi | null;
	className?: string;
}

export function CyclesKpiStrip({
	totalCycles,
	upcomingCount,
	historyCount,
	activeCycle,
	className,
}: CyclesKpiStripProps) {
	const { format: formatCurrency } = useCurrency();

	const spent = activeCycle?.spent ?? 0;
	const planned = activeCycle?.planned ?? 0;
	const utilization = planned > 0 ? Math.round((spent / planned) * 100) : null;

	return (
		<div
			className={cn(
				"grid grid-cols-2 gap-3 lg:grid-cols-4",
				"fade-in-50 slide-in-from-top-2 animate-in duration-300",
				className
			)}
		>
			<Card className="overflow-hidden border-border/70 bg-card/60">
				<CardContent className="space-y-2 p-4">
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<Calendar className="h-3.5 w-3.5" />
						<span className="uppercase tracking-wider">Active Cycle</span>
					</div>
					{activeCycle ? (
						<>
							<p className="line-clamp-1 font-semibold text-sm">
								{activeCycle.name}
							</p>
							<p className="text-muted-foreground text-xs">
								{format(parseISO(activeCycle.startDate), "MMM d")} -{" "}
								{format(parseISO(activeCycle.endDate), "MMM d, yyyy")}
							</p>
						</>
					) : (
						<p className="font-medium text-sm">No active cycle</p>
					)}
				</CardContent>
			</Card>

			<Card className="border-border/70 bg-card/60">
				<CardContent className="space-y-2 p-4">
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<Layers3 className="h-3.5 w-3.5" />
						<span className="uppercase tracking-wider">Total Cycles</span>
					</div>
					<p className="font-semibold text-2xl tabular-nums">{totalCycles}</p>
				</CardContent>
			</Card>

			<Card className="border-border/70 bg-card/60">
				<CardContent className="space-y-2 p-4">
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<Clock3 className="h-3.5 w-3.5" />
						<span className="uppercase tracking-wider">Upcoming</span>
					</div>
					<p className="font-semibold text-2xl tabular-nums">{upcomingCount}</p>
				</CardContent>
			</Card>

			<Card className="border-border/70 bg-card/60">
				<CardContent className="space-y-2 p-4">
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<History className="h-3.5 w-3.5" />
						<span className="uppercase tracking-wider">History</span>
					</div>
					<div className="space-y-1">
						<p className="font-semibold text-2xl tabular-nums">
							{historyCount}
						</p>
						{activeCycle && planned > 0 ? (
							<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<TrendingUp className="h-3 w-3" />
								<span>
									{formatCurrency(spent)} / {formatCurrency(planned)}
									{utilization !== null ? ` (${utilization}%)` : ""}
								</span>
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								No active budget data
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
