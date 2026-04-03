"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronLeft,
	Eye,
	EyeOff,
	Pencil,
	Plus,
	Receipt,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { toast } from "sonner";
import { CategoryForm } from "@/components/category-form";
import { ExpenseForm } from "@/components/expense-form";
import { Loader } from "@/components/loader";
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
import { DataTable } from "@/components/ui/data-table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";
import { columns } from "./columns";

interface CategoryStatsSummary {
	planned: number;
	remaining: number;
	progress: number;
	isOver: boolean;
	typeColor: string;
	percentageSpent: number;
}

interface HistoricalSpent {
	amount: number;
	cycleName: string;
}

interface CategoryDetailRecord {
	categoryTypeId?: Id<"category_types"> | null;
	cycleId: Id<"expense_cycles">;
	icon?: string | null;
	isHidden?: boolean;
	name: string;
	plannedAmount?: number | null;
}

type CategoryExpenses = NonNullable<
	Awaited<ReturnType<typeof useQuery<typeof api.expenses.list>>>
>;

interface CategoryDetailHeaderProps {
	category: CategoryDetailRecord;
	categoryId: Id<"categories">;
	categoryType: { color?: string | null; name: string } | null;
	cycleName?: string;
	historicalSpent?: HistoricalSpent;
	isAddExpenseModalOpen: boolean;
	isEditModalOpen: boolean;
	onDelete: () => Promise<void>;
	onToggleVisibility: () => Promise<void>;
	setIsAddExpenseModalOpen: (open: boolean) => void;
	setIsEditModalOpen: (open: boolean) => void;
	totalSpent: number;
}

function CategoryNotFoundState() {
	return (
		<div className="flex h-full flex-col items-center justify-center space-y-4">
			<h1 className="font-bold text-2xl">Category not found</h1>
			<Button asChild>
				<Link href="/dashboard">Back to Dashboard</Link>
			</Button>
		</div>
	);
}

function getCategoryProgressColor({
	isOver,
	progress,
	typeColor,
}: Pick<CategoryStatsSummary, "isOver" | "progress" | "typeColor">) {
	if (isOver) {
		return "hsl(var(--destructive))";
	}

	if (progress > 85) {
		return "hsl(var(--amber-500))";
	}

	return typeColor;
}

function buildCategoryStats({
	plannedAmount,
	totalSpent,
	typeColor,
}: {
	plannedAmount?: number | null;
	totalSpent: number;
	typeColor?: string | null;
}): CategoryStatsSummary {
	const planned = plannedAmount || 0;

	return {
		planned,
		remaining: planned - totalSpent,
		progress: planned > 0 ? (totalSpent / planned) * 100 : 0,
		isOver: totalSpent > planned && planned > 0,
		typeColor: typeColor || "hsl(var(--primary))",
		percentageSpent: planned > 0 ? Math.round((totalSpent / planned) * 100) : 0,
	};
}

