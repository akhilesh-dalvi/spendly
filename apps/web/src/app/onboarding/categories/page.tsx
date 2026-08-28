"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowRight,
	Layers3,
	LoaderCircle,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryTypeModal } from "@/components/category-type-modal";
import { EmojiPicker } from "@/components/emoji-picker";
import { OnboardingStepControls } from "@/components/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getCurrencySymbol } from "@/lib/currencies";

interface CategoryDraft {
	categoryId?: Id<"categories">;
	categoryTypeId?: string;
	icon: string;
	id: string;
	name: string;
	plannedAmount: string;
}

const SUGGESTED_CATEGORIES = [
	{ icon: "🏠", name: "Rent", suggestedType: "Needs" },
	{ icon: "🛒", name: "Groceries", suggestedType: "Needs" },
	{ icon: "🚌", name: "Transport", suggestedType: "Needs" },
	{ icon: "💡", name: "Utilities", suggestedType: "Needs" },
	{ icon: "🛍️", name: "Shopping", suggestedType: "Wants" },
	{ icon: "🎬", name: "Entertainment", suggestedType: "Wants" },
	{ icon: "🏦", name: "Savings", suggestedType: "Savings" },
] as const;

const ADD_CATEGORY_TYPE_VALUE = "__add-category-type__";

const createDraftId = (): string =>
	globalThis.crypto?.randomUUID?.() ??
	`category-${Date.now()}-${Math.random()}`;

