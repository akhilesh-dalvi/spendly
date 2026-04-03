"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CategoryTypeModal } from "@/components/category-type-modal";
import { EmojiPicker } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/hooks/use-currency";

const PENDING_PLAN_SETUP_KEY = "spendly:pending-plan-setup";

interface CategoryItem {
	id: string;
	name: string;
	plannedAmount: string;
	categoryTypeId?: string;
	icon: string;
}

const DEFAULT_CATEGORIES: Omit<CategoryItem, "id">[] = [
	{ name: "Rent", plannedAmount: "", icon: "🏠" },
	{ name: "Groceries", plannedAmount: "", icon: "🛒" },
	{ name: "Transport", plannedAmount: "", icon: "🚌" },
	{ name: "Utilities", plannedAmount: "", icon: "💡" },
	{ name: "Shopping", plannedAmount: "", icon: "🛍️" },
	{ name: "Entertainment", plannedAmount: "", icon: "🎬" },
	{ name: "Savings", plannedAmount: "", icon: "🏦" },
];

export default function OnboardingCategoriesPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const cycleIdParam = searchParams.get("cycleId");
	const cycleId =
		cycleIdParam && cycleIdParam !== "[object Object]"
			? (cycleIdParam as Id<"expense_cycles">)
			: null;
	const { format: formatCurrency } = useCurrency();

	const createCategory = useMutation(api.categories.create);
	const seedDefaults = useMutation(api.categories.seedDefaults);
	const categoryTypes = useQuery(api.categories.listTypes);

	const [categories, setCategories] = useState<CategoryItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [hasInitialized, setHasInitialized] = useState(false);
	const [typeDialogIndex, setTypeDialogIndex] = useState<number | null>(null);

	useEffect(() => {
		seedDefaults();
	}, [seedDefaults]);

	useEffect(() => {
		window.sessionStorage.removeItem(PENDING_PLAN_SETUP_KEY);

		if (!cycleIdParam || cycleIdParam === "[object Object]") {
			window.sessionStorage.setItem(PENDING_PLAN_SETUP_KEY, "true");
			router.replace("/onboarding/cycle?mode=plan");
		}
	}, [cycleIdParam, router]);

	// Initialize categories once types are loaded
	useEffect(() => {
		if (categoryTypes && categoryTypes.length > 0 && !hasInitialized) {
			const needsId = categoryTypes.find((t) => t.name === "Needs")?._id;
			const wantsId = categoryTypes.find((t) => t.name === "Wants")?._id;
			const savingsId = categoryTypes.find((t) => t.name === "Savings")?._id;

			const initialCats = DEFAULT_CATEGORIES.map((c, index) => {
				let typeId: string | undefined;
				if (["Rent", "Groceries", "Transport", "Utilities"].includes(c.name)) {
					typeId = needsId;
				}
				if (["Shopping", "Entertainment"].includes(c.name)) {
					typeId = wantsId;
				}
				if (["Savings"].includes(c.name)) {
					typeId = savingsId;
				}

				return { ...c, id: `initial-${index}`, categoryTypeId: typeId };
			});

			setCategories(initialCats);
			setHasInitialized(true);
		}
	}, [categoryTypes, hasInitialized]);

	const updateCategory = (
		index: number,
		field: keyof CategoryItem,
		value: string
	) => {
		const newCats = [...categories];
		newCats[index] = { ...newCats[index], [field]: value };
		setCategories(newCats);
	};

	const addCategory = () => {
		setCategories([
			...categories,
			{
				id: Math.random().toString(36).substring(7),
				name: "",
				plannedAmount: "",
				icon: "📦",
			},
		]);
	};

	const removeCategory = (index: number) => {
		setCategories(categories.filter((_, i) => i !== index));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!cycleId) {
			toast.error(
				"We couldn't find the cycle for this setup. Please try again."
			);
			return;
		}

		setIsLoading(true);
		try {
			// Create each category
			await Promise.all(
				categories
					.filter((c) => c.name.trim() !== "")
					.map((cat, index) =>
						createCategory({
							cycleId,
							name: cat.name,
							categoryTypeId: cat.categoryTypeId as
								| Id<"category_types">
								| undefined,
							plannedAmount: Number.parseFloat(cat.plannedAmount) || 0,
							icon: cat.icon,
							order: index,
						})
					)
			);

			toast.success("Categories created successfully!");
			router.push("/dashboard");
		} catch (error) {
			console.error(error);
			toast.error("Failed to save categories. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const totals = useMemo(() => {
		const byType: Record<string, number> = {};
		let total = 0;

		for (const cat of categories) {
			const amount = Number.parseFloat(cat.plannedAmount) || 0;
			total += amount;

			if (cat.categoryTypeId) {
				byType[cat.categoryTypeId] = (byType[cat.categoryTypeId] || 0) + amount;
			}
		}

		return { byType, total };
	}, [categories]);

	if (!cycleId) {
		return null;
	}

	return (
		<div className="mx-auto max-w-2xl space-y-8 pb-10">
			<div className="space-y-2 text-center">
				<h1 className="font-bold text-3xl tracking-tight">Set up Categories</h1>
				<p className="text-muted-foreground">
					Add categories to organize your spending.
				</p>
			</div>

			<form className="space-y-6" onSubmit={handleSubmit}>
				<Card className="">
					<CardHeader>
						<CardTitle>Your Categories</CardTitle>
						<CardDescription>
							Assign types to track spending patterns (optional).
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-3">
							{categories.map((cat, index) => (
								<div
									className="group flex items-center gap-2 rounded-lg border bg-card p-2 transition-colors hover:bg-accent/5"
									key={cat.id}
								>
									<EmojiPicker
										onChange={(emoji) => updateCategory(index, "icon", emoji)}
										value={cat.icon}
									/>
									<div className="flex flex-1 items-center gap-2">
										<Input
											className="h-9 min-w-0 flex-1 font-medium"
											onChange={(e) =>
												updateCategory(index, "name", e.target.value)
											}
											placeholder="Category name"
											value={cat.name}
										/>
										<Select
											onValueChange={(value) =>
												updateCategory(
													index,
													"categoryTypeId",
													value === "none" ? "" : value
												)
											}
											value={cat.categoryTypeId || "none"}
										>
											<SelectTrigger className="h-9 w-32">
												<SelectValue placeholder="Type" />
											</SelectTrigger>
											<SelectContent className="max-h-[200px] overflow-y-auto">
												<div className="border-b p-1">
													<Button
														className="flex h-9 w-full items-center justify-start gap-2 rounded-sm px-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
														onClick={() => setTypeDialogIndex(index)}
														type="button"
														variant="ghost"
													>
														<Plus className="h-4 w-4" />
														<span>New Type</span>
													</Button>
												</div>
												<SelectItem value="none">
													<span className="text-muted-foreground">No type</span>
												</SelectItem>
												{categoryTypes?.map((type) => (
													<SelectItem key={type._id} value={type._id}>
														{type.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<CategoryTypeModal
											existingTypeNames={categoryTypes?.map(
												(type) => type.name
											)}
											onOpenChange={(open) =>
												setTypeDialogIndex(open ? index : null)
											}
											onSuccess={(typeId) => {
												updateCategory(index, "categoryTypeId", typeId);
											}}
											open={typeDialogIndex === index}
										/>
										<Input
											className="h-9 w-28 tabular-nums"
											onChange={(e) =>
												updateCategory(index, "plannedAmount", e.target.value)
											}
											placeholder="Amount"
											type="number"
											value={cat.plannedAmount}
										/>
									</div>
									<Button
										className="h-9 w-9 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive group-hover:opacity-100"
										disabled={categories.length <= 1}
										onClick={() => removeCategory(index)}
										size="icon"
										type="button"
										variant="ghost"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
						</div>

						<Button
							className="h-12 w-full border-dashed"
							onClick={addCategory}
							size="sm"
							type="button"
							variant="outline"
						>
							<Plus className="mr-2 h-4 w-4" />
							Add Category
						</Button>
					</CardContent>
				</Card>

				{/* Summary Card */}
				{totals.total > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Budget Summary</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{categoryTypes?.map((type) => {
								const amount = totals.byType[type._id] || 0;
								if (amount === 0) {
									return null;
								}

								const percentage =
									totals.total > 0 ? (amount / totals.total) * 100 : 0;

								return (
									<div className="space-y-1" key={type._id}>
										<div className="flex justify-between text-sm">
											<div className="flex items-center gap-2">
												{type.color && (
													<div
														className="h-2 w-2 rounded-full"
														style={{ backgroundColor: type.color }}
													/>
												)}
												<span className="text-muted-foreground">
													{type.name}
												</span>
											</div>
											<span className="font-medium tabular-nums">
												{formatCurrency(amount)}
												<span className="ml-2 text-muted-foreground text-xs">
													{percentage.toFixed(0)}%
												</span>
											</span>
										</div>
										<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
											<div
												className="h-full bg-primary"
												style={{
													width: `${percentage}%`,
													backgroundColor: type.color || undefined,
												}}
											/>
										</div>
									</div>
								);
							})}

							<div className="flex items-center justify-between border-t pt-3">
								<span className="font-medium">Total Planned</span>
								<span className="font-bold text-xl tabular-nums">
									{formatCurrency(totals.total)}
								</span>
							</div>
						</CardContent>
					</Card>
				)}

				<div className="flex gap-3 pt-4">
					<Button
						className="flex-1"
						onClick={() => router.push("/dashboard")}
						type="button"
						variant="ghost"
					>
						Skip
					</Button>
					<Button className="flex-1" disabled={isLoading} type="submit">
						{isLoading ? "Saving..." : "Finish Setup"}
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				</div>
			</form>
			<p className="mt-4 text-center text-muted-foreground text-sm">
				Don't worry, all these settings can be updated later in your dashboard.
			</p>
		</div>
	);
}