function getHistoricalSpentValue(
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

async function deleteCategoryAndRedirect({
	categoryId,
	removeCategory,
	router,
	setIsDeleting,
}: {
	categoryId: Id<"categories">;
	removeCategory: (args: { categoryId: Id<"categories"> }) => Promise<unknown>;
	router: ReturnType<typeof useRouter>;
	setIsDeleting: (value: boolean) => void;
}) {
	try {
		setIsDeleting(true);
		const result = (await removeCategory({ categoryId })) as {
			affectedExpenses: number;
		};
		if (result.affectedExpenses > 0) {
			toast.success(
				`Category deleted. ${result.affectedExpenses} expenses moved to Uncategorized.`
			);
		} else {
			toast.success("Category deleted");
		}
		router.push("/dashboard");
	} catch (_error) {
		setIsDeleting(false);
		toast.error("Failed to delete category");
	}
}

async function toggleCategoryVisibility({
	category,
	categoryId,
	isDeleting,
	updateCategory,
}: {
	category: CategoryDetailRecord | null;
	categoryId: Id<"categories">;
	isDeleting: boolean;
	updateCategory: (args: {
		id: Id<"categories">;
		isHidden: boolean;
	}) => Promise<unknown>;
}) {
	if (!category || isDeleting) {
		return;
	}

	try {
		await updateCategory({
			id: categoryId,
			isHidden: !category.isHidden,
		});
		toast.success(
			category.isHidden
				? "Category now visible on dashboard"
				: "Category hidden from dashboard"
		);
	} catch (_error) {
		toast.error("Failed to update visibility");
	}
}

function CategoryDetailHeader({
	category,
	categoryId,
	categoryType,
	cycleName,
	historicalSpent,
	isAddExpenseModalOpen,
	isEditModalOpen,
	onDelete,
	onToggleVisibility,
	setIsAddExpenseModalOpen,
	setIsEditModalOpen,
	totalSpent,
}: CategoryDetailHeaderProps) {
	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-4">
				<Button asChild size="icon" variant="ghost">
					<Link href="/dashboard">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<div className="flex items-center gap-3">
					<div
						className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-background text-2xl shadow-sm"
						style={{
							backgroundColor: categoryType?.color
								? `${categoryType.color}15`
								: undefined,
							borderColor: categoryType?.color
								? `${categoryType.color}30`
								: undefined,
						}}
					>
						{category.icon || "📦"}
					</div>
					<div>
						<h1 className="font-bold text-3xl tracking-tight">
							{category.name}
						</h1>
						<div className="flex items-center gap-2">
							{categoryType && (
								<span
									className="font-bold text-[10px] uppercase tracking-widest"
									style={{ color: categoryType.color || undefined }}
								>
									{categoryType.name}
								</span>
							)}
							{cycleName && (
								<p className="font-medium text-muted-foreground text-xs">
									• {cycleName}
								</p>
							)}
						</div>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Dialog
					onOpenChange={setIsAddExpenseModalOpen}
					open={isAddExpenseModalOpen}
				>
					<DialogTrigger asChild>
						<Button size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Add Expense
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Add Expense to {category.name}</DialogTitle>
						</DialogHeader>
						<ExpenseForm
							defaultValues={{
								categoryId,
							}}
							onSuccess={() => setIsAddExpenseModalOpen(false)}
						/>
					</DialogContent>
				</Dialog>

				<Dialog onOpenChange={setIsEditModalOpen} open={isEditModalOpen}>
					<DialogTrigger asChild>
						<Button size="sm" variant="outline">
							<Pencil className="mr-2 h-4 w-4" />
							Edit
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Edit Category: {category.name}</DialogTitle>
						</DialogHeader>
						<CategoryForm
							categoryId={categoryId}
							cycleId={category.cycleId}
							defaultValues={{
								name: category.name,
								categoryTypeId: category.categoryTypeId ?? undefined,
								plannedAmount: category.plannedAmount ?? undefined,
								icon: category.icon ?? undefined,
							}}
							historicalSpent={historicalSpent}
							onSuccess={() => setIsEditModalOpen(false)}
						/>
					</DialogContent>
				</Dialog>

				<Button
					className="gap-2"
					onClick={onToggleVisibility}
					size="sm"
					variant="outline"
				>
					{category.isHidden ? (
						<>
							<Eye className="h-4 w-4" />
							Show on Dashboard
						</>
					) : (
						<>
							<EyeOff className="h-4 w-4" />
							Hide from Dashboard
						</>
					)}
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
								This will permanently delete the category{" "}
								<strong>{category.name}</strong>.
								{totalSpent > 0 &&
									` Any expenses in this category will become "Uncategorized".`}
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
	);
}

