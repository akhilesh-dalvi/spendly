"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
	ChevronLeft,
	ChevronRight,
	History,
	LayoutDashboard,
	ListTodo,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useMemo, useState } from "react";
import { toast } from "sonner";
import { CategoryForm } from "@/components/category-form";
import { CategorySpendingChart } from "@/components/category-spending-chart";
import { CategoryTypeChart } from "@/components/category-type-chart";
import { DashboardSection } from "@/components/dashboard-section";
import { Loader } from "@/components/loader";
import { RecentActivity } from "@/components/recent-activity";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

interface CycleStatsSummary {
	totalPlanned: number;
	totalSpent: number;
	remaining: number;
	isOver: boolean;
	budgetProgress: number;
}

interface CategoryHistoricalSpent {
	amount: number;
	cycleName: string;
}

interface CycleHeaderProps {
	cycleId: Id<"expense_cycles">;
	cycleName: string;
	endDate: string;
	nextCycleId?: string;
	onDeleteCycle: () => Promise<void>;
	onNavigate: (id: string) => void;
	previousCycleId?: string;
	startDate: string;
}

interface CycleCategoryRecord {
	_id: Id<"categories">;
	categoryTypeId?: Id<"category_types"> | null;
	icon?: string | null;
	name: string;
	plannedAmount?: number | null;
	typeColor?: string | null;
	typeName?: string | null;
}

interface CycleSummaryRecord {
	categoryStats: Array<{
		categoryId: Id<"categories"> | "uncategorized";
		spent: number;
	}>;
	typeStats: Array<{
		typeId: string | null;
		typeName: string;
		typeColor: string | null;
		totalPlanned: number;
		totalSpent: number;
		categories: Array<{
			categoryId: string;
			categoryTypeId?: string | null;
			name: string;
			icon: string | null;
			planned: number | null;
			spent: number;
			isHidden: boolean;
			typeColor?: string | null;
		}>;
	}>;
}

function buildCycleStats(summary: {
	totalPlanned?: number | null;
	totalSpent?: number | null;
}): CycleStatsSummary {
	const totalSpent = summary.totalSpent || 0;
	const totalPlanned = summary.totalPlanned || 0;

	return {
		totalSpent,
		totalPlanned,
		remaining: totalPlanned - totalSpent,
		isOver: totalSpent > totalPlanned && totalPlanned > 0,
		budgetProgress: totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0,
	};
}

function getCycleHistoricalSpentValue(
	historicalStats:
		| {
				cycleName: string;
				stats: Record<string, number>;
		  }
		| undefined
		| null,
	categoryName: string
) {
	if (!historicalStats) {
		return undefined;
	}

	const amount = historicalStats.stats[categoryName];
	return amount === undefined
		? undefined
		: {
				amount,
				cycleName: historicalStats.cycleName,
			};
}

async function deleteCycleAndNavigate({
	cycleId,
	removeCycle,
	router,
}: {
	cycleId: Id<"expense_cycles">;
	removeCycle: (args: { id: Id<"expense_cycles"> }) => Promise<unknown>;
	router: ReturnType<typeof useRouter>;
}) {
	try {
		await removeCycle({ id: cycleId });
		toast.success("Cycle deleted successfully");
		router.push("/cycles");
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to delete cycle";
		toast.error(message.replace("ConvexError: ", ""));
	}
}

async function deleteCycleCategory({
	id,
	removeCategory,
}: {
	id: Id<"categories">;
	removeCategory: (args: { categoryId: Id<"categories"> }) => Promise<unknown>;
}) {
	try {
		await removeCategory({ categoryId: id });
		toast.success("Category deleted");
	} catch (_error) {
		toast.error("Failed to delete category");
	}
}

function CycleNotFoundState() {
	return (
		<div className="flex h-full flex-col items-center justify-center space-y-4">
			<h1 className="font-bold text-2xl">Cycle not found</h1>
			<Button asChild>
				<Link href="/cycles">Back to Cycles</Link>
			</Button>
		</div>
	);
}

