"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowDownWideNarrow,
	Check,
	Eye,
	EyeOff,
	LayoutGrid,
	List,
	MoreHorizontal,
	Pencil,
	PieChart,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { CategoryForm } from "@/components/category-form";
import { DashboardSection } from "@/components/dashboard-section";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";

interface TypeStat {
	typeId: string | null;
	typeName: string;
	typeColor: string | null;
	totalPlanned: number;
	totalSpent: number;
	categories: CategorySummaryItem[];
}

interface CategorySpendingChartProps {
	typeStats: TypeStat[];
	cycleId?: string;
}

interface ChartDataItem {
	categoryId: string;
	categoryTypeId?: string;
	name: string;
	icon: string | null;
	typeColor?: string;
	plannedRaw?: number | null;
	spent: number;
	planned: number;
	remaining: number;
	isHidden: boolean;
	isUncategorized: boolean;
	isOver: boolean;
}

interface CategorySummaryItem {
	categoryId: string;
	categoryTypeId?: string | null;
	name: string;
	icon: string | null;
	planned: number | null;
	spent: number;
	isHidden: boolean;
	typeColor?: string | null;
}

type SortOption =
	| "spent-desc"
	| "spent-asc"
	| "planned-desc"
	| "planned-asc"
	| "remaining-desc"
	| "remaining-asc"
	| "name-asc"
	| "name-desc";

type ViewMode = "grouped" | "list";

