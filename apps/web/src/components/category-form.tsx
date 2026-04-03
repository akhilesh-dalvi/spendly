"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, Loader2, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CategoryTypeModal } from "@/components/category-type-modal";
import { EmojiPicker } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { useCurrency } from "@/hooks/use-currency";

const categorySchema = z.object({
	name: z.string().min(1, "Name is required"),
	categoryTypeId: z.string().optional(),
	plannedAmount: z.number().min(0).optional(),
	icon: z.string().optional(),
});

const AMOUNT_REGEX = /^\d*\.?\d{0,2}$/;

interface CategoryFormProps {
	cycleId: Id<"expense_cycles">;
	onSuccess?: () => void;
	className?: string;
	categoryId?: Id<"categories">;
	historicalSpent?: {
		amount: number;
		cycleName: string;
	};
	defaultValues?: Partial<{
		name: string;
		categoryTypeId: string;
		plannedAmount: number;
		icon: string;
	}>;
}

interface CategoryNameErrors {
	categories?: Array<{
		name?: string[];
	}>;
}

const createCategoryRow = (
	values?: Partial<{
		name: string;
		categoryTypeId: string;
		plannedAmount: number;
		icon: string;
	}>
) => ({
	clientId: crypto.randomUUID(),
	name: values?.name ?? "",
	categoryTypeId: values?.categoryTypeId ?? "",
	plannedAmount: values?.plannedAmount,
	icon: values?.icon ?? "📦",
});

const getCategoryNameErrors = (
	error: unknown,
	index: number
): string[] | undefined => {
	if (!error || typeof error !== "object" || !("categories" in error)) {
		return undefined;
	}

	const { categories } = error as CategoryNameErrors;
	return categories?.[index]?.name;
};