function CycleHeader({
	cycleId,
	cycleName,
	endDate,
	nextCycleId,
	onDeleteCycle,
	onNavigate,
	previousCycleId,
	startDate,
}: CycleHeaderProps) {
	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-4">
				<Button asChild size="icon" variant="ghost">
					<Link href="/cycles">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">{cycleName}</h1>
					<p className="text-muted-foreground text-sm">
						{format(parseISO(startDate), "MMMM d")} –{" "}
						{format(parseISO(endDate), "MMMM d, yyyy")}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<div className="mr-4 flex items-center gap-1">
					<Button
						className="h-8 w-8"
						disabled={!previousCycleId}
						onClick={() => previousCycleId && onNavigate(previousCycleId)}
						size="icon"
						variant="outline"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button
						className="h-8 w-8"
						disabled={!nextCycleId}
						onClick={() => nextCycleId && onNavigate(nextCycleId)}
						size="icon"
						variant="outline"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>

				<Button asChild size="sm" variant="outline">
					<Link href={`/cycles/${cycleId}/edit`}>
						<Pencil className="mr-2 h-4 w-4" />
						Edit
					</Link>
				</Button>

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
							size="sm"
							variant="outline"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
							<AlertDialogDescription>
								This will permanently delete the cycle "{cycleName}" and all its
								associated categories. You can only delete a cycle if it has no
								expenses assigned to it.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								onClick={onDeleteCycle}
							>
								Delete Cycle
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}

