"use client";

import { differenceInDays, parseISO } from "date-fns";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

// Type derived from the return value of api.aggregations.getCycleSummary
interface DashboardSummaryProps {
	summary: {
		cycleName: string;
		totalSpent: number;
		totalPlanned: number;
		startDate: string;
		endDate: string;
		daysRemaining: number | null;
	};
}

function getCycleTimingDetails({
	daysRemaining,
	isFuture,
	isPast,
	start,
	today,
}: {
	daysRemaining: number | null;
	isFuture: boolean;
	isPast: boolean;
	start: Date;
	today: Date;
}) {
	let cycleLabel = "Past Cycle";
	let daysLabel = "Days Left";
	let daysValue: number | string = daysRemaining ?? 0;

	if (isFuture) {
		cycleLabel = "Upcoming";
		daysLabel = "Starts In";
		daysValue = differenceInDays(start, today);
	} else if (isPast) {
		daysLabel = "Cycle Status";
		daysValue = "Ended";
	} else {
		cycleLabel = "Active Cycle";
	}

	return { cycleLabel, daysLabel, daysValue };
}

export function DashboardSummary({ summary }: DashboardSummaryProps) {
	const { format } = useCurrency();
	const totalSpent = summary.totalSpent || 0;
	const totalPlanned = summary.totalPlanned || 0;
	const remaining = totalPlanned - totalSpent;

	const today = new Date();
	const start = parseISO(summary.startDate);
	const end = parseISO(summary.endDate);

	const isFuture = today < start;
	const isPast = today > end;
	const isCurrent = !(isFuture || isPast);

	const totalDays = differenceInDays(end, start);
	const daysPassed = differenceInDays(today, start);

	let cycleProgress = 0;
	if (isPast) {
		cycleProgress = 100;
	} else if (isCurrent) {
		cycleProgress = Math.min(100, Math.max(0, (daysPassed / totalDays) * 100));
	}

	const budgetProgress =
		totalPlanned > 0 ? Math.min(100, (totalSpent / totalPlanned) * 100) : 0;

	const { cycleLabel, daysLabel, daysValue } = getCycleTimingDetails({
		daysRemaining: summary.daysRemaining,
		isFuture,
		isPast,
		start,
		today,
	});

	return (
		<div className="grid divide-y divide-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Total Spent
					</p>

					<div className="mt-2 flex items-baseline gap-2">
						<h3 className="font-medium text-3xl tracking-tight">
							{format(totalSpent)}
						</h3>
						{totalPlanned > 0 && (
							<span className="font-medium text-muted-foreground/60 text-sm">
								({Math.round((totalSpent / totalPlanned) * 100)}%)
							</span>
						)}
					</div>
				</div>

				<div className="mt-4 flex flex-col gap-2">
					<div className="flex items-center gap-1.5">
						<div
							className={cn(
								"h-1.5 w-1.5 rounded-full",
								isCurrent ? "bg-primary" : "bg-muted-foreground/40"
							)}
						/>
						<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
							{cycleLabel}
						</p>
					</div>
					{totalPlanned > 0 && (
						<div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
							<div
								className="h-full bg-primary transition-all"
								style={{ width: `${budgetProgress}%` }}
							/>
						</div>
					)}
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						{remaining < 0 ? "Over Budget" : "Remaining"}
					</p>

					<div className="mt-2 flex items-baseline gap-2">
						<h3
							className={cn(
								"font-medium text-3xl tracking-tight",
								remaining < 0 && "text-destructive"
							)}
						>
							{format(Math.abs(remaining))}
						</h3>
						{totalPlanned > 0 && (
							<span
								className={cn(
									"font-medium text-sm",
									remaining < 0
										? "text-destructive/60"
										: "text-muted-foreground/60"
								)}
							>
								({Math.round((Math.abs(remaining) / totalPlanned) * 100)}%)
							</span>
						)}
					</div>
				</div>

				<div className="mt-4 flex items-center gap-1.5">
					<div
						className={cn(
							"h-1.5 w-1.5 rounded-full",
							remaining >= 0 ? "bg-emerald-500" : "bg-destructive"
						)}
					/>

					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						{remaining < 0 ? "Over Budget" : "Budget Left"}
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Planned
					</p>

					<h3 className="mt-2 font-medium text-3xl tracking-tight">
						{totalPlanned > 0 ? format(totalPlanned) : "—"}
					</h3>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						{daysLabel}
					</p>

					<h3 className="mt-2 font-medium text-3xl tracking-tight">
						{daysValue}
						{typeof daysValue === "number" && (
							<span className="ml-1 font-normal text-muted-foreground text-sm">
								days
							</span>
						)}
					</h3>
				</div>

				<div className="mt-4 flex flex-col gap-2">
					<div className="flex items-center gap-1.5">
						<div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
						<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
							Cycle Progress
						</p>
					</div>
					<div className="h-1 w-full overflow-hidden rounded-full bg-indigo-500/10">
						<div
							className="h-full bg-indigo-500 transition-all"
							style={{ width: `${cycleProgress}%` }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
