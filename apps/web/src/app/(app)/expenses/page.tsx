"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
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
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AccountTypeIcon } from "@/components/account-type-icon";
import {
	type ActionSource,
	ActionSourceIndicator,
} from "@/components/action-source-indicator";
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
import { reportError } from "@/lib/report-error";
import { SortHeader } from "../data/sort-header";

interface Filters {
	accountId: string;
	categoryId: string;
	cycleId: string;
	includeUncategorized: boolean;
	tagIds: string[];
}

interface ExpenseRow {
	_id: string;
	accountName?: string | null;
	accountTypeColor?: string | null;
	accountTypeIcon?: string | null;
	accountTypeName?: string | null;
	amount: number;
	categoryIcon?: string | null;
	categoryId?: string | null;
	categoryName?: string | null;
	categoryTypeColor?: string | null;
	createdSource?: ActionSource;
	date: string;
	lastModifiedSource?: ActionSource;
	revision?: number;
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
	const changeAccount = useCallback(
		(value: string) => onValueChange(value === "all" ? "" : value),
		[onValueChange]
	);
	const activeAccounts = accounts.filter((account) => !account.isArchived);
	const archivedAccounts = accounts.filter((account) => account.isArchived);

	return (
		<Select onValueChange={changeAccount} value={selectedAccountId ?? "all"}>
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

function ActiveTagBadge({
	tag,
	onToggle,
}: {
	tag: { _id: string; name: string };
	onToggle: (id: string) => void;
}) {
	const toggle = useCallback(() => onToggle(tag._id), [onToggle, tag._id]);
	return (
		<Badge
			className="h-7 gap-1 border-amber-500/20 bg-amber-500/10 pr-1 pl-1 text-amber-600 dark:text-amber-400"
			variant="secondary"
		>
			<Tag className="ml-1 h-3 w-3 opacity-60" />
			<span className="font-semibold text-xs">{tag.name}</span>
			<button
				className="rounded-full p-0.5 hover:bg-amber-500/20"
				onClick={toggle}
				type="button"
			>
				<X className="h-3 w-3" />
			</button>
		</Badge>
	);
}

function QuickTagButton({
	tag,
	onToggle,
}: {
	tag: { _id: string; name: string };
	onToggle: (id: string) => void;
}) {
	const toggle = useCallback(() => onToggle(tag._id), [onToggle, tag._id]);
	return (
		<button
			className="rounded-full border border-border border-dashed px-2 py-0.5 font-medium text-[10px] transition-colors hover:border-solid hover:bg-accent"
			onClick={toggle}
			type="button"
		>
			{tag.name}
		</button>
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
			categoryId,
			cycleId: "",
			includeUncategorized: categoryId === "uncategorized",
			tagIds: [],
		};
	});
	const [globalSearch, setGlobalSearch] = useState("");

	const cycles = useQuery(api.cycles.list);
	const accounts = useQuery(api.accounts.list, { includeArchived: true });

