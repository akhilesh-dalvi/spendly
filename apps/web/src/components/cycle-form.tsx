"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { Loader2, Plus, Save } from "lucide-react";
import {
	type ChangeEvent,
	type FormEvent,
	useCallback,
	useEffect,
	useState,
} from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePickerWithRange } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const cycleSchema = z.object({
	categoryPlannedOverrides: z
		.array(
			z.object({
				id: z.string(),
				plannedAmount: z.number().optional(),
			})
		)
		.optional(),
	copyCategoryIds: z.array(z.string()).optional(),
	copyFromCycleId: z.string().optional(),
	endDate: z.string(),
	includePlannedAmounts: z.boolean().optional(),
	name: z.string().min(1, "Name is required"),
	startDate: z.string(),
});
type CycleFormValues = z.infer<typeof cycleSchema>;

interface CycleFormProps {
	className?: string;
	cycleId?: Id<"expense_cycles">;
	defaultValues?: Partial<{
		name: string;
		startDate: string;
		endDate: string;
	}>;
	onSuccess?: (cycleId: string) => void;
}

function CycleNameInput({
	name,
	onBlur,
	onValueChange,
	value,
}: {
	name: string;
	onBlur: () => void;
	onValueChange: (value: string) => void;
	value: string;
}) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
		[onValueChange]
	);
	return (
		<Input
			id={name}
			onBlur={onBlur}
			onChange={handleChange}
			placeholder="e.g. February 2026"
			value={value}
		/>
	);
}

function IncludePlannedCheckbox({
	checked,
	onValueChange,
}: {
	checked: boolean;
	onValueChange: (checked: boolean) => void;
}) {
	const handleChange = useCallback(
		(nextChecked: boolean | "indeterminate") =>
			onValueChange(Boolean(nextChecked)),
		[onValueChange]
	);
	return (
		<Checkbox
			checked={checked}
			id="include-planned"
			onCheckedChange={handleChange}
		/>
	);
}

type SourceCategory = FunctionReturnType<typeof api.categories.list>[number];

function SourceCategoryRow({
	category,
	onPlannedAmountChange,
	onSelectedChange,
	plannedAmount,
	selected,
}: {
	category: SourceCategory;
	onPlannedAmountChange: (
		id: Id<"categories">,
		value: number | undefined
	) => void;
	onSelectedChange: (id: Id<"categories">, selected: boolean) => void;
	plannedAmount: number | undefined;
	selected: boolean;
}) {
	const categoryId = category._id;
	const handleSelectedChange = useCallback(
		(checked: boolean | "indeterminate") =>
			onSelectedChange(categoryId, Boolean(checked)),
		[categoryId, onSelectedChange]
	);
	const handlePlannedAmountChange = useCallback(
		(value: number | undefined) => onPlannedAmountChange(categoryId, value),
		[categoryId, onPlannedAmountChange]
	);
	return (
		<div className="flex flex-col gap-3 rounded-md border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-start gap-3">
				<Checkbox
					checked={selected}
					id={`category-${categoryId}`}
					onCheckedChange={handleSelectedChange}
				/>
				<div className="space-y-1">
					<Label htmlFor={`category-${categoryId}`}>{category.name}</Label>
					{Boolean(category.typeName) && (
						<p className="text-muted-foreground text-xs">{category.typeName}</p>
					)}
				</div>
			</div>
			<div className="w-full sm:w-48">
				<CurrencyInput
					disabled={!selected}
					onChange={handlePlannedAmountChange}
					placeholder="Planned amount"
					value={plannedAmount}
				/>
			</div>
		</div>
	);
}

