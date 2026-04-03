"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc } from "@spendly/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { differenceInDays, format, parseISO } from "date-fns";
import {
	Calendar,
	ChevronLeft,
	Clock3,
	History,
	Layers3,
	ListFilter,
	Plus,
	RotateCcw,
	SearchX,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CycleCard } from "@/components/cycle-card";
import {
	type CycleFilter,
	type CycleSort,
	CyclesControls,
} from "@/components/cycles-controls";
import { DashboardSection } from "@/components/dashboard-section";
import { Loader } from "@/components/loader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCurrency } from "@/hooks/use-currency";

type CycleStatus = "current" | "upcoming" | "past";

interface CycleWithStatus {
	cycle: Doc<"expense_cycles">;
	status: CycleStatus;
}

interface GroupedCycles {
	current: Doc<"expense_cycles"> | null;
	upcoming: CycleWithStatus[];
	past: CycleWithStatus[];
	totalCount: number;
	upcomingCount: number;
	historyCount: number;
}

interface CyclesSummaryBarProps {
	currentCycle: Doc<"expense_cycles"> | null;
	totalCount: number;
	upcomingCount: number;
	historyCount: number;
	totalSpent: number;
	totalPlanned: number;
	daysLabel: string;
	daysValue: number | string;
	formatCurrency: (value: number) => string;
}

