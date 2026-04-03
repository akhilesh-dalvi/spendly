"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { Loader2, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
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
	name: z.string().min(1, "Name is required"),
	startDate: z.string(),
	endDate: z.string(),
	copyFromCycleId: z.string().optional(),
	includePlannedAmounts: z.boolean().optional(),
	copyCategoryIds: z.array(z.string()).optional(),
	categoryPlannedOverrides: z
		.array(
			z.object({
				id: z.string(),
				plannedAmount: z.number().optional(),
			})
		)
		.optional(),
});
type CycleFormValues = z.infer<typeof cycleSchema>;

interface CycleFormProps {
	onSuccess?: (cycleId: string) => void;
	className?: string;
	cycleId?: Id<"expense_cycles">;
	defaultValues?: Partial<{
		name: string;
		startDate: string;
		endDate: string;
	}>;
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
			name: defaultValues?.name ?? format(new Date(), "MMMM yyyy"),
			startDate:
				defaultValues?.startDate ??
				format(startOfMonth(new Date()), "yyyy-MM-dd"),
			endDate:
				defaultValues?.endDate ?? format(endOfMonth(new Date()), "yyyy-MM-dd"),
			copyFromCycleId: "",
			includePlannedAmounts: true,
			copyCategoryIds: [],
			categoryPlannedOverrides: [],
		},
		validators: {
			onChange: ({ value }) => {
				const result = cycleSchema.partial().safeParse(value);
				if (!result.success) {
					return result.error.flatten().fieldErrors;
				}
				return undefined;
			},
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
	});

	const handleUpdateCycle = async (
		value: CycleFormValues,
		currentCycleId: Id<"expense_cycles">
	) => {
		await updateCycle({
			id: currentCycleId,
			name: value.name,
			startDate: value.startDate,
			endDate: value.endDate,
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
			name: value.name,
			startDate: value.startDate,
			endDate: value.endDate,
			copyFromCycleId: value.copyFromCycleId
				? (value.copyFromCycleId as Id<"expense_cycles">)
				: undefined,
			includePlannedAmounts: value.includePlannedAmounts,
			copyCategoryIds: copyCategoryIds?.length
				? (copyCategoryIds as Id<"categories">[])
				: undefined,
			categoryPlannedOverrides: categoryPlannedOverrides?.length
				? categoryPlannedOverrides.map(({ id, plannedAmount }) => ({
						id: id as Id<"categories">,
						plannedAmount,
					}))
				: undefined,
		});
		toast.success("Cycle created successfully");
		if (result?._id) {
			onSuccess?.(result._id);
		}
	};

	useEffect(() => {
		if (dateRange?.from) {
			form.setFieldValue("startDate", format(dateRange.from, "yyyy-MM-dd"));
			// Auto-suggest name based on start date if name is default or matches pattern
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

	return (
		<form
			className={className}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<div className="space-y-6">
				<form.Field name="name">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Cycle Name</Label>
							<Input
								id={field.name}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="e.g. February 2026"
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
								onValueChange={(value) =>
									setCopyFromCycleId(
										value === "none" ? "" : (value as Id<"expense_cycles">)
									)
								}
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
												onCheckedChange={(checked) => {
													const shouldSelectAll = Boolean(checked);
													const ids = shouldSelectAll
														? sourceCategories.map((category) => category._id)
														: [];
													setSelectedCategoryIds(ids);
												}}
											/>
											<Label htmlFor="select-all-categories">
												Select all categories
											</Label>
										</div>

										<form.Field name="includePlannedAmounts">
											{(innerField) => (
												<div className="flex items-center gap-2">
													<Checkbox
														checked={innerField.state.value}
														id="include-planned"
														onCheckedChange={(checked) =>
															innerField.handleChange(!!checked)
														}
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
										{sourceCategories.map((category) => {
											const selected = selectedCategoryIds.includes(
												category._id
											);
											return (
												<div
													className="flex flex-col gap-3 rounded-md border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between"
													key={category._id}
												>
													<div className="flex items-start gap-3">
														<Checkbox
															checked={selected}
															id={`category-${category._id}`}
															onCheckedChange={(checked) => {
																const shouldSelect = Boolean(checked);
																setSelectedCategoryIds((prev) =>
																	shouldSelect
																		? [...prev, category._id]
																		: prev.filter((id) => id !== category._id)
																);
															}}
														/>
														<div className="space-y-1">
															<Label htmlFor={`category-${category._id}`}>
																{category.name}
															</Label>
															{category.typeName && (
																<p className="text-muted-foreground text-xs">
																	{category.typeName}
																</p>
															)}
														</div>
													</div>

													<div className="w-full sm:w-48">
														<CurrencyInput
															disabled={!selected}
															onChange={(value) =>
																setPlannedAmounts((prev) => ({
																	...prev,
																	[category._id]: value,
																}))
															}
															placeholder="Planned amount"
															value={plannedAmounts[category._id]}
														/>
													</div>
												</div>
											);
										})}
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
					disabled={form.state.isSubmitting}
					size="lg"
					type="submit"
				>
					{form.state.isSubmitting ? (
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