export function CycleForm({
	onSuccess,
	className,
	cycleId,
	defaultValues,
}: CycleFormProps) {
	const createCycle = useMutation(api.cycles.create);
	const updateCycle = useMutation(api.cycles.update);
	const allCycles = useQuery(api.cycles.list);
	const isEditing = Boolean(cycleId);
	const [copyFromCycleId, setCopyFromCycleId] = useState<
		Id<"expense_cycles"> | ""
	>("");
	const [selectedCategoryIds, setSelectedCategoryIds] = useState<
		Id<"categories">[]
	>([]);
	const [plannedAmounts, setPlannedAmounts] = useState<
		Record<string, number | undefined>
	>({});

	const [dateRange, setDateRange] = useState<DateRange | undefined>({
		from: defaultValues?.startDate
			? parseISO(defaultValues.startDate)
			: startOfMonth(new Date()),
		to: defaultValues?.endDate
			? parseISO(defaultValues.endDate)
			: endOfMonth(new Date()),
	});

	const form = useForm({
		defaultValues: {
			categoryPlannedOverrides: [],
			copyCategoryIds: [],
			copyFromCycleId: "",
			endDate:
				defaultValues?.endDate ?? format(endOfMonth(new Date()), "yyyy-MM-dd"),
			includePlannedAmounts: true,
			name: defaultValues?.name ?? format(new Date(), "MMMM yyyy"),
			startDate:
				defaultValues?.startDate ??
				format(startOfMonth(new Date()), "yyyy-MM-dd"),
		},
		onSubmit: async ({ value }) => {
			try {
				if (isEditing && cycleId) {
					await handleUpdateCycle(value, cycleId);
					return;
				}
				await handleCreateCycle(value);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to save cycle";
				toast.error(message.replace("ConvexError: ", ""));
			}
		},
		validators: {
			onChange: ({ value }) => {
				const result = cycleSchema.partial().safeParse(value);
				if (!result.success) {
					return result.error.flatten().fieldErrors;
				}
			},
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	const handleUpdateCycle = async (
		value: CycleFormValues,
		currentCycleId: Id<"expense_cycles">
	) => {
		await updateCycle({
			endDate: value.endDate,
			id: currentCycleId,
			name: value.name,
			startDate: value.startDate,
		});
		toast.success("Cycle updated successfully");
		onSuccess?.(currentCycleId);
	};

	const handleCreateCycle = async (value: CycleFormValues) => {
		const copyCategoryIds = copyFromCycleId ? selectedCategoryIds : undefined;
		const categoryPlannedOverrides = copyCategoryIds?.map((id) => ({
			id,
			plannedAmount: plannedAmounts[id],
		}));
		const result = await createCycle({
			categoryPlannedOverrides: categoryPlannedOverrides?.length
				? categoryPlannedOverrides.map(({ id, plannedAmount }) => ({
						id: id as Id<"categories">,
						plannedAmount,
					}))
				: undefined,
			copyCategoryIds: copyCategoryIds?.length
				? (copyCategoryIds as Id<"categories">[])
				: undefined,
			copyFromCycleId: value.copyFromCycleId
				? (value.copyFromCycleId as Id<"expense_cycles">)
				: undefined,
			endDate: value.endDate,
			includePlannedAmounts: value.includePlannedAmounts,
			name: value.name,
			startDate: value.startDate,
		});
		toast.success("Cycle created successfully");
		if (result?._id) {
			onSuccess?.(result._id);
		}
	};

	useEffect(() => {
		if (dateRange?.from) {
			form.setFieldValue("startDate", format(dateRange.from, "yyyy-MM-dd"));
			if (!isEditing) {
				form.setFieldValue("name", format(dateRange.from, "MMMM yyyy"));
			}
		}
		if (dateRange?.to) {
			form.setFieldValue("endDate", format(dateRange.to, "yyyy-MM-dd"));
		}
	}, [dateRange, form, isEditing]);

	useEffect(() => {
		form.setFieldValue("copyFromCycleId", copyFromCycleId);
	}, [copyFromCycleId, form]);

	const sourceCategories = useQuery(
		api.categories.list,
		copyFromCycleId
			? { cycleId: copyFromCycleId as Id<"expense_cycles"> }
			: "skip"
	);

	useEffect(() => {
		if (!sourceCategories) {
			return;
		}
		const ids = sourceCategories.map((category) => category._id);
		setSelectedCategoryIds(ids);
		const defaults: Record<string, number | undefined> = {};
		for (const category of sourceCategories) {
			defaults[category._id] = category.plannedAmount;
		}
		setPlannedAmounts(defaults);
		form.setFieldValue("copyCategoryIds" as never, ids as never);
		form.setFieldValue(
			"categoryPlannedOverrides" as never,
			ids.map((id) => ({
				id,
				plannedAmount: defaults[id],
			})) as never
		);
	}, [form, sourceCategories]);

	const includePlannedAmounts = form.getFieldValue("includePlannedAmounts");
	useEffect(() => {
		if (!sourceCategories) {
			return;
		}
		if (includePlannedAmounts) {
			const nextAmounts: Record<string, number | undefined> = {};
			for (const category of sourceCategories) {
				nextAmounts[category._id] = category.plannedAmount;
			}
			setPlannedAmounts(nextAmounts);
		} else {
			setPlannedAmounts((prev) => {
				const next = { ...prev };
				for (const category of sourceCategories) {
					next[category._id] = undefined;
				}
				return next;
			});
		}
	}, [includePlannedAmounts, sourceCategories]);

	useEffect(() => {
		form.setFieldValue(
			"copyCategoryIds" as never,
			selectedCategoryIds as never
		);
		form.setFieldValue(
			"categoryPlannedOverrides" as never,
			selectedCategoryIds.map((id) => ({
				id,
				plannedAmount: plannedAmounts[id],
			})) as never
		);
	}, [form, plannedAmounts, selectedCategoryIds]);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			event.stopPropagation();
			// Resubmission in TanStack Form may revalidate even while a save is pending.
			if (!form.state.isSubmitting) {
				form.handleSubmit();
			}
		},
		[form]
	);
	const handleCopySourceChange = useCallback((value: string) => {
		setCopyFromCycleId(value === "none" ? "" : (value as Id<"expense_cycles">));
	}, []);
	const handleSelectAllChange = useCallback(
		(checked: boolean | "indeterminate") => {
			setSelectedCategoryIds(
				checked && sourceCategories
					? sourceCategories.map((category) => category._id)
					: []
			);
		},
		[sourceCategories]
	);
	const handleCategorySelectedChange = useCallback(
		(id: Id<"categories">, selected: boolean) => {
			setSelectedCategoryIds((previous) =>
				selected
					? [...previous, id]
					: previous.filter((categoryId) => categoryId !== id)
			);
		},
		[]
	);
	const handleCategoryPlannedAmountChange = useCallback(
		(id: Id<"categories">, value: number | undefined) => {
			setPlannedAmounts((previous) => ({ ...previous, [id]: value }));
		},
		[]
	);

	return (
		<form className={className} onSubmit={handleSubmit}>
			<div className="space-y-6">
				<form.Field name="name">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Cycle Name</Label>
							<CycleNameInput
								name={field.name}
								onBlur={field.handleBlur}
								onValueChange={field.handleChange}
								value={field.state.value}
							/>
							{field.state.meta.isTouched &&
								field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-xs italic">
										{field.state.meta.errors.join(", ")}
									</p>
								)}
						</div>
					)}
				</form.Field>

				<div className="space-y-2">
					<Label>Date Range</Label>
					<DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
				</div>

				{!isEditing && allCycles && allCycles.length > 0 && (
					<div className="space-y-4 rounded-lg border bg-muted/30 p-4">
						<div className="space-y-2">
							<Label>Copy from previous cycle</Label>
							<Select
								onValueChange={handleCopySourceChange}
								value={copyFromCycleId || "none"}
							>
								<SelectTrigger>
									<SelectValue placeholder="Choose a cycle to copy" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Do not copy</SelectItem>
									{allCycles.map((cycle) => (
										<SelectItem key={cycle._id} value={cycle._id}>
											{cycle.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{copyFromCycleId &&
							sourceCategories &&
							sourceCategories.length > 0 && (
								<div className="space-y-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="flex items-center gap-2">
											<Checkbox
												checked={
													selectedCategoryIds.length === sourceCategories.length
												}
												id="select-all-categories"
												onCheckedChange={handleSelectAllChange}
											/>
											<Label htmlFor="select-all-categories">
												Select all categories
											</Label>
										</div>

										<form.Field name="includePlannedAmounts">
											{(innerField) => (
												<div className="flex items-center gap-2">
													<IncludePlannedCheckbox
														checked={innerField.state.value}
														onValueChange={innerField.handleChange}
													/>
													<Label
														className="text-muted-foreground text-xs"
														htmlFor="include-planned"
													>
														Prefill planned amounts
													</Label>
												</div>
											)}
										</form.Field>
									</div>

									<div className="space-y-3">
										{sourceCategories.map((category) => (
											<SourceCategoryRow
												category={category}
												key={category._id}
												onPlannedAmountChange={
													handleCategoryPlannedAmountChange
												}
												onSelectedChange={handleCategorySelectedChange}
												plannedAmount={plannedAmounts[category._id]}
												selected={selectedCategoryIds.includes(category._id)}
											/>
										))}
									</div>
								</div>
							)}

						{copyFromCycleId &&
							sourceCategories &&
							sourceCategories.length === 0 && (
								<p className="text-muted-foreground text-xs">
									This cycle has no categories to copy.
								</p>
							)}
					</div>
				)}

				<Button
					className="w-full"
					disabled={isSubmitting}
					size="lg"
					type="submit"
				>
					{isSubmitting ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							{isEditing ? "Saving..." : "Creating..."}
						</>
					) : (
						<>
							{isEditing ? (
								<Save className="mr-2 h-4 w-4" />
							) : (
								<Plus className="mr-2 h-4 w-4" />
							)}
							{isEditing ? "Save Changes" : "Create Cycle"}
						</>
					)}
				</Button>
			</div>
		</form>
	);
}