function CyclesSummaryBar({
	currentCycle,
	totalCount,
	upcomingCount,
	historyCount,
	totalSpent,
	totalPlanned,
	daysLabel,
	daysValue,
	formatCurrency,
}: CyclesSummaryBarProps) {
	const budgetProgress =
		totalPlanned > 0 ? Math.min(100, (totalSpent / totalPlanned) * 100) : 0;

	return (
		<div className="grid divide-y divide-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Active Cycle
					</p>
					{currentCycle ? (
						<>
							<h3 className="mt-2 font-medium text-3xl tracking-tight">
								{currentCycle.name}
							</h3>
							<p className="mt-1 text-muted-foreground text-sm">
								{format(parseISO(currentCycle.startDate), "MMMM d")} –{" "}
								{format(parseISO(currentCycle.endDate), "MMMM d, yyyy")}
							</p>
						</>
					) : (
						<p className="mt-2 text-muted-foreground text-sm">
							No active cycle in progress
						</p>
					)}
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<div className="h-1.5 w-1.5 rounded-full bg-primary" />
					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						{currentCycle ? "In Progress" : "Inactive"}
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Total Cycles
					</p>
					<div className="mt-2 flex items-baseline gap-2">
						<h3 className="font-medium text-3xl tracking-tight">
							{totalCount}
						</h3>
						<span className="font-medium text-muted-foreground/60 text-sm">
							cycles
						</span>
					</div>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<Layers3 className="h-3.5 w-3.5 text-muted-foreground/70" />
					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						Portfolio Size
					</p>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Upcoming
					</p>
					<h3 className="mt-2 font-medium text-3xl tracking-tight">
						{upcomingCount}
					</h3>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<Clock3 className="h-3.5 w-3.5 text-muted-foreground/70" />
					<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
						{daysLabel}
					</p>
					<span className="font-medium text-muted-foreground/70 text-xs">
						{daysValue}
					</span>
				</div>
			</div>

			<div className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						History
					</p>
					<h3 className="mt-2 font-medium text-3xl tracking-tight">
						{historyCount}
					</h3>
				</div>
				<div className="mt-4 flex flex-col gap-2">
					<div className="flex items-center gap-1.5">
						<History className="h-3.5 w-3.5 text-muted-foreground/70" />
						<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
							Active Budget Usage
						</p>
					</div>
					<p className="font-medium text-muted-foreground/80 text-xs">
						{formatCurrency(totalSpent)} / {formatCurrency(totalPlanned)}
					</p>
					<div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
						<div
							className="h-full bg-primary transition-all"
							style={{ width: `${budgetProgress}%` }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

interface CyclesSectionsProps {
	groupedCycles: GroupedCycles;
	selectedFilter: CycleFilter;
	budgetOnly: boolean;
	resetFilters: () => void;
}

function CyclesSections({
	groupedCycles,
	selectedFilter,
	budgetOnly,
	resetFilters,
}: CyclesSectionsProps) {
	const hasVisibleResults = Boolean(
		((selectedFilter === "all" || selectedFilter === "current") &&
			groupedCycles.current) ||
			groupedCycles.upcoming.length > 0 ||
			groupedCycles.past.length > 0
	);

	if (!hasVisibleResults) {
		return (
			<div className="fade-in-50 slide-in-from-bottom-1 animate-in rounded-xl border border-dashed bg-card/30 p-10 text-center duration-200">
				<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-background">
					<SearchX className="h-5 w-5 text-muted-foreground" />
				</div>
				<h3 className="font-semibold text-lg">No cycles match these filters</h3>
				<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
					Try resetting your filters to see all expense cycles again.
				</p>
				<Button className="mt-4" onClick={resetFilters} variant="outline">
					<RotateCcw className="mr-2 h-4 w-4" />
					Reset Filters
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{groupedCycles.current &&
				(selectedFilter === "all" || selectedFilter === "current") && (
					<DashboardSection
						action={
							<div className="flex items-center gap-1 text-muted-foreground text-xs">
								<ListFilter className="h-3.5 w-3.5" />
								<span className="uppercase tracking-wider">Active now</span>
							</div>
						}
						headerClassName="pb-3"
						title="Current Cycle"
					>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<CycleCard
								compact
								cycle={groupedCycles.current}
								requireBudget={budgetOnly}
								status="current"
								variant="current"
							/>
						</div>
					</DashboardSection>
				)}

			{groupedCycles.upcoming.length > 0 && (
				<DashboardSection headerClassName="pb-3" title="Upcoming">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{groupedCycles.upcoming.map(({ cycle, status }) => (
							<CycleCard
								compact
								cycle={cycle}
								key={cycle._id}
								requireBudget={budgetOnly}
								status={status}
							/>
						))}
					</div>
				</DashboardSection>
			)}

			{groupedCycles.past.length > 0 && (
				<DashboardSection headerClassName="pb-3" title="History">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{groupedCycles.past.map(({ cycle, status }) => (
							<CycleCard
								compact
								cycle={cycle}
								key={cycle._id}
								requireBudget={budgetOnly}
								status={status}
							/>
						))}
					</div>
				</DashboardSection>
			)}

			{selectedFilter === "upcoming" && groupedCycles.upcoming.length === 0 && (
				<DashboardSection headerClassName="pb-3" title="Upcoming">
					<div className="rounded-xl border border-dashed bg-card/20 p-8 text-center text-muted-foreground text-sm">
						No upcoming cycles.
					</div>
				</DashboardSection>
			)}

			{selectedFilter === "past" && groupedCycles.past.length === 0 && (
				<DashboardSection headerClassName="pb-3" title="History">
					<div className="rounded-xl border border-dashed bg-card/20 p-8 text-center text-muted-foreground text-sm">
						No historical cycles.
					</div>
				</DashboardSection>
			)}
		</div>
	);
}

function getSortedCycles(
	cycles: CycleWithStatus[],
	sort: CycleSort
): CycleWithStatus[] {
	const byDate = [...cycles];
	if (sort === "oldest") {
		return byDate.sort((a, b) =>
			a.cycle.startDate.localeCompare(b.cycle.startDate)
		);
	}
	if (sort === "newest") {
		return byDate.sort((a, b) =>
			b.cycle.startDate.localeCompare(a.cycle.startDate)
		);
	}

	// These sorts are approximated by date ordering until list-level aggregate data is available.
	return byDate.sort((a, b) =>
		b.cycle.startDate.localeCompare(a.cycle.startDate)
	);
}

export default function CyclesPage() {
	const allCycles = useQuery(api.cycles.list);
	const { format: formatCurrency } = useCurrency();
	const [selectedFilter, setSelectedFilter] = useState<CycleFilter>("all");
	const [selectedSort, setSelectedSort] = useState<CycleSort>("newest");
	const [budgetOnly, setBudgetOnly] = useState(false);

	const groupedCycles = useMemo(() => {
		if (!allCycles) {
			return {
				current: null,
				upcoming: [] as CycleWithStatus[],
				past: [] as CycleWithStatus[],
				totalCount: 0,
				upcomingCount: 0,
				historyCount: 0,
			};
		}

		const today = format(new Date(), "yyyy-MM-dd");
		const withStatus: CycleWithStatus[] = allCycles.map((cycle) => {
			if (today >= cycle.startDate && today <= cycle.endDate) {
				return { cycle, status: "current" };
			}
			if (cycle.startDate > today) {
				return { cycle, status: "upcoming" };
			}
			return { cycle, status: "past" };
		});

		const current =
			withStatus.find((item) => item.status === "current") ?? null;
		const filtered = withStatus.filter((item) => {
			if (selectedFilter === "all") {
				return true;
			}
			return item.status === selectedFilter;
		});

		const sorted = getSortedCycles(filtered, selectedSort);

		return {
			current: current?.cycle ?? null,
			upcoming: sorted.filter((item) => item.status === "upcoming"),
			past: sorted.filter((item) => item.status === "past"),
			totalCount: withStatus.length,
			upcomingCount: withStatus.filter((item) => item.status === "upcoming")
				.length,
			historyCount: withStatus.filter((item) => item.status === "past").length,
		};
	}, [allCycles, selectedFilter, selectedSort]);

	const activeCycleSummary = useQuery(
		api.aggregations.getCycleSummary,
		groupedCycles.current?._id ? { cycleId: groupedCycles.current._id } : "skip"
	);

	if (allCycles === undefined) {
		return <Loader />;
	}

	if (allCycles.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<EmptyState
					action={
						<Button asChild>
							<Link href="/cycles/new">
								<Plus className="mr-2 h-4 w-4" />
								Create First Cycle
							</Link>
						</Button>
					}
					description="Cycles help you organize your spending into time periods like months or pay periods."
					icon={<Calendar className="h-12 w-12" />}
					title="No cycles found"
				/>
			</div>
		);
	}

	const resetFilters = () => {
		setSelectedFilter("all");
		setSelectedSort("newest");
		setBudgetOnly(false);
	};
	const activeTotalSpent = activeCycleSummary?.totalSpent ?? 0;
	const activeTotalPlanned = activeCycleSummary?.totalPlanned ?? 0;
	let cycleDaysValue: number | string = "—";
	let cycleDaysLabel = "Cycle Status";
	if (groupedCycles.current) {
		const today = new Date();
		const start = parseISO(groupedCycles.current.startDate);
		const end = parseISO(groupedCycles.current.endDate);
		const isFuture = today < start;
		const isPast = today > end;
		if (isFuture) {
			cycleDaysLabel = "Starts In";
			cycleDaysValue = differenceInDays(start, today);
		} else if (isPast) {
			cycleDaysLabel = "Cycle Status";
			cycleDaysValue = "Ended";
		} else {
			cycleDaysLabel = "Days Left";
			cycleDaysValue = activeCycleSummary?.daysRemaining ?? 0;
		}
	}
	let summaryContent = (
		<CyclesSummaryBar
			currentCycle={groupedCycles.current}
			daysLabel={cycleDaysLabel}
			daysValue={cycleDaysValue}
			formatCurrency={formatCurrency}
			historyCount={groupedCycles.historyCount}
			totalCount={groupedCycles.totalCount}
			totalPlanned={activeTotalPlanned}
			totalSpent={activeTotalSpent}
			upcomingCount={groupedCycles.upcomingCount}
		/>
	);
	if (groupedCycles.current && activeCycleSummary === undefined) {
		summaryContent = (
			<div className="p-6 text-muted-foreground text-sm">
				Loading summary...
			</div>
		);
	}

	return (
		<div className="space-y-6 py-3">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-4">
					<Button asChild size="icon" variant="ghost">
						<Link href="/dashboard">
							<ChevronLeft className="h-5 w-5" />
						</Link>
					</Button>
					<div>
						<h1 className="font-bold text-3xl tracking-tight">
							Expense Cycles
						</h1>
						<p className="text-muted-foreground text-sm">
							Manage your spending periods and track historical performance.
						</p>
					</div>
				</div>
				<Button asChild>
					<Link href="/cycles/new">
						<Plus className="mr-2 h-4 w-4" />
						New Cycle
					</Link>
				</Button>
			</div>

			<div className="overflow-hidden rounded-2xl border bg-card/50 shadow-sm">
				{summaryContent}
			</div>

			<CyclesControls
				budgetOnly={budgetOnly}
				onBudgetOnlyChange={setBudgetOnly}
				onFilterChange={setSelectedFilter}
				onSortChange={setSelectedSort}
				selectedFilter={selectedFilter}
				selectedSort={selectedSort}
			/>
			<CyclesSections
				budgetOnly={budgetOnly}
				groupedCycles={groupedCycles}
				resetFilters={resetFilters}
				selectedFilter={selectedFilter}
			/>
		</div>
	);
}
