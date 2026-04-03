"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import type { ColumnDef } from "@tanstack/react-table";
import Color from "color";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
	ArrowUpDown,
	Check,
	ChevronLeft,
	Layers,
	MoreHorizontal,
	Pencil,
	Pipette,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ColorPicker,
	ColorPickerFormat,
	ColorPickerHue,
	ColorPickerOutput,
	ColorPickerSelection,
} from "@/components/kibo-ui/color-picker";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DEFAULT_TYPE_COLOR = "#3b82f6";
const PRESET_COLORS = [
	"#3b82f6",
	"#f59e0b",
	"#10b981",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#6366f1",
	"#14b8a6",
	"#f97316",
	"#06b6d4",
] as const;
const SUGGESTED_TYPES = [
	{ name: "Needs", color: "#3b82f6" },
	{ name: "Wants", color: "#f59e0b" },
	{ name: "Savings", color: "#10b981" },
	{ name: "Fixed", color: "#6366f1" },
	{ name: "Variable", color: "#ec4899" },
	{ name: "Debt", color: "#ef4444" },
	{ name: "Investments", color: "#8b5cf6" },
	{ name: "Business", color: "#14b8a6" },
] as const;

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6})$/;

interface CategoryTypeItem {
	_id: Id<"category_types">;
	name: string;
	color?: string;
	order?: number;
	createdAt: number;
	usageCount: number;
}

interface TypeViewModel {
	id: Id<"category_types">;
	name: string;
	normalizedColor: string;
	createdAt: number;
	usageCount: number;
	isInUse: boolean;
}

const normalizeColor = (color?: string) => {
	if (!color) {
		return "hsl(var(--muted))";
	}

	return HEX_COLOR_REGEX.test(color) ? color : "hsl(var(--muted))";
};

const getErrorMessage = (error: unknown, fallback: string) => {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message.replace("ConvexError: ", "");
	}

	return fallback;
};

function TypesLoadingState() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-36 w-full rounded-2xl" />
			<Skeleton className="h-10 w-full max-w-sm" />
			<Skeleton className="hidden h-64 w-full rounded-lg md:block" />
			<div className="space-y-3 md:hidden">
				<Skeleton className="h-24 w-full rounded-lg" />
				<Skeleton className="h-24 w-full rounded-lg" />
				<Skeleton className="h-24 w-full rounded-lg" />
			</div>
		</div>
	);
}

interface TypesSummaryStripProps {
	total: number;
	inUse: number;
	unused: number;
}

