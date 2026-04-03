"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { AlertTriangle, ArrowLeftRight, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import { CompareCategoryBreakdownList } from "@/components/compare/compare-category-breakdown-list";
import { CompareCycleOverviewCards } from "@/components/compare/compare-cycle-overview-cards";
import { CompareCycleSelector } from "@/components/compare/compare-cycle-selector";
import { CompareKpiStrip } from "@/components/compare/compare-kpi-strip";
import type { CompareCycleRow } from "@/components/compare/types";
import {
	buildCompareHref,
	compareLimits,
	deriveCompareTotals,
	parseCycleIds,
	sanitizeCycleIds,
} from "@/components/compare/utils";
import { DashboardSection } from "@/components/dashboard-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";

function ComparePageSkeleton() {
	return (
		<div className="space-y-6 py-3">
			<div className="space-y-2">
				<Skeleton className="h-9 w-56" />
				<Skeleton className="h-4 w-96" />
			</div>
			<Skeleton className="h-36 w-full rounded-2xl" />
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-28 w-full" />
			</div>
			<Skeleton className="h-64 w-full rounded-2xl" />
			<Skeleton className="h-52 w-full rounded-2xl" />
		</div>
	);
}

export default function ComparePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { format: formatCurrency } = useCurrency();

	const allCycles = useQuery(api.cycles.list);
	const rawIds = useMemo(
		() => parseCycleIds(searchParams.get("cycles")),
		[searchParams]
	);

	const sanitization = useMemo(() => {
		if (!allCycles) {
			return {
				sanitizedIds: [] as Id<"expense_cycles">[],
				invalidCount: 0,
				trimmedCount: 0,
				duplicateCount: 0,
			};
		}
		const validSet = new Set(allCycles.map((cycle) => cycle._id));
		return sanitizeCycleIds(rawIds, validSet);
	}, [allCycles, rawIds]);

	useEffect(() => {
		if (!allCycles) {
			return;
		}
		const current = rawIds.join(",");
		const next = sanitization.sanitizedIds.join(",");
		if (current === next) {
			return;
		}
		router.replace(buildCompareHref(sanitization.sanitizedIds) as never, {
			scroll: false,
		});
	}, [allCycles, rawIds, sanitization.sanitizedIds, router]);

	const selectedCycleIds = sanitization.sanitizedIds;
	const compareEnabled = selectedCycleIds.length >= compareLimits.minCycles;

	const compareData = useQuery(
		api.aggregations.compareMultiple,
		compareEnabled ? { cycleIds: selectedCycleIds } : "skip"
	);

	const cycleOptions = useMemo(() => {
		if (!allCycles) {
			return [];
		}
		return allCycles.map((cycle) => ({
			id: cycle._id,
			name: cycle.name,
			startDate: cycle.startDate,
			endDate: cycle.endDate,
		}));
	}, [allCycles]);

	const compareRows: CompareCycleRow[] = useMemo(() => {
		if (!compareData) {
			return [];
		}
		return compareData.map((row) => ({
			cycleId: row.cycleId,
			cycleName: row.cycleName,
			startDate: row.startDate,
			endDate: row.endDate,
			totalSpent: row.totalSpent,
			totalPlanned: row.totalPlanned,
			categoryBreakdown: row.categoryBreakdown,
		}));
	}, [compareData]);

	const totals = useMemo(() => deriveCompareTotals(compareRows), [compareRows]);

	const selectionMessage = useMemo(() => {
		const notes: string[] = [];
		if (sanitization.invalidCount > 0) {
			notes.push(
				`${sanitization.invalidCount} invalid selection${sanitization.invalidCount === 1 ? " was" : "s were"} removed`
			);
		}
		if (sanitization.duplicateCount > 0) {
			notes.push(
				`${sanitization.duplicateCount} duplicate entr${sanitization.duplicateCount === 1 ? "y was" : "ies were"} ignored`
			);
		}
		if (sanitization.trimmedCount > 0) {
			notes.push(
				`selection trimmed to the first ${compareLimits.maxCycles} cycles`
			);
		}
		return notes.join(". ");
	}, [sanitization]);

	const handleSelectionChange = (ids: string[]) => {
		if (!allCycles) {
			return;
		}
		const validSet = new Set(allCycles.map((cycle) => cycle._id));
		const nextSelection = sanitizeCycleIds(ids, validSet).sanitizedIds;
		router.push(buildCompareHref(nextSelection) as never, { scroll: false });
	};

	if (allCycles === undefined) {
		return <ComparePageSkeleton />;
	}

	if (allCycles.length === 0) {
		return (
			<div className="py-3">
				<EmptyState
					action={
						<Button asChild>
							<Link href="/cycles/new">Create Cycle</Link>
						</Button>
					}
					description="Create at least two cycles to start comparing trends over time."
					icon={<ArrowLeftRight className="h-10 w-10" />}
					title="No cycles to compare"
				/>
			</div>
		);
	}

	const showLoadingComparison = compareEnabled && compareData === undefined;
	const showSelectionEmptyState = !compareEnabled;
	const showQueryError = compareEnabled && compareData === null;
	let compareContent: ReactNode;

	if (showSelectionEmptyState) {
		compareContent = (
			<EmptyState
				description="Choose at least two cycles to view spending and category comparisons."
				title="Select cycles to compare"
			/>
		);
	} else if (showLoadingComparison) {
		compareContent = <ComparePageSkeleton />;
	} else if (showQueryError) {
		compareContent = (
			<div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-2">
						<AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
						<div>
							<p className="font-medium text-sm">
								Unable to load comparison data
							</p>
							<p className="text-muted-foreground text-xs">
								Try refreshing and selecting your cycles again.
							</p>
						</div>
					</div>
					<Button onClick={() => router.refresh()} size="sm" variant="outline">
						Retry
					</Button>
				</div>
			</div>
		);
	} else {
		compareContent = (
			<div className="space-y-8">
				<CompareKpiStrip formatCurrency={formatCurrency} totals={totals} />

				<DashboardSection
					action={
						<p className="text-muted-foreground text-xs">Overview per cycle</p>
					}
					headerClassName="items-baseline"
					title="Cycle Totals"
				>
					<CompareCycleOverviewCards
						formatCurrency={formatCurrency}
						rows={compareRows}
					/>
				</DashboardSection>

				<DashboardSection
					action={
						<p className="text-muted-foreground text-xs">
							Tap a category to expand
						</p>
					}
					headerClassName="items-baseline"
					title="Category Breakdown"
				>
					<CompareCategoryBreakdownList
						formatCurrency={formatCurrency}
						rows={compareRows}
					/>
				</DashboardSection>
			</div>
		);
	}

	return (
		<div className="space-y-8 py-3">
			<div className="flex items-center gap-4">
				<Button asChild size="icon" variant="ghost">
					<Link href="/dashboard">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<div className="space-y-1">
					<h1 className="font-bold text-3xl tracking-tight">Compare Cycles</h1>
					<p className="text-muted-foreground text-sm">
						Observe spending patterns side by side across cycles without
						changing any data.
					</p>
				</div>
			</div>

			<Card className="border-border/70 bg-card/60">
				<CardHeader>
					<CardTitle className="font-bold text-xl">Cycle Selection</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<CompareCycleSelector
						cycles={cycleOptions}
						max={compareLimits.maxCycles}
						onChange={handleSelectionChange}
						selectedIds={selectedCycleIds}
					/>
					<p className="text-muted-foreground text-xs">
						Select {compareLimits.minCycles}-{compareLimits.maxCycles} cycles to
						compare
					</p>
					{selectionMessage.length > 0 && (
						<p className="text-muted-foreground text-xs">{selectionMessage}.</p>
					)}
				</CardContent>
			</Card>

			{compareContent}
		</div>
	);
}
