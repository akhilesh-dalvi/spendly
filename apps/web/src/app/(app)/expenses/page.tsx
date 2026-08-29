"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
	ArrowUpDown,
	Calendar,
	ChevronLeft,
	Filter,
	Plus,
	Search,
	Tag,
	Wallet,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AccountTypeIcon } from "@/components/account-type-icon";
import { Loader } from "@/components/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/hooks/use-currency";

interface Filters {
	accountId: string;
	cycleId: string;
	categoryId: string;
	includeUncategorized: boolean;
	tagIds: string[];
}

interface ExpenseRow {
	_id: string;
	amount: number;
	accountName?: string | null;
	accountTypeColor?: string | null;
	accountTypeIcon?: string | null;
	accountTypeName?: string | null;
	categoryIcon?: string | null;
	categoryId?: string | null;
	categoryName?: string | null;
	categoryTypeColor?: string | null;
	date: string;
	spentOn?: string | null;
	tagNames?: string[];
}

type ExpenseColumnDef = ColumnDef<ExpenseRow> & {
	className?: string;
	headerClassName?: string;
};

interface AccountFilterOption {
	_id: Id<"accounts">;
	accountTypeName: string;
	isArchived?: boolean;
	name: string;
}

interface ExpenseAccountFilterProps {
	accounts: AccountFilterOption[];
	onValueChange: (accountId: string) => void;
	selectedAccountId?: Id<"accounts">;
}

function ExpenseAccountFilter({
	accounts,
	onValueChange,
	selectedAccountId,
}: ExpenseAccountFilterProps) {
	const activeAccounts = accounts.filter((account) => !account.isArchived);
	const archivedAccounts = accounts.filter((account) => account.isArchived);

	return (
		<Select
			onValueChange={(value) => onValueChange(value === "all" ? "" : value)}
			value={selectedAccountId ?? "all"}
		>
			<SelectTrigger className="h-10 w-[180px] bg-card/50">
				<Wallet />
				<SelectValue placeholder="Account" />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					<SelectItem value="all">All accounts</SelectItem>
				</SelectGroup>
				{activeAccounts.length > 0 ? (
					<SelectGroup>
						<SelectLabel>Active</SelectLabel>
						{activeAccounts.map((account) => (
							<SelectItem key={account._id} value={account._id}>
								{account.name} · {account.accountTypeName}
							</SelectItem>
						))}
					</SelectGroup>
				) : null}
				{archivedAccounts.length > 0 ? (
					<SelectGroup>
						<SelectLabel>Archived</SelectLabel>
						{archivedAccounts.map((account) => (
							<SelectItem key={account._id} value={account._id}>
								{account.name} · {account.accountTypeName} (Archived)
							</SelectItem>
						))}
					</SelectGroup>
				) : null}
			</SelectContent>
		</Select>
	);
}

interface ActiveAccountFilterBadgeProps {
	account?: AccountFilterOption;
	onClear: () => void;
}

function ActiveAccountFilterBadge({
	account,
	onClear,
}: ActiveAccountFilterBadgeProps) {
	if (!account) {
		return null;
	}

	return (
		<Badge
			className="h-7 gap-1 border-primary/20 bg-primary/10 pr-1 pl-1 text-primary"
			variant="secondary"
		>
			<span className="px-1 font-bold text-[10px] uppercase opacity-60">
				Account
			</span>
			<span className="font-semibold text-xs">
				{account.name}
				{account.isArchived ? " (Archived)" : ""}
			</span>
			<button
				aria-label={`Remove ${account.name} account filter`}
				className="rounded-full p-0.5 hover:bg-primary/20"
				onClick={onClear}
				type="button"
			>
				<X className="h-3 w-3" />
			</button>
		</Badge>
	);
}

interface ExpenseResultsProps {
	columns: ExpenseColumnDef[];
	expenses: ExpenseRow[];
	globalSearch: string;
	onDelete: (expense: ExpenseRow) => void;
	onRowClick: (expense: ExpenseRow) => void;
	onSearchChange: (value: string) => void;
}