export function CategorySpendingChart({
	typeStats,
	cycleId,
}: CategorySpendingChartProps) {
	const { format } = useCurrency();
	const user = useQuery(api.users.get);
	const updateViewMode = useMutation(api.users.updateDashboardViewMode);
	const updateCategory = useMutation(api.categories.update);
	const [sortBy, setSortBy] = useState<SortOption>("spent-desc");
	const [editingCategory, setEditingCategory] = useState<ChartDataItem | null>(
		null
	);

	const viewMode = (user?.dashboardViewMode as ViewMode) || "grouped";

	const hasData = typeStats.some((t) => t.categories.length > 0);

	const sortCategories = useCallback(
		(cats: CategorySummaryItem[]) => {
			return [...cats].sort((a, b) => {
				const aPlanned = a.planned ?? 0;
				const bPlanned = b.planned ?? 0;
				const aRemaining = aPlanned - a.spent;
				const bRemaining = bPlanned - b.spent;

				switch (sortBy) {
					case "spent-desc":
						return b.spent - a.spent;
					case "spent-asc":
						return a.spent - b.spent;
					case "planned-desc":
						return bPlanned - aPlanned;
					case "planned-asc":
						return aPlanned - bPlanned;
					case "remaining-desc":
						return bRemaining - aRemaining;
					case "remaining-asc":
						return aRemaining - bRemaining;
					case "name-asc":
						return a.name.localeCompare(b.name);
					case "name-desc":
						return b.name.localeCompare(a.name);
					default:
						return 0;
				}
			});
		},
		[sortBy]
	);

	const flatCategories = useMemo(() => {
		const all = typeStats.flatMap((t) =>
			t.categories.map((c) => ({ ...c, typeColor: t.typeColor }))
		);
		return sortCategories(all);
	}, [typeStats, sortCategories]);

	const hiddenCategories = flatCategories.filter((c) => c.isHidden);
	const visibleFlatCategories = flatCategories.filter((c) => !c.isHidden);

	const actions = (
		<div className="flex items-center gap-1">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8" size="icon" variant="ghost">
						{viewMode === "grouped" ? (
							<LayoutGrid className="h-4 w-4 text-muted-foreground" />
						) : (
							<List className="h-4 w-4 text-muted-foreground" />
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>View Mode</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => updateViewMode({ viewMode: "grouped" })}
					>
						<div className="flex items-center gap-2">
							<LayoutGrid className="h-4 w-4" />
							Grouped by Type
						</div>
						{viewMode === "grouped" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => updateViewMode({ viewMode: "list" })}
					>
						<div className="flex items-center gap-2">
							<List className="h-4 w-4" />
							Simple List
						</div>
						{viewMode === "list" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8" size="icon" variant="ghost">
						<ArrowDownWideNarrow className="h-4 w-4 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuLabel>Sort by</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("spent-desc")}
					>
						Spent (High to Low)
						{sortBy === "spent-desc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("spent-asc")}
					>
						Spent (Low to High)
						{sortBy === "spent-asc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("planned-desc")}
					>
						Planned (High to Low)
						{sortBy === "planned-desc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("planned-asc")}
					>
						Planned (Low to High)
						{sortBy === "planned-asc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("remaining-desc")}
					>
						Remaining (High to Low)
						{sortBy === "remaining-desc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("remaining-asc")}
					>
						Remaining (Low to High)
						{sortBy === "remaining-asc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("name-asc")}
					>
						Name (A-Z)
						{sortBy === "name-asc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center justify-between"
						onClick={() => setSortBy("name-desc")}
					>
						Name (Z-A)
						{sortBy === "name-desc" && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{hiddenCategories.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button className="h-8 w-8" size="icon" variant="ghost">
							<EyeOff className="h-4 w-4 text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel>Hidden Categories</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{hiddenCategories.map((cat) => (
							<DropdownMenuItem
								className="flex items-center justify-between"
								key={cat.categoryId}
								onClick={async () => {
									try {
										await updateCategory({
											id: cat.categoryId as Id<"categories">,
											isHidden: false,
										});
										toast.success(`${cat.name} is now visible`);
									} catch (_error) {
										toast.error("Failed to update visibility");
									}
								}}
							>
								<span>{cat.name}</span>
								<Eye className="h-3.5 w-3.5 text-muted-foreground" />
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{cycleId && (
				<Button asChild className="h-8 w-8" size="icon" variant="ghost">
					<Link href={`/categories/new?id=${cycleId}`}>
						<Plus className="h-4 w-4" />
					</Link>
				</Button>
			)}
		</div>
	);

	if (!hasData) {
		return (
			<DashboardSection action={actions} title="Categories">
				<EmptyState
					action={
						<Button asChild size="sm" variant="outline">
							<Link href={`/categories/new?id=${cycleId}`}>
								<Plus className="mr-2 h-4 w-4" />
								Add Category
							</Link>
						</Button>
					}
					className="min-h-[320px]"
					description="Plan your spending by adding categories to this cycle."
					icon={<PieChart className="h-10 w-10" />}
					title="No categories yet"
				/>
			</DashboardSection>
		);
	}

	return (
		<DashboardSection action={actions} title="Categories">
			{viewMode === "grouped" ? (
				<Accordion
					className="w-full space-y-2"
					defaultValue={typeStats.map((t) => t.typeId || "uncategorized")}
					type="multiple"
				>
					{typeStats.map((type) => {
						const visibleCategories = type.categories.filter(
							(c) => !c.isHidden
						);
						if (visibleCategories.length === 0) {
							return null;
						}
						const typeKey = type.typeId || "uncategorized";
						const sortedVisibleCategories = sortCategories(visibleCategories);

						return (
							<AccordionItem
								className="border-none"
								key={typeKey}
								value={typeKey}
							>
								<AccordionTrigger className="group -mx-2 rounded-xl px-2 py-2 hover:bg-accent/40 hover:no-underline">
									<div className="flex flex-1 items-center justify-between pr-4">
										<div className="flex items-center gap-2">
											<div
												className="h-2 w-2 rounded-full"
												style={{
													backgroundColor:
														type.typeColor || "hsl(var(--muted-foreground))",
												}}
											/>
											<span className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
												{type.typeName}
											</span>
											<span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
												{visibleCategories.length}
											</span>
										</div>
										<div className="flex items-center gap-3">
											<span className="font-bold text-sm tabular-nums">
												{format(type.totalSpent)}
												{type.totalPlanned > 0 && (
													<>
														<span className="mx-1 font-normal text-muted-foreground/40">
															/
														</span>
														<span className="font-medium text-muted-foreground/60">
															{format(type.totalPlanned)}
														</span>
													</>
												)}
											</span>
										</div>
									</div>
								</AccordionTrigger>
								<AccordionContent className="pt-1 pb-2">
									<div className="space-y-1">
										{sortedVisibleCategories.map((cat) => (
											<CategoryStatItem
												format={format}
												item={{
													...cat,
													categoryTypeId: cat.categoryTypeId ?? undefined,
													typeColor: type.typeColor ?? undefined,
													isUncategorized: cat.categoryId === "uncategorized",
													plannedRaw: cat.planned,
													planned: cat.planned ?? 0,
													remaining: (cat.planned ?? 0) - cat.spent,
													isOver:
														(cat.planned ?? 0) > 0 &&
														cat.spent > (cat.planned ?? 0),
												}}
												key={cat.categoryId}
												setEditingCategory={setEditingCategory}
												updateCategory={updateCategory}
											/>
										))}
									</div>
								</AccordionContent>
							</AccordionItem>
						);
					})}
				</Accordion>
			) : (
				<div className="space-y-1">
					{visibleFlatCategories.map((item) => (
						<CategoryStatItem
							format={format}
							item={{
								...item,
								categoryTypeId: item.categoryTypeId ?? undefined,
								typeColor: item.typeColor ?? undefined,
								isUncategorized: item.categoryId === "uncategorized",
								plannedRaw: item.planned,
								planned: item.planned ?? 0,
								remaining: (item.planned ?? 0) - item.spent,
								isOver:
									(item.planned ?? 0) > 0 && item.spent > (item.planned ?? 0),
							}}
							key={item.categoryId}
							setEditingCategory={setEditingCategory}
							updateCategory={updateCategory}
						/>
					))}
				</div>
			)}

			<Dialog
				onOpenChange={(open) => !open && setEditingCategory(null)}
				open={!!editingCategory}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Category</DialogTitle>
					</DialogHeader>
					{editingCategory && (
						<CategoryForm
							categoryId={editingCategory.categoryId as Id<"categories">}
							cycleId={cycleId as Id<"expense_cycles">}
							defaultValues={{
								name: editingCategory.name,
								categoryTypeId: editingCategory.categoryTypeId ?? "",
								plannedAmount:
									editingCategory.plannedRaw === null
										? undefined
										: editingCategory.plannedRaw,
								icon: editingCategory.icon ?? undefined,
							}}
							onSuccess={() => setEditingCategory(null)}
						/>
					)}
				</DialogContent>
			</Dialog>
		</DashboardSection>
	);
}

function CategoryStatItem({
	item,
	format,
	updateCategory,
	setEditingCategory,
}: {
	item: ChartDataItem;
	format: (val: number) => string;
	updateCategory: (args: {
		id: Id<"categories">;
		isHidden: boolean;
	}) => Promise<unknown>;
	setEditingCategory: (item: ChartDataItem) => void;
}) {
	return (
		<div className="group flex items-center gap-1 rounded-xl px-1 transition-colors hover:bg-accent/40">
			<Link
				className="block min-w-0 flex-1 space-y-2 rounded-[calc(theme(borderRadius.xl)-0.25rem)] px-3 py-3"
				href={
					item.isUncategorized
						? "/expenses?category=uncategorized"
						: `/categories/${item.categoryId}`
				}
			>
				<div className="flex items-end justify-between text-sm">
					<div className="flex items-center gap-3">
						<div
							className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background text-xl shadow-sm transition-colors group-hover:border-primary/20 group-hover:bg-primary/5"
							style={{
								backgroundColor: item.typeColor
									? `${item.typeColor}15`
									: undefined,
								borderColor: item.typeColor ? `${item.typeColor}30` : undefined,
							}}
						>
							{item.icon || "📦"}
						</div>
						<div className="flex flex-col">
							<span className="font-semibold text-foreground">{item.name}</span>
						</div>
					</div>
					<div className="flex flex-col items-end text-right">
						<span className="font-bold text-base tabular-nums">
							{format(item.spent)}
							{item.planned > 0 && (
								<span className="ml-1 font-medium text-muted-foreground/60 text-xs">
									({Math.round((item.spent / item.planned) * 100)}%)
								</span>
							)}
						</span>
						{item.planned > 0 ? (
							<span
								className={cn(
									"text-[10px] uppercase tracking-wider",
									item.isOver ? "text-destructive" : "text-muted-foreground"
								)}
							>
								{item.isOver ? "Over: " : "Left: "}
								{format(Math.abs(item.planned - item.spent))}
								<span className="mx-1 opacity-50">/</span>
								<span className="opacity-70">Plan: {format(item.planned)}</span>
							</span>
						) : (
							<span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
								No budget planned
							</span>
						)}
					</div>
				</div>
				<div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30">
					<div
						className={cn(
							"h-full rounded-full transition-all duration-500 ease-in-out",
							item.planned > 0 && item.isOver && "bg-destructive",
							item.planned > 0 &&
								!item.isOver &&
								!item.typeColor &&
								"bg-primary",
							item.planned <= 0 && "bg-muted-foreground/40"
						)}
						style={{
							width: `${Math.min(item.planned > 0 ? (item.spent / item.planned) * 100 : 0, 100)}%`,
							backgroundColor:
								item.planned > 0 && !item.isOver && item.typeColor
									? item.typeColor
									: undefined,
						}}
					/>
					{item.planned > 0 && item.spent > item.planned && (
						<div className="absolute inset-y-0 left-0 bg-destructive/20" />
					)}
				</div>
			</Link>
			<div className="flex items-center pr-1">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<Link
								href={
									item.isUncategorized
										? "/expenses/new"
										: `/expenses/new?categoryId=${item.categoryId}`
								}
							>
								<Plus className="mr-2 h-4 w-4" />
								Add Expense
							</Link>
						</DropdownMenuItem>
						{!item.isUncategorized && (
							<>
								<DropdownMenuItem onClick={() => setEditingCategory(item)}>
									<Pencil className="mr-2 h-4 w-4" />
									Edit Category
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={async () => {
										try {
											await updateCategory({
												id: item.categoryId as Id<"categories">,
												isHidden: true,
											});
											toast.success(`${item.name} hidden from dashboard`);
										} catch (_error) {
											toast.error("Failed to hide category");
										}
									}}
								>
									<EyeOff className="mr-2 h-4 w-4" />
									Hide from Dashboard
								</DropdownMenuItem>
							</>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link
								href={
									item.isUncategorized
										? "/expenses?category=uncategorized"
										: `/categories/${item.categoryId}`
								}
							>
								View Details
							</Link>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
