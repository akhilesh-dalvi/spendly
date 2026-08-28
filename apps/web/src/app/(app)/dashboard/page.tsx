"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import { Calendar, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { AccountOnboardingNudge } from "@/components/account-onboarding-nudge";
import { CategorySpendingChart } from "@/components/category-spending-chart";
import { CategoryTypeChart } from "@/components/category-type-chart";
import { CategoryTypeModal } from "@/components/category-type-modal";
import { CycleForm } from "@/components/cycle-form";
import { DashboardAccountsSummary } from "@/components/dashboard-accounts-summary";
import { DashboardSection } from "@/components/dashboard-section";
import { DashboardSummary } from "@/components/dashboard-summary";
import { Loader } from "@/components/loader";
import { OnboardingResumeCard } from "@/components/onboarding-resume-card";
import { RecentActivity } from "@/components/recent-activity";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";

type AccountsOnboardingStatus = "completed" | "pending" | "skipped" | undefined;

const shouldShowAccountOnboarding = (
	accountCount: number,
	status: AccountsOnboardingStatus
) => accountCount === 0 && status !== "skipped" && status !== "completed";

function DashboardOverview({
	accountSummary,
	showAccountOnboarding,
	summary,
}: {
	accountSummary: ComponentProps<typeof DashboardSummary>["accountSummary"];
	showAccountOnboarding: boolean;
	summary: ComponentProps<typeof DashboardSummary>["summary"] | undefined;
}) {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card/50 shadow-sm">
			{summary ? (
				<DashboardSummary accountSummary={accountSummary} summary={summary} />
			) : null}
			{showAccountOnboarding ? <AccountOnboardingNudge /> : null}
		</div>
	);
}

