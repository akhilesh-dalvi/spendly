"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, Loader2, Plus, Save, X } from "lucide-react";
import { useCallback, useState } from "react";
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
	categoryTypeId: z.string().optional(),
	icon: z.string().optional(),
	name: z.string().min(1, "Name is required"),
	plannedAmount: z.number().min(0).optional(),
});

const AMOUNT_REGEX = /^\d*\.?\d{0,2}$/;

interface CategoryFormProps {
	categoryId?: Id<"categories">;
	className?: string;
	cycleId: Id<"expense_cycles">;
	defaultValues?: Partial<{
		name: string;
		categoryTypeId: string;
		plannedAmount: number;
		icon: string;
	}>;
	historicalSpent?: {
		amount: number;
		cycleName: string;
	};
	onSuccess?: () => void;
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
	categoryTypeId: values?.categoryTypeId ?? "",
	clientId: crypto.randomUUID(),
	icon: values?.icon ?? "📦",
	name: values?.name ?? "",
	plannedAmount: values?.plannedAmount,
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

interface CategoryRowFieldsProps {
	autoFocus: boolean;
	canRemove: boolean;
	category: ReturnType<typeof createCategoryRow>;
	categoryNameErrors?: string[];
	categoryTypes: Doc<"category_types">[] | undefined;
	historicalSpent?: CategoryFormProps["historicalSpent"];
	index: number;
	onRemove: (id: string) => void;
	onUpdate: (
		id: string,
		updates: Partial<ReturnType<typeof createCategoryRow>>
	) => void;
	setTypeDialogIndex: (index: number | null) => void;
	typeDialogIndex: number | null;
}

function CategoryRowFields({
	category,
	categoryNameErrors,
	categoryTypes,
	canRemove,
	autoFocus,
	index,
	historicalSpent,
	typeDialogIndex,
	setTypeDialogIndex,
	onUpdate,
	onRemove,
}: CategoryRowFieldsProps) {
	const { format: formatCurrency } = useCurrency();
	const update = useCallback(
		(updates: Partial<ReturnType<typeof createCategoryRow>>) =>
			onUpdate(category.clientId, updates),
		[onUpdate, category.clientId]
	);
	const remove = useCallback(
		() => onRemove(category.clientId),
		[onRemove, category.clientId]
	);
	const changeIcon = useCallback((icon: string) => update({ icon }), [update]);
	const changeName = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) =>
			update({ name: event.target.value }),
		[update]
	);
	const changeType = useCallback(
		(categoryTypeId: string) => update({ categoryTypeId }),
		[update]
	);
	const selectType = useCallback(
		(value: string) => changeType(value === "none" ? "" : value),
		[changeType]
	);
	const changeTypeDialog = useCallback(
		(open: boolean) => setTypeDialogIndex(open ? index : null),
		[setTypeDialogIndex, index]
	);
	const openTypeDialog = useCallback(
		() => setTypeDialogIndex(index),
		[setTypeDialogIndex, index]
	);
	const useHistoricalAmount = useCallback(() => {
		if (historicalSpent) {
			update({ plannedAmount: historicalSpent.amount });
		}
	}, [update, historicalSpent]);
	const changeAmount = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const { value } = event.target;
			if (value === "" || AMOUNT_REGEX.test(value)) {
				update({ plannedAmount: value === "" ? undefined : Number(value) });
			}
		},
		[update]
	);
	return (
		<div
			className="relative space-y-6 rounded-xl border bg-card p-4 shadow-sm"
			key={category.clientId}
		>
			{Boolean(canRemove) && (
				<Button
					className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
					onClick={remove}
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
					<EmojiPicker onChange={changeIcon} value={category.icon} />
				</div>

				<div className="flex-1 space-y-2">
					<Label>Name</Label>
					<Input
						autoFocus={autoFocus}
						onChange={changeName}
						placeholder="Category name"
						value={category.name}
					/>
					{categoryNameErrors !== undefined && (
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
					onOpenChange={changeTypeDialog}
					onSuccess={changeType}
					open={typeDialogIndex === index}
				/>
				<Select
					onValueChange={selectType}
					value={category.categoryTypeId || "none"}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select type" />
					</SelectTrigger>
					<SelectContent className="max-h-[200px] overflow-y-auto">
						<div className="border-b p-1">
							<Button
								className="flex h-9 w-full items-center justify-start gap-2 rounded-sm px-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
								onClick={openTypeDialog}
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
								<div className="flex items-center gap-2">
									{Boolean(type.color) && (
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
							onClick={useHistoricalAmount}
							type="button"
						>
							Use Last Cycle ({formatCurrency(historicalSpent.amount)})
						</button>
					)}
				</div>
				<Input
					inputMode="decimal"
					onChange={changeAmount}
					placeholder="0.00"
					type="text"
					value={
						category.plannedAmount === undefined
							? ""
							: category.plannedAmount.toString()
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
}

function CategorySuggestion({
	category,
	onAdd,
}: {
	category: Doc<"categories">;
	onAdd: (category: Doc<"categories">) => void;
}) {
	const add = useCallback(() => onAdd(category), [onAdd, category]);
	return (
		<Button
			className="h-8 gap-1.5 rounded-full border-dashed px-3 text-xs"
			onClick={add}
			type="button"
			variant="outline"
		>
			{category.icon ?? "📦"} {category.name}
		</Button>
	);
}

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
	const isEditing = Boolean(categoryId);
	const [typeDialogIndex, setTypeDialogIndex] = useState<number | null>(null);

	const form = useForm({
		defaultValues: {
			categories: [createCategoryRow(defaultValues)],
		},
		onSubmit: async ({ value }) => {
			try {
				if (isEditing && categoryId) {
					const [val] = value.categories;
					const resolvedTypeId = val.categoryTypeId
						? (val.categoryTypeId as Id<"category_types">)
						: undefined;

					await updateCategory({
						categoryTypeId: resolvedTypeId,
						icon: val.icon,
						id: categoryId,
						name: val.name,
						plannedAmount: val.plannedAmount,
					});
					toast.success("Category updated");
				} else {
					await Promise.all(
						value.categories.map((val) => {
							const resolvedTypeId = val.categoryTypeId
								? (val.categoryTypeId as Id<"category_types">)
								: undefined;
							return createCategory({
								categoryTypeId: resolvedTypeId,
								cycleId,
								icon: val.icon,
								name: val.name,
								plannedAmount: val.plannedAmount,
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
		validators: {
			onChange: ({ value }) => {
				const result = z
					.object({ categories: z.array(categorySchema.partial()) })
					.safeParse(value);
				if (!result.success) {
					return result.error.flatten().fieldErrors;
				}
			},
		},
	});

	const handleSubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			event.stopPropagation();
			if (!form.state.isSubmitting) {
				return form.handleSubmit();
			}
		},
		[form]
	);
	const updateRow = useCallback(
		(
			clientId: string,
			updates: Partial<ReturnType<typeof createCategoryRow>>
		) => {
			form.setFieldValue("categories", (rows) =>
				rows.map((row) =>
					row.clientId === clientId ? { ...row, ...updates } : row
				)
			);
		},
		[form]
	);
	const removeRow = useCallback(
		(clientId: string) => {
			form.setFieldValue("categories", (rows) =>
				rows.filter((row) => row.clientId !== clientId)
			);
		},
		[form]
	);
	const addRow = useCallback(
		() =>
			form.setFieldValue("categories", (rows) => [
				...rows,
				createCategoryRow(),
			]),
		[form]
	);
	const addSuggestion = useCallback(
		(cat: Doc<"categories">) => {
			const newCat = createCategoryRow({
				categoryTypeId: cat.categoryTypeId ?? "",
				icon: cat.icon ?? "📦",
				name: cat.name,
				plannedAmount: cat.plannedAmount,
			});
			form.setFieldValue("categories", (rows) => {
				const emptyIndex = rows.findIndex(
					(row) =>
						!row.name &&
						(row.plannedAmount === undefined || row.plannedAmount === 0)
				);
				return emptyIndex === -1
					? [...rows, newCat]
					: rows.map((row, index) => (index === emptyIndex ? newCat : row));
			});
		},
		[form]
	);
	const selectSubmission = useCallback(
		(state: {
			isSubmitting: boolean;
			values: { categories: ReturnType<typeof createCategoryRow>[] };
		}) => ({ isSubmitting: state.isSubmitting, values: state.values }),
		[]
	);

	return (
		<div className={className}>
			<form className="space-y-6" onSubmit={handleSubmit}>
				<form.Field name="categories">
					{(field) => (
						<div className="max-h-[50vh] space-y-6 overflow-y-auto p-1">
							{field.state.value.map((category, index) => {
								const categoryNameErrors = getCategoryNameErrors(
									field.state.meta.errors[0],
									index
								);

								return (
									<CategoryRowFields
										autoFocus={index === field.state.value.length - 1}
										canRemove={!isEditing && field.state.value.length > 1}
										category={category}
										categoryNameErrors={categoryNameErrors}
										categoryTypes={categoryTypes}
										historicalSpent={historicalSpent}
										index={index}
										key={category.clientId}
										onRemove={removeRow}
										onUpdate={updateRow}
										setTypeDialogIndex={setTypeDialogIndex}
										typeDialogIndex={typeDialogIndex}
									/>
								);
							})}

							{!isEditing && (
								<Button
									className="w-full border-dashed"
									onClick={addRow}
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

				<form.Subscribe selector={selectSubmission}>
					{({ values, isSubmitting }) => {
						const { categories } = values;
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
														<CategorySuggestion
															category={cat}
															key={cat._id}
															onAdd={addSuggestion}
														/>
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