function CategorySummaryCards({
	format,
	stats,
	totalSpent,
}: {
	format: (value: number) => string;
	stats: CategoryStatsSummary;
	totalSpent: number;
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
									{format(totalSpent)}
								</h3>
								{stats.planned > 0 && (
									<span className="font-medium text-muted-foreground/60 text-sm">
										({stats.percentageSpent}%)
									</span>
								)}
							</div>
						</div>
					</div>
					<div className="mt-4 flex flex-col gap-2">
						<div className="flex items-center gap-1.5">
							<div
								className="h-1.5 w-1.5 rounded-full"
								style={{ backgroundColor: stats.typeColor }}
							/>
							<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
								Usage
							</p>
						</div>
						{stats.planned > 0 && (
							<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full transition-all"
									style={{
										width: `${Math.min(stats.progress, 100)}%`,
										backgroundColor: getCategoryProgressColor(stats),
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
								{format(Math.abs(stats.remaining))}
							</h3>
							{stats.planned > 0 && (
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
										(Math.abs(stats.remaining) / stats.planned) * 100
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
							{stats.planned > 0 ? format(stats.planned) : "—"}
						</h3>
					</div>
				</div>
			</div>
		</div>
	);
}

function CategoryTransactionsSection({
	expenses,
	onAddExpense,
}: {
	expenses: CategoryExpenses;
	onAddExpense: () => void;
}) {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between px-1">
				<h2 className="font-bold text-xl tracking-tight">Transactions</h2>
				<span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
					{expenses.length} total
				</span>
			</div>
			{expenses.length > 0 ? (
				<DataTable columns={columns} data={expenses} />
			) : (
				<EmptyState
					action={
						<Button onClick={onAddExpense} size="sm" variant="outline">
							<Plus className="mr-2 h-4 w-4" />
							Add Expense
						</Button>
					}
					className="min-h-[320px]"
					description="No transactions found for this category."
					icon={<Receipt className="h-10 w-10" />}
					title="No transactions yet"
				/>
			)}
		</div>
	);
}

export default function CategoryDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const categoryId = id as Id<"categories">;
	const router = useRouter();
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Fetch category details
	const category = useQuery(
		api.categories.get,
		isDeleting ? "skip" : { id: categoryId }
	);
	const updateCategory = useMutation(api.categories.update);
	const removeCategory = useMutation(api.categories.remove);
	const categoryTypes = useQuery(api.categories.listTypes);

	const cycle = useQuery(
		api.cycles.get,
		category && !isDeleting ? { cycleId: category.cycleId } : "skip"
	);

	const historicalStats = useQuery(
		api.aggregations.getHistoricalCategoryStats,
		category?.cycleId ? { currentCycleId: category.cycleId } : "skip"
	);

	// Fetch expenses for this category
	const expenses = useQuery(
		api.expenses.list,
		isDeleting ? "skip" : { categoryId }
	);

	const { format } = useCurrency();

	const categoryType = useMemo(() => {
		if (!(category && categoryTypes) || isDeleting) {
			return null;
		}
		return categoryTypes.find((t) => t._id === category.categoryTypeId) || null;
	}, [category, categoryTypes, isDeleting]);

	const totalSpent = useMemo(() => {
		return expenses?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
	}, [expenses]);

	if (isDeleting) {
		return <Loader />;
	}

	if (category === undefined || expenses === undefined) {
		return <Loader />;
	}

	if (category === null) {
		return <CategoryNotFoundState />;
	}

	const stats = buildCategoryStats({
		plannedAmount: category.plannedAmount,
		totalSpent,
		typeColor: categoryType?.color,
	});
	const historicalSpent = getHistoricalSpentValue(
		historicalStats,
		category.name
	);

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8 p-6">
			<CategoryDetailHeader
				category={category}
				categoryId={categoryId}
				categoryType={categoryType}
				cycleName={cycle?.name}
				historicalSpent={historicalSpent}
				isAddExpenseModalOpen={isAddExpenseModalOpen}
				isEditModalOpen={isEditModalOpen}
				onDelete={() =>
					deleteCategoryAndRedirect({
						categoryId,
						removeCategory,
						router,
						setIsDeleting,
					})
				}
				onToggleVisibility={() =>
					toggleCategoryVisibility({
						category,
						categoryId,
						isDeleting,
						updateCategory,
					})
				}
				setIsAddExpenseModalOpen={setIsAddExpenseModalOpen}
				setIsEditModalOpen={setIsEditModalOpen}
				totalSpent={totalSpent}
			/>

			<CategorySummaryCards
				format={format}
				stats={stats}
				totalSpent={totalSpent}
			/>

			<CategoryTransactionsSection
				expenses={expenses}
				onAddExpense={() => setIsAddExpenseModalOpen(true)}
			/>
		</div>
	);
}