export default function OnboardingCategoriesPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const onboardingState = useQuery(api.users.getOnboardingState);
	const cycleId = onboardingState?.cycle?._id;
	const categoryTypes = useQuery(api.categories.listTypes);
	const existingCategories = useQuery(
		api.categories.list,
		cycleId ? { cycleId } : "skip"
	);
	const saveCategories = useMutation(api.categories.saveOnboardingCategories);
	const advanceOnboarding = useMutation(api.users.advanceOnboarding);
	const [categories, setCategories] = useState<CategoryDraft[]>([]);
	const [removedCategories, setRemovedCategories] = useState<CategoryDraft[]>(
		[]
	);
	const [isSaving, setIsSaving] = useState(false);
	const [isSkipping, setIsSkipping] = useState(false);
	const [error, setError] = useState<string>();
	const [categoryTypeTargetId, setCategoryTypeTargetId] = useState<string>();
	const initialized = useRef(false);
	const requestedCycleId = searchParams.get("cycleId");

	useEffect(() => {
		if (
			initialized.current ||
			!cycleId ||
			categoryTypes === undefined ||
			existingCategories === undefined
		) {
			return;
		}

		const visibleCategories = existingCategories.filter(
			(category) => !category.isHidden
		);
		if (visibleCategories.length > 0) {
			setCategories(
				visibleCategories.map((category) => ({
					categoryId: category._id,
					categoryTypeId: category.categoryTypeId,
					icon: category.icon ?? "📦",
					id: category._id,
					name: category.name,
					plannedAmount:
						category.plannedAmount === undefined
							? ""
							: String(category.plannedAmount),
				}))
			);
			initialized.current = true;
			return;
		}

		setCategories(
			SUGGESTED_CATEGORIES.map((suggestion) => ({
				categoryTypeId: categoryTypes.find(
					(categoryType) => categoryType.name === suggestion.suggestedType
				)?._id,
				icon: suggestion.icon,
				id: createDraftId(),
				name: suggestion.name,
				plannedAmount: "",
			}))
		);
		initialized.current = true;
	}, [categoryTypes, cycleId, existingCategories]);

	const updateCategory = (
		id: string,
		field: "categoryTypeId" | "icon" | "name" | "plannedAmount",
		value: string
	) => {
		setCategories((current) =>
			current.map((category) =>
				category.id === id ? { ...category, [field]: value } : category
			)
		);
		setError(undefined);
	};

	const removeCategory = (id: string) => {
		setCategories((current) => {
			const category = current.find((item) => item.id === id);
			if (category) {
				setRemovedCategories((removed) => [...removed, category]);
			}
			return current.filter((item) => item.id !== id);
		});
	};

	const restoreLastCategory = () => {
		const category = removedCategories.at(-1);
		if (!category) {
			return;
		}
		setCategories((current) => [...current, category]);
		setRemovedCategories((current) => current.slice(0, -1));
	};

	const addCategory = () => {
		const id = createDraftId();
		setCategories((current) => [
			...current,
			{ icon: "📦", id, name: "", plannedAmount: "" },
		]);
		setTimeout(
			() => document.getElementById(`category-name-${id}`)?.focus(),
			0
		);
	};

	const totals = useMemo(() => {
		const byType = new Map<string, number>();
		let total = 0;
		for (const category of categories) {
			const amount = category.plannedAmount.trim()
				? Number(category.plannedAmount)
				: 0;
			if (!Number.isFinite(amount)) {
				continue;
			}
			total += amount;
			if (category.categoryTypeId) {
				byType.set(
					category.categoryTypeId,
					(byType.get(category.categoryTypeId) ?? 0) + amount
				);
			}
		}
		return { byType, total };
	}, [categories]);

	const getSubmissionCategories = () => {
		const invalidAmount = categories.find((category) => {
			if (!category.plannedAmount.trim()) {
				return false;
			}
			const amount = Number(category.plannedAmount);
			return !Number.isFinite(amount) || amount < 0;
		});
		if (invalidAmount) {
			setError("Planned amounts must be zero or greater.");
			document.getElementById(`category-amount-${invalidAmount.id}`)?.focus();
			return null;
		}

		return categories
			.filter((category) => category.name.trim())
			.map((category) => ({
				categoryId: category.categoryId,
				categoryTypeId: category.categoryTypeId
					? (category.categoryTypeId as Id<"category_types">)
					: undefined,
				icon: category.icon,
				name: category.name.trim(),
				plannedAmount: category.plannedAmount.trim()
					? Number(category.plannedAmount)
					: undefined,
			}));
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!cycleId) {
			setError("Create your expense cycle before setting up categories.");
			return;
		}
		const submissionCategories = getSubmissionCategories();
		if (!submissionCategories) {
			return;
		}
		setIsSaving(true);
		setError(undefined);
		try {
			await saveCategories({ categories: submissionCategories, cycleId });
			router.push(`/onboarding/accounts?cycleId=${cycleId}`);
		} catch (_error) {
			setError(
				"We couldn't save your categories. Your entries are still here—please try again."
			);
			setIsSaving(false);
		}
	};

	const handleSkip = async () => {
		if (!cycleId) {
			return;
		}
		setIsSkipping(true);
		setError(undefined);
		try {
			await advanceOnboarding({ step: "account" });
			router.push(`/onboarding/accounts?cycleId=${cycleId}`);
		} catch (_error) {
			setError("We couldn't skip category setup. Please try again.");
			setIsSkipping(false);
		}
	};

	if (
		!cycleId ||
		categoryTypes === undefined ||
		existingCategories === undefined
	) {
		return <Card className="h-72 animate-pulse gap-0 bg-muted/40 py-0" />;
	}

	const hasForeignCycleId = Boolean(
		requestedCycleId && requestedCycleId !== cycleId
	);
	const currencySymbol = getCurrencySymbol(onboardingState.currency);

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			<Card className="gap-0 overflow-hidden py-0 shadow-sm">
				<CardHeader className="border-b bg-muted/25 px-5 py-6 sm:px-8">
					<div className="flex items-center gap-3">
						<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Layers3 className="size-5" />
						</div>
						<CardTitle className="text-2xl">
							Review your starting categories
						</CardTitle>
					</div>
					<p className="max-w-2xl text-muted-foreground leading-6">
						Keep the suggestions that fit, remove the rest, and add anything
						missing. Category types and planned amounts are optional.
					</p>
				</CardHeader>

				<CardContent className="flex flex-col gap-6 px-4 py-5 sm:px-8 sm:py-7">
					{hasForeignCycleId ? (
						<p
							className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
							role="alert"
						>
							That cycle is not available. You are editing categories for your
							own onboarding cycle.
						</p>
					) : null}

					{removedCategories.length > 0 ? (
						<div
							aria-live="polite"
							className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
						>
							<p>
								Removed {removedCategories.at(-1)?.name || "category"}. You can
								restore it before continuing.
							</p>
							<Button
								onClick={restoreLastCategory}
								size="sm"
								type="button"
								variant="outline"
							>
								<RotateCcw /> Undo removal
							</Button>
						</div>
					) : null}

					<div className="flex flex-col gap-3">
						{categories.map((category) => (
							<div
								className="rounded-xl border border-border/70 bg-muted/20 p-3"
								key={category.id}
							>
								<div className="grid gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_9rem_9rem_2.5rem] sm:items-end sm:gap-2">
									<div className="flex flex-col gap-1.5">
										<EmojiPicker
											ariaLabel={`Icon for ${category.name || "category"}`}
											className="size-10"
											id={`category-icon-${category.id}`}
											onChange={(emoji) =>
												updateCategory(category.id, "icon", emoji)
											}
											value={category.icon}
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor={`category-name-${category.id}`}>
											Category name
										</Label>
										<Input
											className="h-10"
											id={`category-name-${category.id}`}
											onChange={(event) =>
												updateCategory(category.id, "name", event.target.value)
											}
											placeholder="Category name"
											value={category.name}
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor={`category-group-${category.id}`}>
											Category type
										</Label>
										<Select
											onValueChange={(value) => {
												if (value === ADD_CATEGORY_TYPE_VALUE) {
													setCategoryTypeTargetId(category.id);
													return;
												}
												updateCategory(
													category.id,
													"categoryTypeId",
													value === "none" ? "" : value
												);
											}}
											value={category.categoryTypeId || "none"}
										>
											<SelectTrigger
												aria-label={`Category type for ${category.name || "category"}`}
												className="w-full data-[size=default]:h-10"
												id={`category-group-${category.id}`}
											>
												<SelectValue placeholder="No type" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectItem value="none">No type</SelectItem>
													{categoryTypes.map((categoryType) => (
														<SelectItem
															key={categoryType._id}
															value={categoryType._id}
														>
															{categoryType.name}
														</SelectItem>
													))}
												</SelectGroup>
												<SelectSeparator />
												<SelectGroup>
													<SelectItem value={ADD_CATEGORY_TYPE_VALUE}>
														<Plus /> Add category type
													</SelectItem>
												</SelectGroup>
											</SelectContent>
										</Select>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor={`category-amount-${category.id}`}>
											Planned amount
										</Label>
										<div className="relative">
											<span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">
												{currencySymbol}
											</span>
											<Input
												className="h-10 pl-8 tabular-nums"
												id={`category-amount-${category.id}`}
												inputMode="decimal"
												min="0"
												onChange={(event) =>
													updateCategory(
														category.id,
														"plannedAmount",
														event.target.value
													)
												}
												placeholder="No plan"
												step="0.01"
												type="number"
												value={category.plannedAmount}
											/>
										</div>
									</div>
									<Button
										aria-label={`Remove ${category.name || "category"}`}
										className="w-full text-muted-foreground hover:text-destructive sm:size-10"
										onClick={() => removeCategory(category.id)}
										size="icon"
										type="button"
										variant="ghost"
									>
										<Trash2 />
									</Button>
								</div>
							</div>
						))}
					</div>

					<Button
						className="h-11 border-dashed"
						onClick={addCategory}
						type="button"
						variant="outline"
					>
						<Plus /> Add a custom category
					</Button>
					<CategoryTypeModal
						existingTypeNames={categoryTypes.map(
							(categoryType) => categoryType.name
						)}
						onOpenChange={(open) => {
							if (!open) {
								setCategoryTypeTargetId(undefined);
							}
						}}
						onSuccess={(typeId) => {
							if (categoryTypeTargetId) {
								updateCategory(categoryTypeTargetId, "categoryTypeId", typeId);
							}
						}}
						open={Boolean(categoryTypeTargetId)}
					/>

					<section
						aria-labelledby="plan-total"
						className="rounded-xl border bg-muted/25 p-4"
					>
						<div className="flex items-end justify-between gap-4">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Live plan total
								</p>
								<h2 className="mt-1 font-semibold text-lg" id="plan-total">
									{new Intl.NumberFormat(undefined, {
										currency: onboardingState.currency,
										style: "currency",
									}).format(totals.total)}
								</h2>
							</div>
							<p className="text-right text-muted-foreground text-sm">
								{categories.filter((category) => category.name.trim()).length}{" "}
								categories
							</p>
						</div>
						{totals.total > 0 ? (
							<div className="mt-4 flex flex-wrap gap-2">
								{categoryTypes.map((categoryType) => {
									const amount = totals.byType.get(categoryType._id) ?? 0;
									return amount > 0 ? (
										<span
											className="rounded-full border bg-background px-2.5 py-1 text-xs"
											key={categoryType._id}
										>
											{categoryType.name} ·{" "}
											{Math.round((amount / totals.total) * 100)}%
										</span>
									) : null;
								})}
							</div>
						) : null}
					</section>

					<div aria-live="polite">
						{error ? (
							<p className="mb-3 text-destructive text-sm" role="alert">
								{error}
							</p>
						) : (
							<p className="mb-3 text-muted-foreground text-sm">
								Blank amounts stay unplanned; an entered 0 stays zero.
							</p>
						)}
						<OnboardingStepControls>
							<Button
								disabled={isSaving || isSkipping}
								onClick={handleSkip}
								type="button"
								variant="ghost"
							>
								{isSkipping ? <LoaderCircle className="animate-spin" /> : null}{" "}
								Skip category setup
							</Button>
							<Button disabled={isSaving || isSkipping} type="submit">
								{isSaving ? <LoaderCircle className="animate-spin" /> : null}{" "}
								Save categories and continue {isSaving ? null : <ArrowRight />}
							</Button>
						</OnboardingStepControls>
					</div>
				</CardContent>
			</Card>
		</form>
	);
}
