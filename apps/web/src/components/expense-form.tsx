"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import {
	AlertCircle,
	Check,
	ChevronsUpDown,
	Info,
	Loader2,
	Plus,
	Save,
	Wallet,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AccountTypeIcon } from "@/components/account-type-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCurrency } from "@/hooks/use-currency";

const expenseSchema = z.object({
	amount: z.number().min(0.01, "Amount must be greater than 0"),
	accountId: z.string().optional(),
	categoryId: z.string().optional(),
	date: z.date(),
	spentOn: z.string(),
	tagIds: z.array(z.string()),
});

const AMOUNT_REGEX = /^\d*\.?\d{0,2}$/;

interface ExpenseFormValues {
	amount: number | undefined;
	accountId: string;
	categoryId: string;
	date: Date;
	spentOn: string;
	tagIds: string[];
}

interface CyclePreviewData {
	_id: Id<"expense_cycles">;
	name: string;
	startDate: string;
	endDate: string;
}

interface CategoryTypeItem {
	_id: Id<"category_types">;
	name: string;
	color?: string;
}

interface CategoryItem {
	_id: Id<"categories">;
	name: string;
	icon?: string;
	categoryTypeId?: Id<"category_types">;
	plannedAmount?: number;
}

interface AccountItem {
	_id: Id<"accounts">;
	accountTypeBalanceNature: "asset" | "liability";
	accountTypeColor: string | null;
	accountTypeIcon: string | null;
	accountTypeName: string;
	name: string;
	currentBalance: number;
	currency?: string;
	isArchived?: boolean;
}

interface ExpenseFormProps {
	onSuccess?: () => void;
	className?: string;
	expenseId?: Id<"expenses"> | string;
	defaultValues?: Partial<{
		amount: number;
		accountId: string;
		categoryId: string;
		date: Date;
		spentOn: string;
		tagIds: string[];
	}>;
}

function resolveDefaultAccountId(
	user: { defaultAccountId?: Id<"accounts"> } | undefined,
	recentExpenses: { accountId?: Id<"accounts"> }[] | undefined,
	accounts: AccountItem[] | undefined
): string | undefined {
	if (user === undefined || accounts === undefined) {
		return undefined;
	}

	const isActiveAccount = (accountId?: Id<"accounts">) =>
		Boolean(
			accountId &&
				accounts.some(
					(account) => account._id === accountId && !account.isArchived
				)
		);

	if (isActiveAccount(user.defaultAccountId)) {
		return user.defaultAccountId;
	}

	if (recentExpenses === undefined) {
		return undefined;
	}

	const recentAccountId = recentExpenses[0]?.accountId;
	return isActiveAccount(recentAccountId) ? recentAccountId : "";
}