export function CategoryForm({
	cycleId,
	onSuccess,
	className,
	categoryId,
	historicalSpent,
	defaultValues,
}: CategoryFormProps) {
	const createCategory = useMutation(api.categories.create);
	const updateCategory = useMutation(api.categories.update);
	const categoryTypes = useQuery(api.categories.listTypes);
	const previousCycleCategories = useQuery(
		api.categories.listPreviousCycleUnused,
		{ currentCycleId: cycleId }
	);
	const { format: formatCurrency } = useCurrency();
	const isEditing = Boolean(categoryId);
	const [typeDialogIndex, setTypeDialogIndex] = useState<number | null>(null);

	const form = useForm({
		defaultValues: {
			categories: [createCategoryRow(defaultValues)],
		},
		validators: {
			onChange: ({ value }) => {
				const result = z
					.object({ categories: z.array(categorySchema.partial()) })
					.safeParse(value);
				if (!result.success) {
					return result.error.flatten().fieldErrors;
				}
				return undefined;
			},
		},
		onSubmit: async ({ value }) => {
			try {
				if (isEditing && categoryId) {
					const val = value.categories[0];
					const resolvedTypeId = val.categoryTypeId
						? (val.categoryTypeId as Id<"category_types">)
						: undefined;

					await updateCategory({
						id: categoryId,
						name: val.name,
						categoryTypeId: resolvedTypeId,
						plannedAmount: val.plannedAmount,
						icon: val.icon,
					});
					toast.success("Category updated");
				} else {
					await Promise.all(
						value.categories.map((val) => {
							const resolvedTypeId = val.categoryTypeId
								? (val.categoryTypeId as Id<"category_types">)
								: undefined;
							return createCategory({
								cycleId,
								name: val.name,
								categoryTypeId: resolvedTypeId,
								plannedAmount: val.plannedAmount,
								icon: val.icon,
							});
						})
					);
					toast.success(
						value.categories.length > 1
							? "Categories added successfully"
							: "Category added successfully"
					);
				}

				form.reset();
				onSuccess?.();
			} catch (error) {
				console.error(error);
				toast.error(
					isEditing ? "Failed to update category" : "Failed to add categories"
				);
			}
		},
	});

	return (
		<div className={className}>
			<form
				className="space-y-6"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field name="categories">
					{(field) => (
						<div className="max-h-[50vh] space-y-6 overflow-y-auto p-1">
							{field.state.value.map((category, index) => {
								const categoryNameErrors = getCategoryNameErrors(
									field.state.meta.errors[0],
									index
								);

								return (
									<div
										className="relative space-y-6 rounded-xl border bg-card p-4 shadow-sm"
										key={category.clientId}
									>
										{!isEditing && field.state.value.length > 1 && (
											<Button
												className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
												onClick={() => {
													const newCats = [...field.state.value];
													newCats.splice(index, 1);
													field.handleChange(newCats);
												}}
												size="icon"
												type="button"
												variant="ghost"
											>
												<X className="h-4 w-4" />
											</Button>
										)}

										<div className="flex gap-4">
											<div className="space-y-2">
												<Label>Icon</Label>
												<EmojiPicker
													onChange={(emoji) => {
														const newCats = [...field.state.value];
														newCats[index] = {
															...newCats[index],
															icon: emoji,
														};
														field.handleChange(newCats);
													}}
													value={category.icon}
												/>
											</div>

											<div className="flex-1 space-y-2">
												<Label>Name</Label>
												<Input
													autoFocus={index === field.state.value.length - 1}
													onChange={(e) => {
														const newCats = [...field.state.value];
														newCats[index] = {
															...newCats[index],
															name: e.target.value,
														};
														field.handleChange(newCats);
													}}
													placeholder="Category name"
													value={category.name}
												/>
												{categoryNameErrors && (
													<p className="flex items-center gap-1 text-destructive text-sm">
														<AlertCircle className="h-3 w-3" />
														{categoryNameErrors.join(", ")}
													</p>
												)}
											</div>
										</div>

										<div className="space-y-2">
											<Label>Type</Label>
											<CategoryTypeModal
												existingTypeNames={categoryTypes?.map((t) => t.name)}
												onOpenChange={(open) =>
													setTypeDialogIndex(open ? index : null)
												}
												onSuccess={(typeId) => {
													const newCats = [...field.state.value];
													newCats[index] = {
														...newCats[index],
														categoryTypeId: typeId,
													};
													field.handleChange(newCats);
												}}
												open={typeDialogIndex === index}
											/>
											<Select
												onValueChange={(val) => {
													const newCats = [...field.state.value];
													newCats[index] = {
														...newCats[index],
														categoryTypeId: val === "none" ? "" : val,
													};
													field.handleChange(newCats);
												}}
												value={category.categoryTypeId || "none"}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select type" />
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
														<span className="text-muted-foreground">
															No type
														</span>
													</SelectItem>
													{categoryTypes?.map((type) => (
														<SelectItem key={type._id} value={type._id}>
															<div className="flex items-center gap-2">
																{type.color && (
																	<div
																		className="h-2 w-2 rounded-full"
																		style={{ backgroundColor: type.color }}
																	/>
																)}
																{type.name}
															</div>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<Label>Planned Amount</Label>
												{historicalSpent && index === 0 && (
													<button
														className="font-bold text-[10px] text-primary uppercase tracking-widest transition-all hover:underline"
														onClick={() => {
															const newCats = [...field.state.value];
															newCats[index] = {
																...newCats[index],
																plannedAmount: historicalSpent.amount,
															};
															field.handleChange(newCats);
														}}
														type="button"
													>
														Use Last Cycle (
														{formatCurrency(historicalSpent.amount)})
													</button>
												)}
											</div>
											<Input
												inputMode="decimal"
												onChange={(e) => {
													const val = e.target.value;
													if (val === "" || AMOUNT_REGEX.test(val)) {
														const newCats = [...field.state.value];
														newCats[index] = {
															...newCats[index],
															plannedAmount:
																val === "" ? undefined : Number(val),
														};
														field.handleChange(newCats);
													}
												}}
												placeholder="0.00"
												type="text"
												value={
													category.plannedAmount !== undefined
														? category.plannedAmount.toString()
														: ""
												}
											/>
											{historicalSpent && index === 0 && (
												<p className="px-1 text-[10px] text-muted-foreground/60 italic">
													You spent {formatCurrency(historicalSpent.amount)} in{" "}
													{historicalSpent.cycleName}
												</p>
											)}
										</div>
									</div>
								);
							})}

							{!isEditing && (
								<Button
									className="w-full border-dashed"
									onClick={() => {
										field.handleChange([
											...field.state.value,
											createCategoryRow(),
										]);
									}}
									type="button"
									variant="outline"
								>
									<Plus className="mr-2 h-4 w-4" />
									Add Another Row
								</Button>
							)}
						</div>
					)}
				</form.Field>

				<form.Subscribe
					selector={(state) => ({
						values: state.values,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ values, isSubmitting }) => {
						const categories = values.categories;
						const categoriesWithNames = categories.filter(
							(c) => c.name && c.name.trim().length > 0
						);
						const hasValidCategory = categoriesWithNames.length > 0;

						return (
							<>
								{!isEditing &&
									previousCycleCategories &&
									previousCycleCategories.filter(
										(cat) =>
											!categories.some(
												(c) =>
													c.name &&
													c.name.trim().toLowerCase() ===
														cat.name.trim().toLowerCase()
											)
									).length > 0 && (
										<div className="space-y-3">
											<Label className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
												Suggestions from Previous Cycle
											</Label>
											<div className="flex flex-wrap gap-2">
												{previousCycleCategories
													.filter(
														(cat) =>
															!categories.some(
																(c) =>
																	c.name &&
																	c.name.trim().toLowerCase() ===
																		cat.name.trim().toLowerCase()
															)
													)
													.map((cat) => (
														<Button
															className="h-8 gap-1.5 rounded-full border-dashed px-3 text-xs"
															key={cat._id}
															onClick={() => {
																const emptyIndex = categories.findIndex(
																	(c) =>
																		!c.name &&
																		(c.plannedAmount === undefined ||
																			c.plannedAmount === 0)
																);

																const newCat = createCategoryRow({
																	name: cat.name,
																	categoryTypeId: cat.categoryTypeId ?? "",
																	plannedAmount: cat.plannedAmount,
																	icon: cat.icon ?? "📦",
																});

																if (emptyIndex !== -1) {
																	const newCats = [...categories];
																	newCats[emptyIndex] = newCat;
																	form.setFieldValue("categories", newCats);
																} else {
																	form.setFieldValue("categories", [
																		...categories,
																		newCat,
																	]);
																}
															}}
															type="button"
															variant="outline"
														>
															{cat.icon ?? "📦"} {cat.name}
														</Button>
													))}
											</div>
										</div>
									)}

								<Button
									className="w-full"
									disabled={isSubmitting || !hasValidCategory}
									size="lg"
									type="submit"
								>
									{isSubmitting ? (
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
											{isEditing
												? "Save Changes"
												: `Add Categor${
														categoriesWithNames.length > 1 ? "ies" : "y"
													}`}
										</>
									)}
								</Button>
							</>
						);
					}}
				</form.Subscribe>
			</form>
		</div>
	);
}