function ExpenseResults({
	columns,
	expenses,
	globalSearch,
	onDelete,
	onRowClick,
	onSearchChange,
}: ExpenseResultsProps) {
	if (expenses.length === 0) {
		return (
			<EmptyState
				action={
					<Button asChild>
						<Link href="/expenses/new">
							<Plus className="mr-2 h-4 w-4" />
							Add Expense
						</Link>
					</Button>
				}
				description="Try adjusting your filters or add a new expense."
				icon={<Calendar className="h-12 w-12" />}
				title="No expenses found"
			/>
		);
	}

	return (
		<DataTable
			columns={columns}
			data={expenses}
			deleteDescription="This action cannot be undone. This will permanently remove the expense."
			deleteTitle="Delete expense?"
			externalSearchValue={globalSearch}
			onExternalSearchChange={onSearchChange}
			onRowClick={onRowClick}
			onRowDelete={onDelete}
			rowClassName="hover:bg-muted/50"
			showFooter={true}
		/>
	);
}

function ExpensesPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { format: formatCurrency } = useCurrency();
	const removeExpense = useMutation(api.expenses.remove);
	const [filters, setFilters] = useState<Filters>(() => {
		const categoryId =
			searchParams.get("category") === "uncategorized" ? "uncategorized" : "";
		return {
			accountId: searchParams.get("account") ?? "",
			cycleId: "",
			categoryId,
			includeUncategorized: categoryId === "uncategorized",
			tagIds: [],
		};
	});
	const [globalSearch, setGlobalSearch] = useState("");

	const cycles = useQuery(api.cycles.list);
	const accounts = useQuery(api.accounts.list, { includeArchived: true });

	const groupedCycles = useMemo(() => {
		if (!cycles) {
			return { current: null, upcoming: [], past: [] };
		}
		const today = format(new Date(), "yyyy-MM-dd");
		return {
			current:
				cycles.find((c) => today >= c.startDate && today <= c.endDate) || null,
			upcoming: cycles.filter((c) => c.startDate > today),
			past: cycles.filter((c) => c.endDate < today),
		};
	}, [cycles]);

	const tags = useQuery(api.tags.list);
	const categories = useQuery(
		api.categories.list,
		filters.cycleId
			? { cycleId: filters.cycleId as Id<"expense_cycles"> }
			: "skip"
	);

	const activeCycleName = useMemo(
		() => cycles?.find((c) => c._id === filters.cycleId)?.name,
		[cycles, filters.cycleId]
	);

	const activeCategoryName = useMemo(() => {
		if (filters.includeUncategorized) {
			return "Uncategorized";
		}
		return categories?.find((c) => c._id === filters.categoryId)?.name;
	}, [categories, filters.categoryId, filters.includeUncategorized]);

	const activeAccount = useMemo(
		() => accounts?.find((account) => account._id === filters.accountId),
		[accounts, filters.accountId]
	);
	const activeTags = useMemo(
		() => tags?.filter((t) => filters.tagIds.includes(t._id)) || [],
		[tags, filters.tagIds]
	);

	const hasActiveFilters = Boolean(
		filters.accountId ||
			filters.cycleId ||
			filters.categoryId ||
			filters.tagIds.length > 0
	);

	const expenseQueryArgs = useMemo(() => {
		const args: {
			accountId?: Id<"accounts">;
			cycleId?: Id<"expense_cycles">;
			categoryId?: Id<"categories">;
			startDate?: string;
			endDate?: string;
			tagIds?: Id<"tags">[];
		} = {};

		if (activeAccount) {
			args.accountId = activeAccount._id;
		}
		if (filters.cycleId) {
			args.cycleId = filters.cycleId as Id<"expense_cycles">;
		}
		if (filters.categoryId && filters.categoryId !== "uncategorized") {
			args.categoryId = filters.categoryId as Id<"categories">;
		}
		if (filters.tagIds.length > 0) {
			args.tagIds = filters.tagIds as Id<"tags">[];
		}

		return args;
	}, [activeAccount, filters]);

	const expenses = useQuery(api.expenses.list, expenseQueryArgs);
	const visibleExpenses = useMemo(() => {
		if (!expenses) {
			return [];
		}
		if (!filters.includeUncategorized) {
			return expenses;
		}
		return expenses.filter((expense) => !expense.categoryId);
	}, [expenses, filters.includeUncategorized]);

	useEffect(() => {
		const accountId = searchParams.get("account") ?? "";
		const category = searchParams.get("category");
		setFilters((current) => {
			const shouldSelectUncategorized = category === "uncategorized";
			if (
				current.accountId === accountId &&
				(!shouldSelectUncategorized || current.includeUncategorized)
			) {
				return current;
			}
			return {
				...current,
				accountId,
				categoryId: shouldSelectUncategorized
					? "uncategorized"
					: current.categoryId,
				includeUncategorized:
					shouldSelectUncategorized || current.includeUncategorized,
			};
		});
	}, [searchParams]);

	const columns = useMemo<ExpenseColumnDef[]>(() => {
		return [
			{
				accessorKey: "date",
				headerClassName: "w-[140px] px-4",
				className: "w-[140px] px-4",
				header: ({ column }) => (
					<Button
						className="-ml-4 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
						variant="ghost"
					>
						Date
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) =>
					format(parseISO(row.getValue("date") as string), "MMM d, yyyy"),
				footer: "Total",
			},
			{
				accessorKey: "amount",
				headerClassName: "w-[140px] px-4 text-right",
				className: "w-[140px] px-4 text-right",
				header: ({ column }) => (
					<div className="flex justify-end">
						<Button
							className="-mr-4 h-8"
							onClick={() =>
								column.toggleSorting(column.getIsSorted() === "asc")
							}
							variant="ghost"
						>
							Amount
							<ArrowUpDown className="ml-2 h-4 w-4" />
						</Button>
					</div>
				),
				cell: ({ row }) => (
					<span className="font-medium">
						{formatCurrency(row.getValue("amount") as number)}
					</span>
				),
				footer: ({ table }) => {
					const total = table
						.getFilteredRowModel()
						.rows.reduce(
							(sum: number, row) => sum + (row.getValue("amount") as number),
							0
						);
					return <div className="text-right">{formatCurrency(total)}</div>;
				},
			},
			{
				accessorKey: "categoryName",
				headerClassName: "px-4",
				className: "px-4",
				header: "Category",
				cell: ({ row }) => {
					const name = row.getValue("categoryName") as string;
					const icon = row.original.categoryIcon;
					const color = row.original.categoryTypeColor;
					const categoryId = row.original.categoryId;
					return (
						<div className="flex items-center gap-2">
							<div
								className="flex h-7 w-7 items-center justify-center rounded-lg border bg-background text-sm shadow-xs"
								style={{
									backgroundColor: color ? `${color}15` : undefined,
									borderColor: color ? `${color}30` : undefined,
								}}
							>
								{categoryId ? icon || "📦" : "❓"}
							</div>
							<span className="font-medium">{name || "Uncategorized"}</span>
						</div>
					);
				},
			},
			{
				accessorKey: "accountName",
				headerClassName: "px-4",
				className: "px-4",
				header: "Account",
				cell: ({ row }) => {
					const accountName = row.original.accountName;
					if (!accountName) {
						return <span className="text-muted-foreground text-sm">—</span>;
					}

					return (
						<div className="flex items-center gap-2">
							<div
								className="flex size-7 items-center justify-center rounded-lg border bg-background shadow-xs"
								style={
									row.original.accountTypeColor
										? { color: row.original.accountTypeColor }
										: undefined
								}
							>
								<AccountTypeIcon iconKey={row.original.accountTypeIcon} />
							</div>
							<div className="flex min-w-0 flex-col">
								<span className="truncate font-medium">{accountName}</span>
								{row.original.accountTypeName ? (
									<span className="text-muted-foreground text-xs">
										{row.original.accountTypeName}
									</span>
								) : null}
							</div>
						</div>
					);
				},
			},
			{
				accessorKey: "spentOn",
				headerClassName: "px-4",
				className: "px-4 w-full min-w-[200px]",
				header: "Note",
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.getValue("spentOn") || "—"}
					</span>
				),
			},
			{
				id: "tags",
				headerClassName: "px-4",
				className: "px-4",
				header: "Tags",
				cell: ({ row }) => {
					const tags = row.original.tagNames;
					if (!tags || tags.length === 0) {
						return <span className="text-muted-foreground text-sm">—</span>;
					}
					return (
						<div className="flex flex-wrap gap-1">
							{tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag}
								</Badge>
							))}
						</div>
					);
				},
			},
		];
	}, [formatCurrency]);

	const isLoading =
		expenses === undefined ||
		accounts === undefined ||
		cycles === undefined ||
		tags === undefined ||
		(filters.cycleId && categories === undefined);

	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader />
			</div>
		);
	}

	const toggleTag = (tagId: string) => {
		setFilters((current) => {
			const exists = current.tagIds.includes(tagId);
			return {
				...current,
				tagIds: exists
					? current.tagIds.filter((id) => id !== tagId)
					: [...current.tagIds, tagId],
			};
		});
	};

	const resetFilters = () => {
		setFilters({
			accountId: "",
			cycleId: "",
			categoryId: "",
			includeUncategorized: false,
			tagIds: [],
		});
		setGlobalSearch("");
		const nextSearchParams = new URLSearchParams(searchParams.toString());
		nextSearchParams.delete("account");
		nextSearchParams.delete("category");
		const query = nextSearchParams.toString();
		router.replace(query ? `/expenses?${query}` : "/expenses", {
			scroll: false,
		});
	};

	const clearCategoryFilter = () => {
		setFilters((current) => ({
			...current,
			categoryId: "",
			includeUncategorized: false,
		}));
		const nextSearchParams = new URLSearchParams(searchParams.toString());
		nextSearchParams.delete("category");
		const query = nextSearchParams.toString();
		router.replace(query ? `/expenses?${query}` : "/expenses", {
			scroll: false,
		});
	};

	const updateAccountFilter = (accountId: string) => {
		setFilters((current) => ({ ...current, accountId }));
		const nextSearchParams = new URLSearchParams(searchParams.toString());
		if (accountId) {
			nextSearchParams.set("account", accountId);
		} else {
			nextSearchParams.delete("account");
		}
		const query = nextSearchParams.toString();
		router.replace(query ? `/expenses?${query}` : "/expenses", {
			scroll: false,
		});
	};

	const handleDelete = async (expenseId: string) => {
		try {
			await removeExpense({ id: expenseId as Id<"expenses"> });
			toast.success("Expense deleted");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete expense"
			);
		}
	};

	return (
		<div className="space-y-8 py-3">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-4">
					<Button asChild size="icon" variant="ghost">
						<Link href="/dashboard">
							<ChevronLeft className="h-5 w-5" />
						</Link>
					</Button>
					<div>
						<h1 className="font-bold text-3xl tracking-tight">Expenses</h1>
						<p className="text-muted-foreground text-sm">
							Search and filter your expense history.
						</p>
					</div>
				</div>
				<Button asChild>
					<Link href="/expenses/new">
						<Plus className="mr-2 h-4 w-4" />
						Add Expense
					</Link>
				</Button>
			</div>

			<div className="space-y-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<div className="flex flex-1 flex-wrap items-center gap-2">
						<div className="relative max-w-sm flex-1">
							<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								className="h-10 bg-card/50 pl-9"
								onChange={(e) => setGlobalSearch(e.target.value)}
								placeholder="Search description..."
								value={globalSearch}
							/>
						</div>

						<Select
							onValueChange={(value) =>
								setFilters((current) => ({
									...current,
									cycleId: value === "all" ? "" : value,
									categoryId: value === "all" ? "" : current.categoryId,
								}))
							}
							value={filters.cycleId || "all"}
						>
							<SelectTrigger className="h-10 w-[160px] bg-card/50">
								<Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
								<SelectValue placeholder="Cycle" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All cycles</SelectItem>
								<SelectSeparator />

								{groupedCycles.current && (
									<SelectGroup>
										<SelectLabel className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
											Current
										</SelectLabel>
										<SelectItem value={groupedCycles.current._id}>
											{groupedCycles.current.name}
										</SelectItem>
									</SelectGroup>
								)}

								{groupedCycles.upcoming.length > 0 && (
									<SelectGroup>
										<SelectLabel className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
											Upcoming
										</SelectLabel>
										{groupedCycles.upcoming.map((cycle) => (
											<SelectItem key={cycle._id} value={cycle._id}>
												{cycle.name}
											</SelectItem>
										))}
									</SelectGroup>
								)}

								{groupedCycles.past.length > 0 && (
									<SelectGroup>
										<SelectLabel className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
											History
										</SelectLabel>
										{groupedCycles.past.map((cycle) => (
											<SelectItem key={cycle._id} value={cycle._id}>
												{cycle.name}
											</SelectItem>
										))}
									</SelectGroup>
								)}
							</SelectContent>
						</Select>

						<Select
							disabled={!filters.cycleId}
							onValueChange={(value) =>
								setFilters((current) => ({
									...current,
									categoryId: value === "all" ? "" : value,
									includeUncategorized: value === "uncategorized",
								}))
							}
							value={filters.categoryId || "all"}
						>
							<SelectTrigger className="h-10 w-[160px] bg-card/50">
								<Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
								<SelectValue placeholder="Category" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="all">All categories</SelectItem>
									<SelectItem value="uncategorized">Uncategorized</SelectItem>
									{categories?.map((category) => (
										<SelectItem key={category._id} value={category._id}>
											{category.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>

						<ExpenseAccountFilter
							accounts={accounts}
							onValueChange={updateAccountFilter}
							selectedAccountId={activeAccount?._id}
						/>
					</div>

					<div className="flex items-center gap-4 px-2">
						<div className="text-right">
							<p className="text-nowrap font-bold text-[10px] text-muted-foreground/60 uppercase leading-none tracking-widest">
								Total spent
							</p>
							<p className="font-bold text-xl tracking-tight">
								{formatCurrency(
									visibleExpenses.reduce((sum, e) => sum + e.amount, 0)
								)}
							</p>
						</div>
						<div className="hidden h-8 w-px bg-border md:block" />
						<div className="text-right">
							<p className="text-nowrap font-bold text-[10px] text-muted-foreground/60 uppercase leading-none tracking-widest">
								Count
							</p>
							<p className="font-bold text-xl tracking-tight">
								{visibleExpenses.length}
							</p>
						</div>
					</div>
				</div>

				{/* Active Filter Pills */}
				{(hasActiveFilters || (tags && tags.length > 0)) && (
					<div className="flex flex-wrap items-center gap-2 px-1">
						{filters.cycleId && (
							<Badge
								className="h-7 gap-1 border-primary/20 bg-primary/10 pr-1 pl-1 text-primary"
								variant="secondary"
							>
								<span className="px-1 font-bold text-[10px] uppercase opacity-60">
									Cycle
								</span>
								<span className="font-semibold text-xs">{activeCycleName}</span>
								<button
									className="rounded-full p-0.5 hover:bg-primary/20"
									onClick={() =>
										setFilters((f) => ({ ...f, cycleId: "", categoryId: "" }))
									}
									type="button"
								>
									<X className="h-3 w-3" />
								</button>
							</Badge>
						)}
						{filters.categoryId && (
							<Badge
								className="h-7 gap-1 border-primary/20 bg-primary/10 pr-1 pl-1 text-primary"
								variant="secondary"
							>
								<span className="px-1 font-bold text-[10px] uppercase opacity-60">
									Category
								</span>
								<span className="font-semibold text-xs">
									{activeCategoryName}
								</span>
								<button
									className="rounded-full p-0.5 hover:bg-primary/20"
									onClick={clearCategoryFilter}
									type="button"
								>
									<X className="h-3 w-3" />
								</button>
							</Badge>
						)}
						<ActiveAccountFilterBadge
							account={activeAccount}
							onClear={() => updateAccountFilter("")}
						/>
						{activeTags.map((tag) => (
							<Badge
								className="h-7 gap-1 border-amber-500/20 bg-amber-500/10 pr-1 pl-1 text-amber-600 dark:text-amber-400"
								key={tag._id}
								variant="secondary"
							>
								<Tag className="ml-1 h-3 w-3 opacity-60" />
								<span className="font-semibold text-xs">{tag.name}</span>
								<button
									className="rounded-full p-0.5 hover:bg-amber-500/20"
									onClick={() => toggleTag(tag._id)}
									type="button"
								>
									<X className="h-3 w-3" />
								</button>
							</Badge>
						))}

						{hasActiveFilters && (
							<Button
								className="h-7 px-2 font-bold text-[10px] text-muted-foreground uppercase tracking-wider hover:text-foreground"
								onClick={resetFilters}
								size="sm"
								variant="ghost"
							>
								Clear all
							</Button>
						)}

						{tags && tags.length > 0 && (
							<div className="ml-auto flex items-center gap-2">
								<span className="font-bold text-[10px] text-muted-foreground/40 uppercase tracking-widest">
									Quick Tags
								</span>
								<div className="flex gap-1">
									{tags
										.filter((tag) => !filters.tagIds.includes(tag._id))
										.slice(0, 5)
										.map((tag) => (
											<button
												className="rounded-full border border-border border-dashed px-2 py-0.5 font-medium text-[10px] transition-colors hover:border-solid hover:bg-accent"
												key={tag._id}
												onClick={() => toggleTag(tag._id)}
												type="button"
											>
												{tag.name}
											</button>
										))}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			<ExpenseResults
				columns={columns}
				expenses={visibleExpenses}
				globalSearch={globalSearch}
				onDelete={(expense) => handleDelete(expense._id)}
				onRowClick={(expense) => router.push(`/expenses/${expense._id}`)}
				onSearchChange={setGlobalSearch}
			/>
		</div>
	);
}

function ExpensesPageLoading() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Loader />
		</div>
	);
}

export default function ExpensesPage() {
	return (
		<Suspense fallback={<ExpensesPageLoading />}>
			<ExpensesPageContent />
		</Suspense>
	);
}