export function ExpenseForm({
	onSuccess,
	className,
	expenseId,
	defaultValues,
}: ExpenseFormProps) {
	const createExpense = useMutation(api.expenses.create);
	const updateExpense = useMutation(api.expenses.update);
	const tags = useQuery(api.tags.list);
	const user = useQuery(api.users.get);
	const { format: formatCurrency } = useCurrency();
	const isEditing = Boolean(expenseId);
	const accounts = useQuery(
		api.accounts.list,
		isEditing ? { includeArchived: true } : {}
	);
	const [addAnother, setAddAnother] = useState(false);

	// Track date in local state to drive the cycle query
	const [selectedDate, setSelectedDate] = useState<Date>(
		defaultValues?.date || new Date()
	);

	// Fetch cycle based on selected date
	const cycle = useQuery(api.cycles.getCurrent, {
		date: format(selectedDate, "yyyy-MM-dd"),
	});

	// Fetch categories for that cycle
	const categories = useQuery(
		api.categories.list,
		cycle ? { cycleId: cycle._id } : "skip"
	);

	// Fetch category types for grouping
	const categoryTypes = useQuery(api.categories.listTypes);

	// Fetch most recent expense for smart default
	const recentExpenses = useQuery(api.expenses.listRecent, { limit: 1 });
	const defaultAccountId = resolveDefaultAccountId(
		user,
		recentExpenses,
		accounts
	);
	const defaultCategoryId = recentExpenses?.[0]?.categoryId || "";

	const submitExpense = async (value: ExpenseFormValues) => {
		if (!cycle) {
			toast.error(
				"No expense cycle found for this date. Please create one first."
			);
			return false;
		}

		if (!value.amount || value.amount <= 0) {
			toast.error("Please enter a valid amount");
			return false;
		}

		// Show soft warnings (non-blocking)
		const warnings = getSoftWarnings(value.amount, value.date);
		for (const warning of warnings) {
			toast.warning(warning);
		}

		const resolvedCategoryId = value.categoryId
			? (value.categoryId as Id<"categories">)
			: undefined;
		const resolvedAccountId = value.accountId
			? (value.accountId as Id<"accounts">)
			: undefined;

		if (isEditing) {
			await updateExpense({
				id: expenseId as Id<"expenses">,
				amount: Number(value.amount),
				accountId: resolvedAccountId ?? null,
				categoryId: resolvedCategoryId,
				date: format(value.date, "yyyy-MM-dd"),
				spentOn: value.spentOn || undefined,
				tagIds: (value.tagIds || []) as Id<"tags">[],
			});
			toast.success("Expense updated");
			return true;
		}

		await createExpense({
			amount: Number(value.amount),
			accountId: resolvedAccountId,
			categoryId: resolvedCategoryId,
			date: format(value.date, "yyyy-MM-dd"),
			spentOn: value.spentOn || undefined,
			tagIds: (value.tagIds || []) as Id<"tags">[],
		});
		toast.success("Expense added successfully");
		return true;
	};

	const form = useForm({
		defaultValues: {
			amount: defaultValues?.amount ?? (undefined as number | undefined),
			accountId: defaultValues?.accountId ?? "",
			categoryId: defaultValues?.categoryId ?? "",
			date: defaultValues?.date ?? new Date(),
			spentOn: defaultValues?.spentOn ?? "",
			tagIds: defaultValues?.tagIds ?? ([] as string[]),
		},
		validators: {
			onChange: ({ value }) => {
				const result = expenseSchema.partial().safeParse(value);
				if (!result.success) {
					return result.error.flatten().fieldErrors;
				}
				return undefined;
			},
		},
		onSubmit: async ({ value }) => {
			try {
				const success = await submitExpense(value);
				if (!success) {
					return;
				}

				if (!isEditing && addAnother) {
					form.reset();
					setTimeout(() => {
						form.setFieldValue("date", value.date);
						form.setFieldValue("accountId", value.accountId);
						form.setFieldValue("categoryId", value.categoryId);
						form.setFieldValue("tagIds", value.tagIds);
					}, 0);
				} else {
					form.reset();
					onSuccess?.();
				}
			} catch (error) {
				console.error(error);
				toast.error(
					isEditing ? "Failed to update expense" : "Failed to add expense"
				);
			}
		},
	});

	// Set default category when recent expenses load
	useEffect(() => {
		if (!isEditing && defaultCategoryId && !form.state.values.categoryId) {
			form.setFieldValue("categoryId", defaultCategoryId);
		}
	}, [defaultCategoryId, isEditing, form]);

	useEffect(() => {
		if (!isEditing && defaultAccountId && !form.state.values.accountId) {
			form.setFieldValue("accountId", defaultAccountId);
		}
	}, [defaultAccountId, isEditing, form]);

	return (
		<div className={className}>
			<form
				className="space-y-5"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				{/* Amount - Large and Prominent */}
				<form.Field name="amount">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Amount</Label>
							<div className="relative">
								<Input
									autoFocus
									className=""
									id={field.name}
									inputMode="decimal"
									onBlur={field.handleBlur}
									onChange={(e) => {
										const val = e.target.value;
										// Allow empty, numbers, and single decimal point
										if (val === "" || AMOUNT_REGEX.test(val)) {
											field.handleChange(val === "" ? undefined : Number(val));
										}
									}}
									placeholder="0.00"
									type="text"
									value={
										field.state.value === undefined
											? ""
											: field.state.value.toString()
									}
								/>
							</div>
							{field.state.meta.isTouched &&
								field.state.meta.errors.length > 0 && (
									<p className="flex items-center gap-1 text-destructive text-sm">
										<AlertCircle className="h-3 w-3" />
										{field.state.meta.errors.join(", ")}
									</p>
								)}
						</div>
					)}
				</form.Field>

				{/* Date with Cycle Preview */}
				<form.Field name="date">
					{(field) => (
						<div className="space-y-2">
							<Label>Date</Label>
							<DatePicker
								date={field.state.value}
								onDateChange={(date) => {
									if (date) {
										field.handleChange(date);
										setSelectedDate(date);
									}
								}}
							/>
							<CyclePreview cycle={cycle} />
						</div>
					)}
				</form.Field>

				{/* Account */}
				<form.Field name="accountId">
					{(field) => (
						<div className="space-y-2">
							<Label>
								Account{" "}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<p className="text-muted-foreground text-xs">
								Choose where this expense was paid from.
							</p>
							<AccountCombobox
								accounts={accounts}
								formatCurrency={formatCurrency}
								onChange={field.handleChange}
								selectedAccountId={field.state.value}
							/>
						</div>
					)}
				</form.Field>

				{/* Category - Grouped by Type */}
				<form.Field name="categoryId">
					{(field) => (
						<div className="space-y-2">
							<Label>Category</Label>
							<p className="text-muted-foreground text-xs">
								Search categories or create a new one for this cycle.
							</p>
							{cycle === undefined && (
								<div className="h-10 w-full animate-pulse rounded-md bg-muted" />
							)}
							{cycle && (
								<CategoryCombobox
									categories={categories}
									cycle={cycle}
									formatCurrency={formatCurrency}
									onChange={field.handleChange}
									selectedCategoryId={field.state.value}
									types={categoryTypes}
								/>
							)}
							{cycle === null && (
								<div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
									<AlertCircle className="h-4 w-4 shrink-0" />
									<div className="flex-1">
										<p className="font-medium">No cycle for this date</p>
										<p className="text-amber-700 text-xs">
											Create a cycle to add expenses
										</p>
									</div>
									<Button asChild size="sm" variant="outline">
										<Link href="/cycles/new">Create</Link>
									</Button>
								</div>
							)}
						</div>
					)}
				</form.Field>

				{/* Note / Spent On */}
				<form.Field name="spentOn">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>
								Note <span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								id={field.name}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="What was this for? e.g., Lunch, Uber, Groceries"
								value={field.state.value || ""}
							/>
						</div>
					)}
				</form.Field>

				{/* Tags - Enhanced Multi-select */}
				<form.Field name="tagIds">
					{(field) => (
						<div className="space-y-2">
							<Label>
								Tags <span className="text-muted-foreground">(optional)</span>
							</Label>
							<p className="text-muted-foreground text-xs">
								Use tags like &quot;Work&quot;, &quot;Travel&quot;, or
								&quot;Recurring&quot;.
							</p>
							<TagMultiSelect
								onChange={field.handleChange}
								selectedTagIds={field.state.value || []}
								tags={tags}
							/>
						</div>
					)}
				</form.Field>

				{/* Submit Actions */}
				<div className="flex flex-col gap-4">
					{!isEditing && (
						<div className="flex items-center space-x-2 px-1">
							<Switch
								checked={addAnother}
								id="add-multiple"
								onCheckedChange={setAddAnother}
							/>
							<Label
								className="cursor-pointer font-normal text-foreground text-sm"
								htmlFor="add-multiple"
							>
								Add another expense
							</Label>
						</div>
					)}
					<Button
						className="w-full"
						disabled={form.state.isSubmitting || !cycle}
						size="lg"
						type="submit"
					>
						{form.state.isSubmitting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{isEditing ? "Saving..." : "Adding..."}
							</>
						) : (
							<>
								{isEditing ? (
									<Save className="mr-2 h-4 w-4" />
								) : (
									<Plus className="mr-2 h-4 w-4" />
								)}
								{isEditing ? "Save Changes" : "Add Expense"}
							</>
						)}
					</Button>
				</div>
			</form>
		</div>
	);
}

