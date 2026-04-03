"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc } from "@spendly/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import { Calendar, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

interface CycleCardProps {
	cycle: Doc<"expense_cycles">;
	variant?: "default" | "current";
	status?: "current" | "upcoming" | "past";
	showProgress?: boolean;
	requireBudget?: boolean;
	compact?: boolean;
	className?: string;
}

export function CycleCard({
	cycle,
	variant = "default",
	status = "past",
	showProgress = true,
	requireBudget = false,
	compact = false,
	className,
}: CycleCardProps) {
	const { format: formatCurrency } = useCurrency();
	const summary = useQuery(api.aggregations.getCycleSummary, {
		cycleId: cycle._id,
	});

	const startDate = parseISO(cycle.startDate);
	const endDate = parseISO(cycle.endDate);
	let statusLabel = "History";
	if (status === "current") {
		statusLabel = "Active";
	} else if (status === "upcoming") {
		statusLabel = "Upcoming";
	}
	if (requireBudget && summary && summary.totalPlanned <= 0) {
		return null;
	}

	return (
		<Link href={`/cycles/${cycle._id}`}>
			<Card
				className={cn(
					"group relative overflow-hidden border-border/70 bg-card/50 transition-all focus-within:ring-2 focus-within:ring-ring/50 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg",
					variant === "current" && "border-primary/50 bg-primary/5 shadow-sm",
					compact ? "rounded-xl" : "rounded-2xl",
					className
				)}
			>
				<CardContent className={cn(compact ? "p-3.5" : "p-4")}>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-0.5">
							<div className="flex items-center gap-2">
								<h3
									className={cn(
										"tracking-tight transition-colors group-hover:text-primary",
										compact ? "font-semibold text-base" : "font-bold text-lg"
									)}
								>
									{cycle.name}
								</h3>
								<Badge
									className={cn(
										"font-semibold text-[10px] uppercase tracking-wider",
										status === "current" &&
											"border-primary/30 bg-primary/15 text-primary",
										status === "upcoming" &&
											"border-chart-2/30 bg-chart-2/15 text-chart-2",
										status === "past" &&
											"border-muted-foreground/30 bg-muted text-muted-foreground"
									)}
									variant="outline"
								>
									{variant === "current" ? "Active" : statusLabel}
								</Badge>
							</div>
							<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<Calendar className="h-3.5 w-3.5 opacity-70" />
								<span>
									{format(startDate, "MMM d")} –{" "}
									{format(endDate, "MMM d, yyyy")}
								</span>
							</div>
						</div>

						<div className="flex items-center gap-6 sm:gap-10">
							<div className="space-y-0.5">
								<p className="font-medium text-[10px] text-muted-foreground/60 uppercase tracking-wider">
									Spent
								</p>
								<p className="font-semibold text-base tabular-nums">
									{summary ? formatCurrency(summary.totalSpent) : "—"}
								</p>
							</div>
							<div className="space-y-0.5">
								<p className="font-medium text-[10px] text-muted-foreground/60 uppercase tracking-wider">
									Planned
								</p>
								<p className="font-semibold text-base tabular-nums">
									{summary ? formatCurrency(summary.totalPlanned) : "—"}
								</p>
							</div>
							<ChevronRight className="hidden h-5 w-5 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/50 sm:block" />
						</div>
					</div>

					{showProgress && summary && summary.totalPlanned > 0 && (
						<div className="mt-3">
							<div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
								<div
									className={cn(
										"h-full transition-all",
										summary.totalSpent > summary.totalPlanned
											? "bg-destructive"
											: "bg-primary"
									)}
									style={{
										width: `${Math.min(100, (summary.totalSpent / summary.totalPlanned) * 100)}%`,
									}}
								/>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</Link>
	);
}