function TypesSummaryStrip({ total, inUse, unused }: TypesSummaryStripProps) {
	return (
		<Card className="overflow-hidden rounded-2xl border-border/70 bg-card/50 shadow-sm">
			<CardContent className="grid gap-0 p-0 md:grid-cols-3">
				<div className="space-y-3 p-5">
					<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
						Total Types
					</p>
					<div className="space-y-1">
						<p className="font-semibold text-4xl tabular-nums leading-none">
							{total}
						</p>
						<p className="text-muted-foreground text-sm">
							Available category groups
						</p>
					</div>
				</div>

				<div className="space-y-3 border-border/70 border-t p-5 md:border-t-0 md:border-l">
					<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
						In Use
					</p>
					<div className="space-y-1">
						<p className="font-semibold text-4xl tabular-nums leading-none">
							{inUse}
						</p>
						<p className="text-muted-foreground text-sm">
							Assigned to at least one category
						</p>
					</div>
				</div>

				<div className="space-y-3 border-border/70 border-t p-5 md:border-t-0 md:border-l">
					<p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
						Unused
					</p>
					<div className="space-y-1">
						<p className="font-semibold text-4xl tabular-nums leading-none">
							{unused}
						</p>
						<p className="text-muted-foreground text-sm">
							Ready to be assigned or cleaned up
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

interface TypeFormFieldsProps {
	name: string;
	color: string;
	onNameChange: (value: string) => void;
	onColorChange: (value: string) => void;
	nameId: string;
	colorId: string;
	enablePopoverColorPicker?: boolean;
	suggestions?: readonly { name: string; color: string }[];
	onSuggestionClick?: (suggestion: { name: string; color: string }) => void;
}

interface MobileTypeCardProps {
	type: TypeViewModel;
	onEdit: (type: TypeViewModel) => void;
	onDelete: (type: TypeViewModel) => void;
}

function MobileTypeCard({ type, onEdit, onDelete }: MobileTypeCardProps) {
	const usageStatusText = type.isInUse ? "In use" : "Unused";

	return (
		<div className="rounded-lg border bg-card/40 p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<span
							className="h-3 w-3 rounded-full border"
							style={{ backgroundColor: type.normalizedColor }}
						/>
						<p className="font-medium">{type.name}</p>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant={type.isInUse ? "default" : "outline"}>
							{type.usageCount}{" "}
							{type.usageCount === 1 ? "category" : "categories"}
						</Badge>
						<span className="text-muted-foreground text-xs">
							{usageStatusText}
						</span>
					</div>
					<p className="text-muted-foreground text-xs">
						Created {format(type.createdAt, "MMM d, yyyy")}
					</p>
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => onEdit(type)}>
							<Pencil className="mr-2 h-4 w-4" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-destructive focus:text-destructive"
							onClick={() => onDelete(type)}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

function TypeFormFields({
	name,
	color,
	onNameChange,
	onColorChange,
	nameId,
	colorId,
	enablePopoverColorPicker = false,
	suggestions = [],
	onSuggestionClick,
}: TypeFormFieldsProps) {
	const handleColorPickerChange = useCallback(
		(rgba: [number, number, number, number]) => {
			const hex = Color.rgb(rgba[0], rgba[1], rgba[2]).hex();
			onColorChange(hex);
		},
		[onColorChange]
	);

	return (
		<>
			<div className="space-y-2">
				<Label htmlFor={nameId}>Type Name</Label>
				<Input
					autoFocus
					id={nameId}
					onChange={(e) => onNameChange(e.target.value)}
					placeholder="e.g. Fixed Costs, Subscriptions"
					required
					value={name}
				/>
			</div>

			<div className="space-y-3">
				<Label htmlFor={colorId}>Color</Label>
				<div className="flex items-center gap-3">
					{enablePopoverColorPicker ? (
						<div aria-hidden="true" className="h-10 w-20 rounded-md border p-1">
							<div
								className="h-full w-full rounded-[4px]"
								style={{ backgroundColor: normalizeColor(color) }}
							/>
						</div>
					) : (
						<Input
							className="h-10 w-20 p-1"
							id={colorId}
							onChange={(e) => onColorChange(e.target.value)}
							type="color"
							value={color}
						/>
					)}
					<div className="flex items-center gap-2">
						<span
							className="h-4 w-4 rounded-full border"
							style={{ backgroundColor: normalizeColor(color) }}
						/>
						<span className="font-mono text-sm uppercase">{color}</span>
					</div>

					{enablePopoverColorPicker && (
						<Popover>
							<PopoverTrigger asChild>
								<Button
									className="h-8 w-8 rounded-full"
									size="icon"
									type="button"
									variant="outline"
								>
									<Pipette className="h-4 w-4 text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-80 p-4">
								<ColorPicker
									className="space-y-3"
									onChange={handleColorPickerChange}
									value={color}
								>
									<div className="flex h-32 gap-3">
										<ColorPickerSelection className="flex-1" />
										<div className="flex flex-col gap-2">
											<div
												className="h-10 w-10 rounded-xl border shadow-inner"
												style={{ backgroundColor: normalizeColor(color) }}
											/>
											<ColorPickerOutput />
										</div>
									</div>
									<ColorPickerHue />
									<ColorPickerFormat />
								</ColorPicker>
							</PopoverContent>
						</Popover>
					)}
				</div>

				<div className="flex flex-wrap gap-2">
					{PRESET_COLORS.map((presetColor) => (
						<button
							aria-label={`Select ${presetColor} color`}
							className={cn(
								"group relative flex h-6 w-6 items-center justify-center rounded-full border transition-transform hover:scale-105",
								color.toLowerCase() === presetColor.toLowerCase()
									? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
									: ""
							)}
							key={presetColor}
							onClick={() => onColorChange(presetColor)}
							style={{ backgroundColor: presetColor }}
							type="button"
						>
							{color.toLowerCase() === presetColor.toLowerCase() && (
								<Check className="h-3 w-3 text-white drop-shadow-md" />
							)}
						</button>
					))}
				</div>

				{suggestions.length > 0 && onSuggestionClick && (
					<div className="space-y-2">
						<Label className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
							Suggestions
						</Label>
						<div className="flex flex-wrap gap-2">
							{suggestions.map((suggestion) => (
								<Button
									className="h-8 gap-1.5 rounded-full border-dashed px-3 text-xs"
									key={suggestion.name}
									onClick={() => onSuggestionClick(suggestion)}
									type="button"
									variant="outline"
								>
									<span
										className="h-2 w-2 rounded-full"
										style={{ backgroundColor: suggestion.color }}
									/>
									{suggestion.name}
								</Button>
							))}
						</div>
					</div>
				)}
			</div>
		</>
	);
}

export default function CategoryTypesPage() {
	const types = useQuery(api.categories.listTypesWithUsage) as
		| CategoryTypeItem[]
		| undefined;
	const createType = useMutation(api.categories.createType);
	const updateType = useMutation(api.categories.updateType);
	const deleteType = useMutation(api.categories.deleteType);

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [editingType, setEditingType] = useState<{
		id: Id<"category_types">;
		name: string;
		color: string;
	} | null>(null);
	const [newTypeName, setNewTypeName] = useState("");
	const [newTypeColor, setNewTypeColor] = useState(DEFAULT_TYPE_COLOR);
	const [searchValue, setSearchValue] = useState("");
	const [filterMode, setFilterMode] = useState<"all" | "inUse">("all");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [typePendingDelete, setTypePendingDelete] =
		useState<TypeViewModel | null>(null);

	const viewTypes = useMemo<TypeViewModel[]>(() => {
		if (!types) {
			return [];
		}

		return types.map((type) => ({
			id: type._id,
			name: type.name,
			normalizedColor: normalizeColor(type.color),
			createdAt: type.createdAt,
			usageCount: type.usageCount,
			isInUse: type.usageCount > 0,
		}));
	}, [types]);

	const filteredTypes = useMemo(() => {
		const searchTerm = searchValue.trim().toLowerCase();

		return viewTypes.filter((type) => {
			const matchesFilter = filterMode === "all" || type.isInUse;
			const matchesSearch =
				searchTerm.length === 0 || type.name.toLowerCase().includes(searchTerm);

			return matchesFilter && matchesSearch;
		});
	}, [filterMode, searchValue, viewTypes]);

	const kpis = useMemo(() => {
		const total = viewTypes.length;
		const inUse = viewTypes.filter((type) => type.isInUse).length;

		return {
			total,
			inUse,
			unused: Math.max(total - inUse, 0),
		};
	}, [viewTypes]);

	const createSuggestions = useMemo(() => {
		const existingTypeNames = new Set(
			viewTypes.map((type) => type.name.trim().toLowerCase())
		);

		return SUGGESTED_TYPES.filter(
			(suggestion) => !existingTypeNames.has(suggestion.name.toLowerCase())
		);
	}, [viewTypes]);

	const resetAddForm = () => {
		setNewTypeName("");
		setNewTypeColor(DEFAULT_TYPE_COLOR);
	};

	const handleAddType = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmedName = newTypeName.trim();
		if (!trimmedName) {
			return;
		}

		setIsSubmitting(true);
		try {
			await createType({
				name: trimmedName,
				color: newTypeColor,
			});
			resetAddForm();
			setIsAddOpen(false);
			toast.success("Category type created successfully");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to create category type"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleEditType = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingType) {
			return;
		}

		const trimmedName = editingType.name.trim();
		if (!trimmedName) {
			return;
		}

		setIsSubmitting(true);
		try {
			await updateType({
				id: editingType.id,
				name: trimmedName,
				color: editingType.color,
			});
			setEditingType(null);
			setIsEditOpen(false);
			toast.success("Category type updated successfully");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to update category type"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDeleteType = useCallback(
		async (type: TypeViewModel) => {
			try {
				await deleteType({ id: type.id });
				toast.success("Category type deleted");
			} catch (error) {
				toast.error(getErrorMessage(error, "Failed to delete category type"));
			}
		},
		[deleteType]
	);

	const openEditDialog = useCallback((type: TypeViewModel) => {
		setEditingType({
			id: type.id,
			name: type.name,
			color: HEX_COLOR_REGEX.test(type.normalizedColor)
				? type.normalizedColor
				: DEFAULT_TYPE_COLOR,
		});
		setIsEditOpen(true);
	}, []);

	const columns = useMemo<ColumnDef<TypeViewModel>[]>(
		() => [
			{
				accessorKey: "name",
				headerClassName: "pl-5",
				className: "pl-5",
				header: ({ column }) => (
					<Button
						className="h-8 px-0"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
						variant="ghost"
					>
						Type Name
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => {
					const type = row.original;
					return (
						<div className="flex items-center gap-2">
							<span
								aria-hidden="true"
								className="h-3 w-3 rounded-full border"
								style={{ backgroundColor: type.normalizedColor }}
							/>
							<Badge className="font-medium" variant="secondary">
								{type.name}
							</Badge>
						</div>
					);
				},
			},
			{
				accessorKey: "usageCount",
				header: ({ column }) => (
					<Button
						className="-ml-4 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
						variant="ghost"
					>
						Usage
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => {
					const type = row.original;

					return (
						<div className="flex items-center gap-2">
							<Badge variant={type.isInUse ? "default" : "outline"}>
								{type.usageCount}{" "}
								{type.usageCount === 1 ? "category" : "categories"}
							</Badge>
							<span className="text-muted-foreground text-xs">
								{type.isInUse ? "In use" : "Unused"}
							</span>
						</div>
					);
				},
			},
			{
				accessorKey: "createdAt",
				header: ({ column }) => (
					<Button
						className="-ml-4 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
						variant="ghost"
					>
						Created
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => format(row.original.createdAt, "MMM d, yyyy"),
			},
			{
				id: "actions",
				cell: ({ row }) => {
					const type = row.original;

					return (
						<div className="flex justify-end pr-2">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										size="icon"
										variant="ghost"
									>
										<MoreHorizontal className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={() => openEditDialog(type)}>
										<Pencil className="mr-2 h-4 w-4" />
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() => setTypePendingDelete(type)}
									>
										<Trash2 className="mr-2 h-4 w-4" />
										Delete
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					);
				},
			},
		],
		[openEditDialog]
	);

	const hasNoTypes = types !== undefined && viewTypes.length === 0;
	const hasNoSearchResults = !hasNoTypes && filteredTypes.length === 0;

	let content: React.ReactNode = (
		<>
			<div className="hidden md:block">
				<DataTable
					columns={columns}
					data={filteredTypes}
					deleteDescription="This will permanently remove the category type and unassign it from all categories."
					deleteTitle="Delete category type?"
					externalSearchValue={searchValue}
					onExternalSearchChange={setSearchValue}
				/>
			</div>

			<div className="space-y-3 md:hidden">
				{filteredTypes.map((type) => (
					<MobileTypeCard
						key={type.id}
						onDelete={(nextType) => setTypePendingDelete(nextType)}
						onEdit={openEditDialog}
						type={type}
					/>
				))}
			</div>
		</>
	);

	if (hasNoTypes) {
		content = (
			<EmptyState
				action={
					<Button onClick={() => setIsAddOpen(true)} variant="outline">
						<Plus className="mr-2 h-4 w-4" />
						Add your first type
					</Button>
				}
				description="You haven't created any category types yet. Use types to group your categories for better budgeting."
				icon={<Layers className="h-12 w-12" />}
				title="No category types found"
			/>
		);
	}

	if (!hasNoTypes && hasNoSearchResults) {
		content = (
			<EmptyState
				description="Try a different search term or switch back to All types."
				icon={<Search className="h-10 w-10" />}
				title="No matching types"
			/>
		);
	}

	return (
		<div className="space-y-8 py-3">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-4">
					<Button asChild size="icon" variant="ghost">
						<Link href="/settings">
							<ChevronLeft className="h-5 w-5" />
						</Link>
					</Button>
					<div>
						<h1 className="font-bold text-3xl tracking-tight">
							Category Types
						</h1>
						<p className="text-muted-foreground text-sm">
							Organize categories into broad buckets like Needs, Wants, and
							Savings.
						</p>
					</div>
				</div>
				<Dialog
					onOpenChange={(open) => {
						setIsAddOpen(open);
						if (!open) {
							resetAddForm();
						}
					}}
					open={isAddOpen}
				>
					<DialogTrigger asChild>
						<Button size="sm">
							<Plus className="mr-2 h-4 w-4" />
							New Type
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create Category Type</DialogTitle>
							<DialogDescription>
								Add a new classification for your expense categories.
							</DialogDescription>
						</DialogHeader>
						<form className="space-y-4" onSubmit={handleAddType}>
							<TypeFormFields
								color={newTypeColor}
								colorId="create-type-color"
								enablePopoverColorPicker
								name={newTypeName}
								nameId="create-type-name"
								onColorChange={setNewTypeColor}
								onNameChange={setNewTypeName}
								onSuggestionClick={(suggestion) => {
									setNewTypeName(suggestion.name);
									setNewTypeColor(suggestion.color);
								}}
								suggestions={createSuggestions}
							/>
							<DialogFooter>
								<Button
									disabled={isSubmitting || !newTypeName.trim()}
									type="submit"
								>
									{isSubmitting ? "Creating..." : "Create Type"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			{types === undefined ? (
				<TypesLoadingState />
			) : (
				<>
					<TypesSummaryStrip
						inUse={kpis.inUse}
						total={kpis.total}
						unused={kpis.unused}
					/>

					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<div className="relative w-full sm:max-w-sm">
							<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								className="pl-9"
								onChange={(e) => setSearchValue(e.target.value)}
								placeholder="Search types..."
								type="search"
								value={searchValue}
							/>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={() => setFilterMode("all")}
								size="sm"
								variant={filterMode === "all" ? "default" : "outline"}
							>
								All
							</Button>
							<Button
								onClick={() => setFilterMode("inUse")}
								size="sm"
								variant={filterMode === "inUse" ? "default" : "outline"}
							>
								In use
							</Button>
						</div>
					</div>

					{content}
				</>
			)}

			<Dialog
				onOpenChange={(open) => {
					setIsEditOpen(open);
					if (!open) {
						setEditingType(null);
					}
				}}
				open={isEditOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Category Type</DialogTitle>
						<DialogDescription>
							Modify the name or color for this classification.
						</DialogDescription>
					</DialogHeader>
					<form className="space-y-4" onSubmit={handleEditType}>
						<TypeFormFields
							color={editingType?.color ?? DEFAULT_TYPE_COLOR}
							colorId="edit-type-color"
							name={editingType?.name ?? ""}
							nameId="edit-type-name"
							onColorChange={(value) =>
								setEditingType((prev) =>
									prev
										? {
												...prev,
												color: value,
											}
										: null
								)
							}
							onNameChange={(value) =>
								setEditingType((prev) =>
									prev
										? {
												...prev,
												name: value,
											}
										: null
								)
							}
						/>
						<DialogFooter>
							<Button
								disabled={isSubmitting || !editingType?.name.trim()}
								type="submit"
							>
								{isSubmitting ? "Saving..." : "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setTypePendingDelete(null);
					}
				}}
				open={typePendingDelete !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete category type?</AlertDialogTitle>
						<AlertDialogDescription>
							{typePendingDelete?.isInUse ? (
								<>
									This type is used by {typePendingDelete.usageCount}{" "}
									{typePendingDelete.usageCount === 1
										? "category"
										: "categories"}
									. Deleting it will unassign those categories from this type.
									If a category is deleted, its expenses will become
									uncategorized.
								</>
							) : (
								<>
									This will permanently remove the category type. If a category
									is deleted, its expenses will become uncategorized.
								</>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (!typePendingDelete) {
									return;
								}
								await handleDeleteType(typePendingDelete);
								setTypePendingDelete(null);
							}}
							variant="destructive"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