interface TagMultiSelectProps {
	tags:
		| Array<{
				_id: Id<"tags">;
				name: string;
		  }>
		| undefined;
	selectedTagIds: string[];
	onChange: (tagIds: string[]) => void;
}

function TagMultiSelect({
	tags,
	selectedTagIds,
	onChange,
}: TagMultiSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const createTag = useMutation(api.tags.create);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const sortedTags = useMemo(() => {
		return [...(tags || [])].sort((a, b) => a.name.localeCompare(b.name));
	}, [tags]);

	const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);

	const selectedTags = useMemo(() => {
		return sortedTags.filter((tag) => selectedSet.has(tag._id));
	}, [sortedTags, selectedSet]);

	const unselectedTags = useMemo(() => {
		return sortedTags.filter((tag) => !selectedSet.has(tag._id));
	}, [sortedTags, selectedSet]);

	const normalizedQuery = query.trim().toLowerCase();

	const filteredSelected = useMemo(() => {
		if (normalizedQuery.length === 0) {
			return selectedTags;
		}
		return selectedTags.filter((tag) =>
			tag.name.toLowerCase().includes(normalizedQuery)
		);
	}, [normalizedQuery, selectedTags]);

	const filteredUnselected = useMemo(() => {
		if (normalizedQuery.length === 0) {
			return unselectedTags;
		}
		return unselectedTags.filter((tag) =>
			tag.name.toLowerCase().includes(normalizedQuery)
		);
	}, [normalizedQuery, unselectedTags]);

	const hasExactMatch = useMemo(() => {
		if (normalizedQuery.length === 0) {
			return false;
		}
		return sortedTags.some(
			(tag) => tag.name.trim().toLowerCase() === normalizedQuery
		);
	}, [normalizedQuery, sortedTags]);

	const canCreate = normalizedQuery.length > 0 && !hasExactMatch;

	const toggleTag = (tagId: string) => {
		if (selectedSet.has(tagId)) {
			onChange(selectedTagIds.filter((id) => id !== tagId));
			return;
		}
		onChange([...selectedTagIds, tagId]);
	};

	const handleCreateTag = async () => {
		const nextName = query.trim();
		if (nextName.length === 0) {
			return;
		}
		const nextNameLower = nextName.toLowerCase();
		const duplicate = sortedTags.some(
			(tag) => tag.name.trim().toLowerCase() === nextNameLower
		);
		if (duplicate) {
			toast.error("Tag already exists");
			return;
		}

		try {
			const createdId = await createTag({ name: nextName });
			onChange([...selectedTagIds, createdId]);
			setQuery("");
			toast.success("Tag created");
			setTimeout(() => {
				inputRef.current?.focus();
			}, 0);
		} catch {
			toast.error("Failed to create tag");
		}
	};

	const triggerLabel =
		selectedTagIds.length === 0
			? "Add tags..."
			: `${selectedTagIds.length} tag${selectedTagIds.length === 1 ? "" : "s"} selected`;

	return (
		<div className="space-y-2">
			{selectedTags.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{selectedTags.map((tag) => (
						<span
							className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs"
							key={tag._id}
						>
							{tag.name}
							<button
								aria-label={`Remove tag ${tag.name}`}
								className="rounded-full p-0.5 text-foreground/70 transition-colors hover:bg-primary/20 hover:text-foreground"
								onClick={() => toggleTag(tag._id)}
								type="button"
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					))}
				</div>
			)}

			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-expanded={open}
						className="w-full justify-between"
						role="combobox"
						type="button"
						variant="outline"
					>
						{triggerLabel}
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[--radix-popover-trigger-width] p-0"
				>
					<Command>
						<CommandInput
							onValueChange={setQuery}
							placeholder="Search tags..."
							ref={inputRef}
							value={query}
						/>
						<CommandList onWheel={(e) => e.stopPropagation()}>
							{tags === undefined ? (
								<div className="space-y-2 p-3">
									<div className="h-4 animate-pulse rounded bg-muted" />
									<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
								</div>
							) : (
								<>
									<div className="border-b px-3 py-2 text-muted-foreground text-xs">
										Type to search tags. To create a new one, type a name and
										choose{" "}
										<span className="font-medium">Create &quot;...&quot;</span>.
									</div>
									<CommandEmpty>
										{normalizedQuery.length > 0
											? "No matching tags."
											: "No tags yet. Create your first tag."}
									</CommandEmpty>
									{filteredSelected.length > 0 && (
										<CommandGroup heading="Selected">
											{filteredSelected.map((tag) => (
												<CommandItem
													key={tag._id}
													onSelect={() => toggleTag(tag._id)}
													value={tag.name}
												>
													<Check className="mr-2 h-4 w-4 opacity-100" />
													{tag.name}
												</CommandItem>
											))}
										</CommandGroup>
									)}
									{filteredUnselected.length > 0 && (
										<CommandGroup heading="Available">
											{filteredUnselected.map((tag) => (
												<CommandItem
													key={tag._id}
													onSelect={() => toggleTag(tag._id)}
													value={tag.name}
												>
													<Check className="mr-2 h-4 w-4 opacity-0" />
													{tag.name}
												</CommandItem>
											))}
										</CommandGroup>
									)}
									{canCreate && (
										<CommandGroup heading="Actions">
											<CommandItem
												onSelect={handleCreateTag}
												value={`create-${query}`}
											>
												<Plus className="mr-2 h-4 w-4" />
												Create &quot;{query.trim()}&quot;
											</CommandItem>
										</CommandGroup>
									)}
								</>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

interface AccountComboboxProps {
	accounts: AccountItem[] | undefined;
	selectedAccountId: string;
	onChange: (accountId: string) => void;
	formatCurrency: (amount: number) => string;
}

function AccountCombobox({
	accounts,
	selectedAccountId,
	onChange,
	formatCurrency,
}: AccountComboboxProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const normalizedQuery = query.trim().toLowerCase();
	const allAccounts = accounts || [];
	const selectedAccount = useMemo(() => {
		return allAccounts.find((account) => account._id === selectedAccountId);
	}, [allAccounts, selectedAccountId]);
	const filteredAccounts = useMemo(() => {
		if (normalizedQuery.length === 0) {
			return allAccounts;
		}
		return allAccounts.filter((account) =>
			`${account.name} ${account.accountTypeName}`
				.toLowerCase()
				.includes(normalizedQuery)
		);
	}, [allAccounts, normalizedQuery]);

	const handleSelectAccount = (accountId: string) => {
		onChange(accountId);
		setOpen(false);
	};

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className="w-full justify-between"
					role="combobox"
					type="button"
					variant="outline"
				>
					<span className="inline-flex max-w-[85%] items-center gap-2 truncate">
						{selectedAccount ? (
							<span
								className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted"
								style={
									selectedAccount.accountTypeColor
										? { color: selectedAccount.accountTypeColor }
										: undefined
								}
							>
								<AccountTypeIcon iconKey={selectedAccount.accountTypeIcon} />
							</span>
						) : (
							<Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
						)}
						<span className="truncate">
							{selectedAccount ? selectedAccount.name : "No account selected"}
						</span>
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[--radix-popover-trigger-width] p-0"
			>
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={setQuery}
						placeholder="Search accounts..."
						value={query}
					/>
					<CommandList onWheel={(e) => e.stopPropagation()}>
						{accounts === undefined ? (
							<div className="flex flex-col gap-2 p-3">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-2/3" />
							</div>
						) : (
							<>
								<CommandGroup heading="General">
									<CommandItem
										onSelect={() => handleSelectAccount("")}
										value="no-account"
									>
										<Check
											className={`mr-2 h-4 w-4 ${
												selectedAccountId ? "opacity-0" : "opacity-100"
											}`}
										/>
										<div className="flex min-w-0 flex-col">
											<span>No account selected</span>
											<span className="text-muted-foreground text-xs">
												Do not change an account balance
											</span>
										</div>
									</CommandItem>
								</CommandGroup>

								{filteredAccounts.length > 0 ? (
									<CommandGroup heading="Accounts">
										{filteredAccounts.map((account) => (
											<CommandItem
												key={account._id}
												onSelect={() => handleSelectAccount(account._id)}
												value={`${account.name}-${account.accountTypeName}`}
											>
												<Check
													className={`mr-2 h-4 w-4 ${
														selectedAccountId === account._id
															? "opacity-100"
															: "opacity-0"
													}`}
												/>
												<div className="flex w-full min-w-0 items-center justify-between gap-2">
													<div className="flex min-w-0 items-center gap-2">
														<span
															className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted"
															style={
																account.accountTypeColor
																	? { color: account.accountTypeColor }
																	: undefined
															}
														>
															<AccountTypeIcon
																iconKey={account.accountTypeIcon}
															/>
														</span>
														<div className="flex min-w-0 flex-col">
															<span className="truncate">{account.name}</span>
															<span className="text-muted-foreground text-xs">
																{account.accountTypeName} ·{" "}
																{account.accountTypeBalanceNature ===
																"liability"
																	? "Money owed"
																	: "Money available"}
															</span>
														</div>
													</div>
													<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
														{formatCurrency(account.currentBalance)}
													</span>
												</div>
											</CommandItem>
										))}
									</CommandGroup>
								) : null}

								{filteredAccounts.length === 0 && allAccounts.length === 0 ? (
									<div className="flex flex-col items-center gap-3 px-3 py-5 text-center text-sm">
										<div>
											<p className="font-medium">No accounts yet</p>
											<p className="mt-1 text-muted-foreground text-xs">
												Add one to keep this expense connected to a balance.
											</p>
										</div>
										<Button asChild size="sm" variant="outline">
											<Link href="/accounts/new">
												<Plus data-icon="inline-start" />
												Create account
											</Link>
										</Button>
									</div>
								) : null}
								{filteredAccounts.length === 0 && allAccounts.length > 0 ? (
									<p className="px-3 py-6 text-center text-muted-foreground text-sm">
										No matching accounts.
									</p>
								) : null}
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

interface CategoryComboboxProps {
	cycle: CyclePreviewData;
	categories: CategoryItem[] | undefined;
	types: CategoryTypeItem[] | undefined;
	selectedCategoryId: string;
	onChange: (categoryId: string) => void;
	formatCurrency: (amount: number) => string;
}

function CategoryCombobox({
	cycle,
	categories,
	types,
	selectedCategoryId,
	onChange,
	formatCurrency,
}: CategoryComboboxProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const normalizedQuery = query.trim().toLowerCase();
	const allCategories = categories || [];
	const filteredCategories = useMemo(() => {
		if (normalizedQuery.length === 0) {
			return allCategories;
		}
		return allCategories.filter((category) =>
			category.name.toLowerCase().includes(normalizedQuery)
		);
	}, [allCategories, normalizedQuery]);

	const selectedCategory = useMemo(() => {
		return allCategories.find(
			(category) => category._id === selectedCategoryId
		);
	}, [allCategories, selectedCategoryId]);

	const grouped = useMemo(() => {
		const byType = new Map<string, CategoryItem[]>();
		const untyped: CategoryItem[] = [];

		for (const category of filteredCategories) {
			if (category.categoryTypeId) {
				const typeId = category.categoryTypeId;
				if (!byType.has(typeId)) {
					byType.set(typeId, []);
				}
				byType.get(typeId)?.push(category);
				continue;
			}
			untyped.push(category);
		}

		return { byType, untyped };
	}, [filteredCategories]);

	const hasAnyResults = filteredCategories.length > 0;

	const handleSelectCategory = (categoryId: string) => {
		onChange(categoryId);
		setOpen(false);
	};

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className="w-full justify-between"
					role="combobox"
					type="button"
					variant="outline"
				>
					<span className="inline-flex max-w-[85%] items-center gap-2 truncate">
						<span>{selectedCategory?.icon || "❓"}</span>
						<span className="truncate">
							{selectedCategory ? selectedCategory.name : "Uncategorized"}
						</span>
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[--radix-popover-trigger-width] p-0"
			>
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={setQuery}
						placeholder="Search categories..."
						value={query}
					/>
					<CommandList onWheel={(e) => e.stopPropagation()}>
						<div className="border-b px-3 py-2 text-muted-foreground text-xs">
							Type to search. Can&apos;t find one? Create a new category.
						</div>
						{categories === undefined ? (
							<div className="space-y-2 p-3">
								<div className="h-4 animate-pulse rounded bg-muted" />
								<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
							</div>
						) : (
							<>
								<CommandGroup heading="General">
									<CommandItem
										onSelect={() => handleSelectCategory("")}
										value="uncategorized"
									>
										<Check
											className={`mr-2 h-4 w-4 ${
												selectedCategoryId ? "opacity-0" : "opacity-100"
											}`}
										/>
										<div className="flex items-center gap-2">
											<span>❓</span>
											<span>Uncategorized</span>
										</div>
									</CommandItem>
								</CommandGroup>

								{types?.map((type) => {
									const typeCategories = grouped.byType.get(type._id);
									if (!typeCategories || typeCategories.length === 0) {
										return null;
									}

									return (
										<CommandGroup heading={type.name} key={type._id}>
											{typeCategories.map((category) => (
												<CommandItem
													key={category._id}
													onSelect={() => handleSelectCategory(category._id)}
													value={category.name}
												>
													<Check
														className={`mr-2 h-4 w-4 ${
															selectedCategoryId === category._id
																? "opacity-100"
																: "opacity-0"
														}`}
													/>
													<div className="flex w-full min-w-0 items-center justify-between gap-2">
														<div className="flex min-w-0 items-center gap-2">
															<span>{category.icon || "📦"}</span>
															<span className="truncate">{category.name}</span>
														</div>
														{category.plannedAmount !== undefined && (
															<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
																{formatCurrency(category.plannedAmount)}
															</span>
														)}
													</div>
												</CommandItem>
											))}
										</CommandGroup>
									);
								})}

								{grouped.untyped.length > 0 && (
									<CommandGroup heading="Other">
										{grouped.untyped.map((category) => (
											<CommandItem
												key={category._id}
												onSelect={() => handleSelectCategory(category._id)}
												value={category.name}
											>
												<Check
													className={`mr-2 h-4 w-4 ${
														selectedCategoryId === category._id
															? "opacity-100"
															: "opacity-0"
													}`}
												/>
												<div className="flex w-full min-w-0 items-center justify-between gap-2">
													<div className="flex min-w-0 items-center gap-2">
														<span>{category.icon || "📦"}</span>
														<span className="truncate">{category.name}</span>
													</div>
													{category.plannedAmount !== undefined && (
														<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
															{formatCurrency(category.plannedAmount)}
														</span>
													)}
												</div>
											</CommandItem>
										))}
									</CommandGroup>
								)}

								{!hasAnyResults && (
									<CommandEmpty>
										{normalizedQuery.length > 0
											? "No matching categories."
											: "No categories in this cycle yet."}
									</CommandEmpty>
								)}

								<CommandGroup heading="Actions">
									<CommandItem
										onSelect={() => {
											setOpen(false);
											router.push(`/categories/new?id=${cycle._id}`);
										}}
										value="create-new-category"
									>
										<Plus className="mr-2 h-4 w-4" />
										Create new category
									</CommandItem>
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

// Cycle Preview Component
function CyclePreview({
	cycle,
}: {
	cycle: CyclePreviewData | null | undefined;
}) {
	if (!cycle) {
		return null;
	}

	const startDate = new Date(cycle.startDate);
	const endDate = new Date(cycle.endDate);
	const today = new Date();
	const daysRemaining = differenceInDays(endDate, today);
	const isActive = today >= startDate && today < endDate;

	return (
		<div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
			<Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div className="flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<p className="font-medium">
						Will be added to{" "}
						<span className="text-foreground">{cycle.name}</span>
					</p>
					{isActive && (
						<Badge className="text-xs" variant="secondary">
							Active
						</Badge>
					)}
				</div>
				<p className="text-muted-foreground text-xs">
					{format(startDate, "MMM d")} – {format(endDate, "MMM d, yyyy")}
					{isActive && daysRemaining > 0 && (
						<span className="ml-2">• {daysRemaining} days remaining</span>
					)}
				</p>
			</div>
		</div>
	);
}

// Soft validation warnings helper
function getSoftWarnings(amount: number, date: Date): string[] {
	const warnings: string[] = [];
	const today = new Date();
	const daysDiff = differenceInDays(date, today);

	// Large amount warning
	if (amount > 10_000) {
		warnings.push("That's a big expense! Double-check the amount.");
	}

	// Old date warning
	if (daysDiff < -90) {
		const timeAgo = formatDistanceToNow(date, { addSuffix: true });
		warnings.push(`This expense is from ${timeAgo}. Is this correct?`);
	}

	// Future date warning
	if (daysDiff > 30) {
		warnings.push("This is a future expense.");
	}

	return warnings;
}