function CycleSummaryCards({
	formatCurrency,
	stats,
}: {
	formatCurrency: (amount: number) => string;
	stats: CycleStatsSummary;
}) {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card/50 shadow-sm">
			<div className="grid divide-y divide-border/40 md:grid-cols-3 md:divide-x md:divide-y-0">
				<div className="flex flex-col justify-between p-6 transition-colors hover:bg-card/10">
					<div>
						<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
							Spent
						</p>
						<div className="mt-2 flex flex-col gap-1">
							<div className="flex items-baseline gap-2">
								<h3 className="font-medium text-3xl tabular-nums tracking-tight">
									{formatCurrency(stats.totalSpent)}
								</h3>
								{stats.totalPlanned > 0 && (
									<span className="font-medium text-muted-foreground/60 text-sm">
										({Math.round((stats.totalSpent / stats.totalPlanned) * 100)}
										%)
									</span>
								)}
							</div>
						</div>
					</div>
					<div className="mt-4 flex flex-col gap-2">
						<div className="flex items-center gap-1.5">
							<div className="h-1.5 w-1.5 rounded-full bg-primary" />
							<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
								Usage
							</p>
						</div>
						{stats.totalPlanned > 0 && (
							<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
								<div
									className={cn(
										"h-full transition-all",
										stats.isOver ? "bg-destructive" : "bg-primary"
									)}
									style={{
										width: `${Math.min(stats.budgetProgress, 100)}%`,
									}}
								/>
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col justify-between p-6 transition-colors hover:bg-card/10">
					<div>
						<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
							{stats.isOver ? "Over Budget" : "Remaining"}
						</p>
						<div className="mt-2 flex items-baseline gap-2">
							<h3
								className={cn(
									"mt-2 font-medium text-3xl tabular-nums tracking-tight",
									stats.isOver && "text-destructive"
								)}
							>
								{formatCurrency(Math.abs(stats.remaining))}
							</h3>
							{stats.totalPlanned > 0 && (
								<span
									className={cn(
										"font-medium text-sm",
										stats.isOver
											? "text-destructive/60"
											: "text-muted-foreground/60"
									)}
								>
									(
									{Math.round(
										(Math.abs(stats.remaining) / stats.totalPlanned) * 100
									)}
									%)
								</span>
							)}
						</div>
					</div>
					<div className="mt-4 flex items-center gap-1.5">
						<div
							className={cn(
								"h-1.5 w-1.5 rounded-full",
								stats.isOver ? "bg-destructive" : "bg-emerald-500"
							)}
						/>
						<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
							Balance
						</p>
					</div>
				</div>

				<div className="flex flex-col justify-between p-6 transition-colors hover:bg-card/10">
					<div>
						<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
							Planned
						</p>
						<h3 className="mt-2 font-medium text-3xl tabular-nums tracking-tight">
							{stats.totalPlanned > 0
								? formatCurrency(stats.totalPlanned)
								: "—"}
						</h3>
					</div>
				</div>
			</div>
		</div>
	);
}

function CycleOverviewTab({
	cycleId,
	expenses,
	formatCurrency,
	stats,
	typeStats,
}: {
	cycleId: Id<"expense_cycles">;
	expenses:
		| Awaited<ReturnType<typeof useQuery<typeof api.expenses.list>>>
		| undefined;
	formatCurrency: (amount: number) => string;
	stats: CycleStatsSummary;
	typeStats: CycleSummaryRecord["typeStats"];
}) {
	return (
		<TabsContent
			className="fade-in-50 animate-in space-y-8 duration-300"
			value="overview"
		>
			<CycleSummaryCards formatCurrency={formatCurrency} stats={stats} />

			<div className="grid gap-8 lg:grid-cols-3">
				<DashboardSection title="Allocation">
					<CategoryTypeChart typeStats={typeStats} />
				</DashboardSection>

				<CategorySpendingChart cycleId={cycleId} typeStats={typeStats} />

				<DashboardSection title="Quick Activity">
					<RecentActivity expenses={expenses?.slice(0, 5) || []} />
				</DashboardSection>
			</div>
		</TabsContent>
	);
}

function CycleCategoryCard({
	cat,
	cycleId,
	formatCurrency,
	historicalSpent,
	isEditing,
	onDelete,
	onEditOpenChange,
	onEditSuccess,
	spent,
}: {
	cat: CycleCategoryRecord;
	cycleId: Id<"expense_cycles">;
	formatCurrency: (amount: number) => string;
	historicalSpent?: CategoryHistoricalSpent;
	isEditing: boolean;
	onDelete: () => Promise<void>;
	onEditOpenChange: (open: boolean) => void;
	onEditSuccess: () => void;
	spent: number;
}) {
	return (
		<Card className="group relative overflow-hidden bg-card/50 transition-all hover:border-primary/30">
			<CardContent className="p-5">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3">
						<div
							className="flex h-10 w-10 items-center justify-center rounded-xl border bg-background text-xl shadow-sm transition-colors group-hover:border-primary/20 group-hover:bg-primary/5"
							style={
								cat.typeColor
									? {
											backgroundColor: `${cat.typeColor}15`,
											borderColor: `${cat.typeColor}30`,
										}
									: {}
							}
						>
							{cat.icon || "📦"}
						</div>
						<div>
							<h3 className="font-bold text-sm sm:text-base">{cat.name}</h3>
							<p
								className="font-bold text-[10px] uppercase tracking-widest"
								style={cat.typeColor ? { color: cat.typeColor } : {}}
							>
								{cat.typeName || "Uncategorized"}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
						<Dialog onOpenChange={onEditOpenChange} open={isEditing}>
							<DialogTrigger asChild>
								<Button className="h-8 w-8" size="icon" variant="ghost">
									<Pencil className="h-4 w-4" />
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Edit Category: {cat.name}</DialogTitle>
								</DialogHeader>
								<CategoryForm
									categoryId={cat._id}
									cycleId={cycleId}
									defaultValues={{
										name: cat.name,
										categoryTypeId: cat.categoryTypeId ?? undefined,
										plannedAmount: cat.plannedAmount ?? undefined,
										icon: cat.icon ?? undefined,
									}}
									historicalSpent={historicalSpent}
									onSuccess={onEditSuccess}
								/>
							</DialogContent>
						</Dialog>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
									size="icon"
									variant="ghost"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
									<AlertDialogDescription>
										This will permanently delete the category "{cat.name}". This
										action cannot be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
										onClick={onDelete}
									>
										Delete Category
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>

				<div className="mt-6 flex items-baseline justify-between">
					<div className="space-y-0.5">
						<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
							Planned
						</p>
						<p className="font-bold text-lg tabular-nums">
							{cat.plannedAmount != null
								? formatCurrency(cat.plannedAmount)
								: "—"}
						</p>
						{historicalSpent && (
							<p className="text-[10px] text-muted-foreground/50 italic">
								Last: {formatCurrency(historicalSpent.amount)}
							</p>
						)}
					</div>
					<div className="space-y-0.5 text-right">
						<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
							Spent
						</p>
						<p className="font-bold text-lg tabular-nums">
							{formatCurrency(spent)}
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function CyclePlanTab({
	categories,
	cycleId,
	cycleName,
	editingCategoryId,
	formatCurrency,
	historicalStats,
	isAddCategoryOpen,
	onAddCategoryOpenChange,
	onDeleteCategory,
	onEditCategoryOpenChange,
	onEditCategorySuccess,
	summary,
}: {
	categories:
		| Awaited<ReturnType<typeof useQuery<typeof api.categories.list>>>
		| undefined;
	cycleId: Id<"expense_cycles">;
	cycleName: string;
	editingCategoryId: Id<"categories"> | null;
	formatCurrency: (amount: number) => string;
	historicalStats:
		| Awaited<
				ReturnType<
					typeof useQuery<typeof api.aggregations.getHistoricalCategoryStats>
				>
		  >
		| undefined;
	isAddCategoryOpen: boolean;
	onAddCategoryOpenChange: (open: boolean) => void;
	onDeleteCategory: (id: Id<"categories">) => Promise<void>;
	onEditCategoryOpenChange: (id: Id<"categories">, open: boolean) => void;
	onEditCategorySuccess: () => void;
	summary: CycleSummaryRecord;
}) {
	return (
		<TabsContent
			className="fade-in-50 animate-in space-y-6 duration-300"
			value="plan"
		>
			<div className="flex items-center justify-between px-1">
				<div className="flex items-center gap-3">
					<h2 className="font-bold text-xl tracking-tight">
						Category Planning
					</h2>
					<span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
						{categories?.length || 0} total
					</span>
				</div>
				<Dialog onOpenChange={onAddCategoryOpenChange} open={isAddCategoryOpen}>
					<DialogTrigger asChild>
						<Button size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Add Category
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Add Category to {cycleName}</DialogTitle>
						</DialogHeader>
						<CategoryForm
							cycleId={cycleId}
							historicalSpent={undefined}
							onSuccess={() => onAddCategoryOpenChange(false)}
						/>
					</DialogContent>
				</Dialog>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{categories?.map((cat) => {
					const historicalSpent = getCycleHistoricalSpentValue(
						historicalStats,
						cat.name
					);
					const spent =
						summary.categoryStats.find((item) => item.categoryId === cat._id)
							?.spent || 0;

					return (
						<CycleCategoryCard
							cat={cat}
							cycleId={cycleId}
							formatCurrency={formatCurrency}
							historicalSpent={historicalSpent}
							isEditing={editingCategoryId === cat._id}
							key={cat._id}
							onDelete={() => onDeleteCategory(cat._id)}
							onEditOpenChange={(open) =>
								onEditCategoryOpenChange(cat._id, open)
							}
							onEditSuccess={onEditCategorySuccess}
							spent={spent}
						/>
					);
				})}

				{(!categories || categories.length === 0) && (
					<div className="col-span-full flex h-40 flex-col items-center justify-center rounded-2xl border border-border/60 border-dashed bg-muted/20">
						<p className="text-muted-foreground">No categories added yet.</p>
						<Button
							onClick={() => onAddCategoryOpenChange(true)}
							variant="link"
						>
							Add your first category
						</Button>
					</div>
				)}
			</div>
		</TabsContent>
	);
}

function CycleActivityTab({
	expenses,
}: {
	expenses:
		| Awaited<ReturnType<typeof useQuery<typeof api.expenses.list>>>
		| undefined;
}) {
	return (
		<TabsContent
			className="fade-in-50 animate-in duration-300"
			value="activity"
		>
			<div className="space-y-4">
				<div className="flex items-center justify-between px-1">
					<h2 className="font-bold text-xl tracking-tight">Transactions</h2>
					<span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
						{expenses?.length || 0} total
					</span>
				</div>
				<Card className="border-none bg-transparent py-0 shadow-none">
					<CardContent className="p-0">
						<RecentActivity expenses={expenses || []} />
					</CardContent>
				</Card>
			</div>
		</TabsContent>
	);
}

export default function CycleDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const router = useRouter();
	const { id } = use(params);
	const searchParams = useSearchParams();
	const activeTab = searchParams.get("tab") || "overview";
	const cycleId = id as Id<"expense_cycles">;
	const { format: formatCurrency } = useCurrency();

	const cycle = useQuery(api.cycles.get, cycleId ? { cycleId } : "skip");
	const summary = useQuery(
		api.aggregations.getCycleSummary,
		cycleId ? { cycleId } : "skip"
	);
	const historicalStats = useQuery(
		api.aggregations.getHistoricalCategoryStats,
		cycleId ? { currentCycleId: cycleId } : "skip"
	);
	const allCycles = useQuery(api.cycles.list);
	const categories = useQuery(
		api.categories.list,
		cycleId ? { cycleId } : "skip"
	);
	const expenses = useQuery(api.expenses.list, cycleId ? { cycleId } : "skip");

	const removeCategory = useMutation(api.categories.remove);
	const removeCycle = useMutation(api.cycles.remove);

	const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
	const [editingCategoryId, setEditingCategoryId] =
		useState<Id<"categories"> | null>(null);

	const { previousCycle, nextCycle } = useMemo(() => {
		if (!(allCycles && cycleId)) {
			return { previousCycle: null, nextCycle: null };
		}
		const index = allCycles.findIndex((c) => c._id === cycleId);
		return {
			previousCycle: index !== -1 ? allCycles[index + 1] : null,
			nextCycle: index !== -1 ? allCycles[index - 1] : null,
		};
	}, [allCycles, cycleId]);

	if (cycle === undefined || summary === undefined || allCycles === undefined) {
		return <Loader />;
	}

	if (!cycle) {
		return <CycleNotFoundState />;
	}

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.replace(`/cycles/${cycleId}?${params.toString()}`);
	};

	const stats = buildCycleStats(summary);
	const navigateToCycle = (targetCycleId: string) => {
		router.push(`/cycles/${targetCycleId}?tab=${activeTab}`);
	};

	return (
		<div className="space-y-8 py-3">
			<CycleHeader
				cycleId={cycleId}
				cycleName={cycle.name}
				endDate={cycle.endDate}
				nextCycleId={nextCycle?._id}
				onDeleteCycle={() =>
					deleteCycleAndNavigate({
						cycleId,
						removeCycle,
						router,
					})
				}
				onNavigate={navigateToCycle}
				previousCycleId={previousCycle?._id}
				startDate={cycle.startDate}
			/>

			<Tabs
				className="space-y-8"
				onValueChange={handleTabChange}
				value={activeTab}
			>
				<TabsList className="bg-muted/50 p-1">
					<TabsTrigger className="gap-2" value="overview">
						<LayoutDashboard className="h-4 w-4" />
						Overview
					</TabsTrigger>
					<TabsTrigger className="gap-2" value="plan">
						<ListTodo className="h-4 w-4" />
						Plan
					</TabsTrigger>
					<TabsTrigger className="gap-2" value="activity">
						<History className="h-4 w-4" />
						Activity
					</TabsTrigger>
				</TabsList>

				<CycleOverviewTab
					cycleId={cycleId}
					expenses={expenses}
					formatCurrency={formatCurrency}
					stats={stats}
					typeStats={summary.typeStats}
				/>

				<CyclePlanTab
					categories={categories}
					cycleId={cycleId}
					cycleName={cycle.name}
					editingCategoryId={editingCategoryId}
					formatCurrency={formatCurrency}
					historicalStats={historicalStats}
					isAddCategoryOpen={isAddCategoryOpen}
					onAddCategoryOpenChange={setIsAddCategoryOpen}
					onDeleteCategory={(id) =>
						deleteCycleCategory({
							id,
							removeCategory,
						})
					}
					onEditCategoryOpenChange={(id, open) =>
						setEditingCategoryId(open ? id : null)
					}
					onEditCategorySuccess={() => setEditingCategoryId(null)}
					summary={summary as CycleSummaryRecord}
				/>

				<CycleActivityTab expenses={expenses} />
			</Tabs>
		</div>
	);
}