	const groupedCycles = useMemo(() => {
		if (!cycles) {
			return { current: null, past: [], upcoming: [] };
		}
		const today = format(new Date(), "yyyy-MM-dd");
		return {
			current:
				cycles.find((c) => today >= c.startDate && today <= c.endDate) || null,
			past: cycles.filter((c) => c.endDate < today),
			upcoming: cycles.filter((c) => c.startDate > today),
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

	const columns = useMemo<ExpenseColumnDef[]>(
		() => [
			{
				accessorKey: "date",
				cell: ({ row }) =>
					format(parseISO(row.getValue("date") as string), "MMM d, yyyy"),
				className: "w-[140px] px-4",
				footer: "Total",
				header: ({ column }) => (
					<SortHeader className="-ml-4 h-8" column={column}>
						Date
					</SortHeader>
				),
				headerClassName: "w-[140px] px-4",
			},
			{
				accessorKey: "amount",
				cell: ({ row }) => (
					<span className="font-medium">
						{formatCurrency(row.getValue("amount") as number)}
					</span>
				),
				className: "w-[140px] px-4 text-right",
				footer: ({ table }) => {
					const total = table
						.getFilteredRowModel()
						.rows.reduce(
							(sum: number, row) => sum + (row.getValue("amount") as number),
							0
						);
					return <div className="text-right">{formatCurrency(total)}</div>;
				},
				header: ({ column }) => (
					<div className="flex justify-end">
						<SortHeader className="-mr-4 h-8" column={column}>
							Amount
						</SortHeader>
					</div>
				),
				headerClassName: "w-[140px] px-4 text-right",
			},
			{
				accessorKey: "categoryName",
				cell: ({ row }) => {
					const name = row.getValue("categoryName") as string;
					const {
						categoryIcon: icon,
						categoryTypeColor: color,
						categoryId,
					} = row.original;
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
				className: "px-4",
				header: "Category",
				headerClassName: "px-4",
			},
			{
				accessorKey: "accountName",
				cell: ({ row }) => {
					const { accountName } = row.original;
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
				className: "px-4",
				header: "Account",
				headerClassName: "px-4",
			},
			{
				accessorKey: "spentOn",
				cell: ({ row }) => (
					<div className="flex items-center gap-1.5">
						<ActionSourceIndicator
							action={(row.original.revision ?? 1) > 1 ? "updated" : "added"}
							source={
								row.original.lastModifiedSource ?? row.original.createdSource
							}
						/>
						<span className="text-muted-foreground">
							{row.getValue("spentOn") || "—"}
						</span>
					</div>
				),
				className: "px-4 w-full min-w-[200px]",
				header: "Note",
				headerClassName: "px-4",
			},
			{
				cell: ({ row }) => {
					const { tagNames } = row.original;
					if (!tagNames || tagNames.length === 0) {
						return <span className="text-muted-foreground text-sm">—</span>;
					}
					return (
						<div className="flex flex-wrap gap-1">
							{tagNames.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag}
								</Badge>
							))}
						</div>
					);
				},
				className: "px-4",
				header: "Tags",
				headerClassName: "px-4",
				id: "tags",
			},
		],
		[formatCurrency]
	);

	const isLoading =
		expenses === undefined ||
		accounts === undefined ||
		cycles === undefined ||
		tags === undefined ||
		(filters.cycleId && categories === undefined);

	const toggleTag = useCallback((tagId: string) => {
		setFilters((current) => {
			const exists = current.tagIds.includes(tagId);
			return {
				...current,
				tagIds: exists
					? current.tagIds.filter((id) => id !== tagId)
					: [...current.tagIds, tagId],
			};
		});
	}, []);

	const resetFilters = useCallback(() => {
		setFilters({
			accountId: "",
			categoryId: "",
			cycleId: "",
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
	}, [router, searchParams]);

	const clearCategoryFilter = useCallback(() => {
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
	}, [router, searchParams]);

	const updateAccountFilter = useCallback(
		(accountId: string) => {
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
		},
		[router, searchParams]
	);

	const handleDelete = useCallback(
		async (expenseId: string) => {
			try {
				await removeExpense({ id: expenseId as Id<"expenses"> });
				toast.success("Expense deleted");
			} catch (error) {
				reportError(error, { feature: "expenses", operation: "delete" });
				toast.error(
					error instanceof Error ? error.message : "Failed to delete expense"
				);
			}
		},
		[removeExpense]
	);

	const changeSearch = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) =>
			setGlobalSearch(event.target.value),
		[]
	);
	const clearAccount = useCallback(
		() => updateAccountFilter(""),
		[updateAccountFilter]
	);
	const clearCycle = useCallback(
		() =>
			setFilters((current) => ({ ...current, categoryId: "", cycleId: "" })),
		[]
	);
	const openRow = useCallback(
		(expense: ExpenseRow) => router.push(`/expenses/${expense._id}`),
		[router]
	);
	const deleteRow = useCallback(
		(expense: ExpenseRow) => handleDelete(expense._id),
		[handleDelete]
	);

	const changeCycle = useCallback(
		(value: string) =>
			setFilters((current) => ({
				...current,
				categoryId: value === "all" ? "" : current.categoryId,
				cycleId: value === "all" ? "" : value,
			})),
		[]
	);
	const changeCategory = useCallback(
		(value: string) =>
			setFilters((current) => ({
				...current,
				categoryId: value === "all" ? "" : value,
				includeUncategorized: value === "uncategorized",
			})),
		[]
	);
	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader />
			</div>
		);
	}

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
								onChange={changeSearch}
								placeholder="Search description..."
								value={globalSearch}
							/>
						</div>

						<Select
							onValueChange={changeCycle}
							value={filters.cycleId || "all"}
						>
							<SelectTrigger className="h-10 w-[160px] bg-card/50">
								<Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
								<SelectValue placeholder="Cycle" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All cycles</SelectItem>
								<SelectSeparator />

								{groupedCycles.current !== null && (
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
							onValueChange={changeCategory}
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

				{(hasActiveFilters || (tags !== undefined && tags.length > 0)) && (
					<div className="flex flex-wrap items-center gap-2 px-1">
						{filters.cycleId !== "" && (
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
									onClick={clearCycle}
									type="button"
								>
									<X className="h-3 w-3" />
								</button>
							</Badge>
						)}
						{filters.categoryId !== "" && (
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
							onClear={clearAccount}
						/>
						{activeTags.map((tag) => (
							<ActiveTagBadge key={tag._id} onToggle={toggleTag} tag={tag} />
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

						{tags !== undefined && tags.length > 0 && (
							<div className="ml-auto flex items-center gap-2">
								<span className="font-bold text-[10px] text-muted-foreground/40 uppercase tracking-widest">
									Quick Tags
								</span>
								<div className="flex gap-1">
									{tags
										.filter((tag) => !filters.tagIds.includes(tag._id))
										.slice(0, 5)
										.map((tag) => (
											<QuickTagButton
												key={tag._id}
												onToggle={toggleTag}
												tag={tag}
											/>
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
				onDelete={deleteRow}
				onRowClick={openRow}
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