export default function DashboardPage() {
	const allCycles = useQuery(api.cycles.list);
	const currentCycleFromApi = useQuery(api.cycles.getCurrent, {});
	const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
	const [isNewCycleDialogOpen, setIsNewCycleDialogOpen] = useState(false);
	const [isNewTypeDialogOpen, setIsNewTypeDialogOpen] = useState(false);

	const activeCycle = useMemo(() => {
		if (selectedCycleId && allCycles) {
			return allCycles.find((c) => c._id === selectedCycleId) || null;
		}
		if (currentCycleFromApi) {
			return currentCycleFromApi;
		}
		return allCycles && allCycles.length > 0 ? allCycles[0] : null;
	}, [selectedCycleId, allCycles, currentCycleFromApi]);

	const summary = useQuery(
		api.aggregations.getCycleSummary,
		activeCycle?._id ? { cycleId: activeCycle._id } : "skip"
	);
	const accountSummary = useQuery(api.accounts.getSummary);
	const recentExpenses = useQuery(api.expenses.listRecent, { limit: 5 });

	const cycleIndex = useMemo(() => {
		if (!(activeCycle && allCycles)) {
			return -1;
		}
		return allCycles.findIndex((c) => c._id === activeCycle._id);
	}, [activeCycle, allCycles]);

	const previousCycle =
		allCycles && cycleIndex !== -1 ? allCycles[cycleIndex + 1] : undefined;
	const nextCycle =
		allCycles && cycleIndex !== -1 ? allCycles[cycleIndex - 1] : undefined;

	const groupedCycles = useMemo(() => {
		if (!allCycles) {
			return { current: null, upcoming: [], past: [] };
		}
		const today = format(new Date(), "yyyy-MM-dd");
		return {
			current:
				allCycles.find((c) => today >= c.startDate && today <= c.endDate) ||
				null,
			upcoming: allCycles.filter((c) => c.startDate > today),
			past: allCycles.filter((c) => c.endDate < today),
		};
	}, [allCycles]);

	if (
		allCycles === undefined ||
		currentCycleFromApi === undefined ||
		accountSummary === undefined ||
		recentExpenses === undefined ||
		(activeCycle !== null && summary === undefined)
	) {
		return <Loader />;
	}

	const showAccountOnboarding = shouldShowAccountOnboarding(
		accountSummary.accounts.length,
		accountSummary.accountsOnboardingStatus
	);

	if (!activeCycle) {
		return (
			<div className="flex flex-col gap-8 py-3">
				<DashboardAccountsSummary
					showAccountOnboarding={showAccountOnboarding}
					summary={accountSummary}
				/>
				<EmptyState
					action={
						<Dialog
							onOpenChange={setIsNewCycleDialogOpen}
							open={isNewCycleDialogOpen}
						>
							<DialogTrigger asChild>
								<Button>Create Cycle</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Create First Cycle</DialogTitle>
								</DialogHeader>
								<CycleForm
									onSuccess={(id) => {
										setSelectedCycleId(id);
										setIsNewCycleDialogOpen(false);
									}}
								/>
							</DialogContent>
						</Dialog>
					}
					description="Create a cycle for this period to start tracking your expenses."
					icon={<Calendar className="h-12 w-12" />}
					title="No active cycle"
				/>
			</div>
		);
	}

	return (
		<div className="space-y-8 py-3">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1">
						<Button
							disabled={!previousCycle}
							onClick={() =>
								previousCycle && setSelectedCycleId(previousCycle._id)
							}
							size="icon"
							variant="ghost"
						>
							<ChevronLeft className="h-5 w-5" />
						</Button>

						<Dialog
							onOpenChange={setIsNewCycleDialogOpen}
							open={isNewCycleDialogOpen}
						>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										className="px-2 font-bold text-3xl tracking-tight hover:bg-transparent"
										variant="ghost"
									>
										{activeCycle.name}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-[200px]">
									<div className="border-b p-1">
										<DialogTrigger asChild>
											<Button
												className="flex h-9 w-full items-center justify-start gap-2 rounded-sm px-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
												type="button"
												variant="ghost"
											>
												<Plus className="h-4 w-4" />
												<span>New Cycle</span>
											</Button>
										</DialogTrigger>
									</div>
									<div className="max-h-[400px] overflow-y-auto">
										{groupedCycles.current && (
											<>
												<DropdownMenuLabel className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
													Current
												</DropdownMenuLabel>
												<DropdownMenuItem
													className="flex items-center justify-between"
													key={groupedCycles.current._id}
													onClick={() => {
														if (groupedCycles.current) {
															setSelectedCycleId(groupedCycles.current._id);
														}
													}}
												>
													{groupedCycles.current.name}
													{groupedCycles.current._id === activeCycle?._id && (
														<Check className="h-4 w-4" />
													)}
												</DropdownMenuItem>
												{(groupedCycles.upcoming.length > 0 ||
													groupedCycles.past.length > 0) && (
													<DropdownMenuSeparator />
												)}
											</>
										)}

										{groupedCycles.upcoming.length > 0 && (
											<>
												<DropdownMenuLabel className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
													Upcoming
												</DropdownMenuLabel>
												{groupedCycles.upcoming.map((cycle) => (
													<DropdownMenuItem
														className="flex items-center justify-between"
														key={cycle._id}
														onClick={() => setSelectedCycleId(cycle._id)}
													>
														{cycle.name}
														{cycle._id === activeCycle?._id && (
															<Check className="h-4 w-4" />
														)}
													</DropdownMenuItem>
												))}
												{groupedCycles.past.length > 0 && (
													<DropdownMenuSeparator />
												)}
											</>
										)}

										{groupedCycles.past.length > 0 && (
											<>
												<DropdownMenuLabel className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
													History
												</DropdownMenuLabel>
												{groupedCycles.past.map((cycle) => (
													<DropdownMenuItem
														className="flex items-center justify-between"
														key={cycle._id}
														onClick={() => setSelectedCycleId(cycle._id)}
													>
														{cycle.name}
														{cycle._id === activeCycle?._id && (
															<Check className="h-4 w-4" />
														)}
													</DropdownMenuItem>
												))}
											</>
										)}
									</div>
								</DropdownMenuContent>
							</DropdownMenu>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Create Expense Cycle</DialogTitle>
								</DialogHeader>
								<CycleForm
									onSuccess={(id) => {
										setSelectedCycleId(id);
										setIsNewCycleDialogOpen(false);
									}}
								/>
							</DialogContent>
						</Dialog>

						<Button
							disabled={!nextCycle}
							onClick={() => nextCycle && setSelectedCycleId(nextCycle._id)}
							size="icon"
							variant="ghost"
						>
							<ChevronRight className="h-5 w-5" />
						</Button>
					</div>
					<div className="hidden h-8 w-px bg-border sm:block" />
					<p className="text-muted-foreground text-sm">
						{format(parseISO(activeCycle.startDate), "MMMM d")} –{" "}
						{format(parseISO(activeCycle.endDate), "MMMM d, yyyy")}
					</p>
				</div>
				<ButtonGroup>
					<Button asChild variant="outline">
						<Link href={`/categories/new?id=${activeCycle._id}`}>
							<Plus className="mr-2 h-4 w-4" />
							Add Category
						</Link>
					</Button>
					<Button asChild>
						<Link href="/expenses/new">
							<Plus className="mr-2 h-4 w-4" />
							Add Expense
						</Link>
					</Button>
				</ButtonGroup>
			</div>

			<OnboardingResumeCard />

			<DashboardOverview
				accountSummary={accountSummary}
				showAccountOnboarding={showAccountOnboarding}
				summary={summary}
			/>

			<div className="grid gap-8 lg:grid-cols-3">
				<DashboardSection
					action={
						<CategoryTypeModal
							existingTypeNames={
								summary?.typeStats.map((t) => t.typeName) || []
							}
							onOpenChange={setIsNewTypeDialogOpen}
							open={isNewTypeDialogOpen}
							trigger={
								<Button className="h-8 w-8" size="icon" variant="ghost">
									<Plus className="h-4 w-4" />
								</Button>
							}
						/>
					}
					title="Allocation"
				>
					<CategoryTypeChart typeStats={summary?.typeStats || []} />
				</DashboardSection>

				<CategorySpendingChart
					cycleId={activeCycle._id}
					typeStats={summary?.typeStats || []}
				/>

				<DashboardSection
					action={
						<Button asChild size="icon" variant="ghost">
							<Link href="/expenses/new">
								<Plus className="h-4 w-4" />
							</Link>
						</Button>
					}
					title="Activity"
				>
					<RecentActivity expenses={recentExpenses} />
				</DashboardSection>
			</div>
		</div>
	);
}
