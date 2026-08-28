"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
	ArrowUpDown,
	ChevronLeft,
	MoreHorizontal,
	Pencil,
	Plus,
	Search,
	Tag,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataSummaryStrip } from "@/components/data-summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";

interface TagItem {
	_id: Id<"tags">;
	name: string;
	createdAt: number;
	usageCount: number;
}

interface TagViewModel {
	id: Id<"tags">;
	name: string;
	createdAt: number;
	usageCount: number;
	isInUse: boolean;
}
const SUGGESTED_TAGS = [
	"Groceries",
	"Recurring",
	"Work",
	"Family",
	"Travel",
	"Health",
	"Entertainment",
	"Utilities",
] as const;

interface TagFormFieldsProps {
	name: string;
	nameId: string;
	onNameChange: (value: string) => void;
	suggestions?: readonly string[];
	onSuggestionClick?: (suggestion: string) => void;
}

interface MobileTagCardProps {
	tag: TagViewModel;
	onEdit: (tag: TagViewModel) => void;
	onDelete: (tag: TagViewModel) => void;
}

const getErrorMessage = (error: unknown, fallback: string) => {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message.replace("ConvexError: ", "");
	}

	return fallback;
};

function TagsLoadingState() {
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

interface TagsSummaryStripProps {
	total: number;
	inUse: number;
	unused: number;
}

function TagsSummaryStrip({ total, inUse, unused }: TagsSummaryStripProps) {
	const summaryItems = [
		{
			description: "Available global tags",
			label: "Total Tags",
			value: total,
		},
		{
			description: "Applied to at least one expense",
			label: "In Use",
			value: inUse,
		},
		{
			description: "Ready to be reused or removed",
			label: "Unused",
			value: unused,
		},
	] as const;

	return <DataSummaryStrip ariaLabel="Tag overview" items={summaryItems} />;
}

function TagFormFields({
	name,
	nameId,
	onNameChange,
	suggestions = [],
	onSuggestionClick,
}: TagFormFieldsProps) {
	return (
		<div className="space-y-3">
			<div className="space-y-2">
				<Label htmlFor={nameId}>Tag Name</Label>
				<Input
					autoFocus
					id={nameId}
					onChange={(e) => onNameChange(e.target.value)}
					placeholder="e.g. Work Trip, Recurring"
					required
					value={name}
				/>
			</div>

			{suggestions.length > 0 && onSuggestionClick && (
				<div className="space-y-2">
					<Label className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
						Suggestions
					</Label>
					<div className="flex flex-wrap gap-2">
						{suggestions.map((suggestion) => (
							<Button
								className="h-8 rounded-full border-dashed px-3 text-xs"
								key={suggestion}
								onClick={() => onSuggestionClick(suggestion)}
								type="button"
								variant="outline"
							>
								{suggestion}
							</Button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function MobileTagCard({ tag, onEdit, onDelete }: MobileTagCardProps) {
	const usageStatusText = tag.isInUse ? "In use" : "Unused";

	return (
		<div className="rounded-lg border bg-card/40 p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<Tag className="h-3.5 w-3.5 text-muted-foreground" />
						<Badge className="font-medium" variant="secondary">
							{tag.name}
						</Badge>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant={tag.isInUse ? "default" : "outline"}>
							{tag.usageCount} {tag.usageCount === 1 ? "expense" : "expenses"}
						</Badge>
						<span className="text-muted-foreground text-xs">
							{usageStatusText}
						</span>
					</div>
					<p className="text-muted-foreground text-xs">
						Created {format(tag.createdAt, "MMM d, yyyy")}
					</p>
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => onEdit(tag)}>
							<Pencil className="mr-2 h-4 w-4" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-destructive focus:text-destructive"
							onClick={() => onDelete(tag)}
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

export default function TagsPage() {
	const tags = useQuery(api.tags.listWithUsage) as TagItem[] | undefined;
	const createTag = useMutation(api.tags.create);
	const updateTag = useMutation(api.tags.update);
	const deleteTag = useMutation(api.tags.remove);

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [editingTag, setEditingTag] = useState<{
		id: Id<"tags">;
		name: string;
	} | null>(null);
	const [newTagName, setNewTagName] = useState("");
	const [searchValue, setSearchValue] = useState("");
	const [filterMode, setFilterMode] = useState<"all" | "inUse">("all");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const viewTags = useMemo<TagViewModel[]>(() => {
		if (!tags) {
			return [];
		}

		return tags.map((tag) => ({
			id: tag._id,
			name: tag.name,
			createdAt: tag.createdAt,
			usageCount: tag.usageCount,
			isInUse: tag.usageCount > 0,
		}));
	}, [tags]);

	const filteredTags = useMemo(() => {
		const searchTerm = searchValue.trim().toLowerCase();

		return viewTags.filter((tag) => {
			const matchesFilter = filterMode === "all" || tag.isInUse;
			const matchesSearch =
				searchTerm.length === 0 || tag.name.toLowerCase().includes(searchTerm);

			return matchesFilter && matchesSearch;
		});
	}, [filterMode, searchValue, viewTags]);

	const kpis = useMemo(() => {
		const total = viewTags.length;
		const inUse = viewTags.filter((tag) => tag.isInUse).length;

		return {
			total,
			inUse,
			unused: Math.max(total - inUse, 0),
		};
	}, [viewTags]);

	const createSuggestions = useMemo(() => {
		const existingTagNames = new Set(
			viewTags.map((tag) => tag.name.trim().toLowerCase())
		);

		return SUGGESTED_TAGS.filter(
			(suggestion) => !existingTagNames.has(suggestion.toLowerCase())
		);
	}, [viewTags]);

	const resetAddForm = () => {
		setNewTagName("");
	};

	const handleAddTag = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmedName = newTagName.trim();
		if (!trimmedName) {
			return;
		}

		setIsSubmitting(true);
		try {
			await createTag({
				name: trimmedName,
			});
			resetAddForm();
			setIsAddOpen(false);
			toast.success("Tag created successfully");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to create tag"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleEditTag = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingTag) {
			return;
		}

		const trimmedName = editingTag.name.trim();
		if (!trimmedName) {
			return;
		}

		setIsSubmitting(true);
		try {
			await updateTag({
				tagId: editingTag.id,
				name: trimmedName,
			});
			setEditingTag(null);
			setIsEditOpen(false);
			toast.success("Tag updated successfully");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to update tag"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDeleteTag = useCallback(
		async (tag: TagViewModel) => {
			try {
				await deleteTag({ tagId: tag.id });
				toast.success("Tag deleted");
			} catch (error) {
				toast.error(getErrorMessage(error, "Failed to delete tag"));
			}
		},
		[deleteTag]
	);

	const openEditDialog = useCallback((tag: TagViewModel) => {
		setEditingTag({
			id: tag.id,
			name: tag.name,
		});
		setIsEditOpen(true);
	}, []);

	const columns = useMemo<ColumnDef<TagViewModel>[]>(
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
						Tag Name
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => {
					const tag = row.original;

					return (
						<div className="flex items-center gap-2">
							<Tag className="h-3.5 w-3.5 text-muted-foreground" />
							<Badge className="font-medium" variant="secondary">
								{tag.name}
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
					const tag = row.original;

					return (
						<div className="flex items-center gap-2">
							<Badge variant={tag.isInUse ? "default" : "outline"}>
								{tag.usageCount} {tag.usageCount === 1 ? "expense" : "expenses"}
							</Badge>
							<span className="text-muted-foreground text-xs">
								{tag.isInUse ? "In use" : "Unused"}
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
					const tag = row.original;

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
									<DropdownMenuItem onClick={() => openEditDialog(tag)}>
										<Pencil className="mr-2 h-4 w-4" />
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() => handleDeleteTag(tag)}
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
		[handleDeleteTag, openEditDialog]
	);

	const hasNoTags = tags !== undefined && viewTags.length === 0;
	const hasNoSearchResults = !hasNoTags && filteredTags.length === 0;

	let content: React.ReactNode = (
		<>
			<div className="hidden md:block">
				<DataTable
					columns={columns}
					data={filteredTags}
					deleteDescription="This will permanently remove the tag and detach it from all expenses."
					deleteTitle="Delete tag?"
					externalSearchValue={searchValue}
					onExternalSearchChange={setSearchValue}
				/>
			</div>

			<div className="space-y-3 md:hidden">
				{filteredTags.map((tag) => (
					<MobileTagCard
						key={tag.id}
						onDelete={handleDeleteTag}
						onEdit={openEditDialog}
						tag={tag}
					/>
				))}
			</div>
		</>
	);

	if (hasNoTags) {
		content = (
			<EmptyState
				action={
					<Button onClick={() => setIsAddOpen(true)} variant="outline">
						<Plus className="mr-2 h-4 w-4" />
						Add your first tag
					</Button>
				}
				description="You haven't created any tags yet. Tags help you organize and filter your expenses across different categories."
				icon={<Tag className="h-12 w-12" />}
				title="No tags found"
			/>
		);
	}

	if (!hasNoTags && hasNoSearchResults) {
		content = (
			<EmptyState
				description="Try a different search term or switch back to All tags."
				icon={<Search className="h-10 w-10" />}
				title="No matching tags"
			/>
		);
	}

	return (
		<div className="space-y-8 py-3">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-4">
					<Button asChild size="icon" variant="ghost">
						<Link aria-label="Back to dashboard" href="/dashboard">
							<ChevronLeft className="h-5 w-5" />
						</Link>
					</Button>
					<div>
						<h1 className="font-bold text-3xl tracking-tight">Tags</h1>
						<p className="text-muted-foreground text-sm">
							Manage global tags for adding context to your expenses.
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
							New Tag
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create Tag</DialogTitle>
							<DialogDescription>
								Add a new global tag for your expenses.
							</DialogDescription>
						</DialogHeader>
						<form className="space-y-4" onSubmit={handleAddTag}>
							<TagFormFields
								name={newTagName}
								nameId="create-tag-name"
								onNameChange={setNewTagName}
								onSuggestionClick={setNewTagName}
								suggestions={createSuggestions}
							/>
							<DialogFooter>
								<Button
									disabled={isSubmitting || !newTagName.trim()}
									type="submit"
								>
									{isSubmitting ? "Creating..." : "Create Tag"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			{tags === undefined ? (
				<TagsLoadingState />
			) : (
				<>
					<TagsSummaryStrip
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
								placeholder="Search tags..."
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
						setEditingTag(null);
					}
				}}
				open={isEditOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Tag</DialogTitle>
						<DialogDescription>Rename this global tag.</DialogDescription>
					</DialogHeader>
					<form className="space-y-4" onSubmit={handleEditTag}>
						<TagFormFields
							name={editingTag?.name ?? ""}
							nameId="edit-tag-name"
							onNameChange={(value) =>
								setEditingTag((prev) =>
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
								disabled={isSubmitting || !editingTag?.name.trim()}
								type="submit"
							>
								{isSubmitting ? "Saving..." : "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
