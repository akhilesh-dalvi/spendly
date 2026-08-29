"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	Archive,
	ArchiveRestore,
	ChevronLeft,
	CircleAlert,
	CircleDollarSign,
	Info,
	LoaderCircle,
	MoreHorizontal,
	Pencil,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
	ACCOUNT_TYPE_ICON_OPTIONS,
	AccountTypeIcon,
} from "@/components/account-type-icon";
import { DataSummaryStrip } from "@/components/data-summary-strip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccountActionErrorMessage } from "@/lib/accounts";
import { cn } from "@/lib/utils";

type AccountTypeItem = Doc<"account_types">;
type BalanceNature = AccountTypeItem["balanceNature"];

const EMPTY_ACCOUNT_TYPES: AccountTypeItem[] = [];

interface AccountTypeFormState {
	balanceNature: BalanceNature;
	color: string;
	icon: string;
	name: string;
}

const DEFAULT_CUSTOM_COLOR = "#6366F1";
const HEX_COLOR_PATTERN = /^#[\dA-Fa-f]{6}$/;
const COLOR_PRESETS = [
	"#6366F1",
	"#0EA5E9",
	"#14B8A6",
	"#22C55E",
	"#F59E0B",
	"#F97316",
	"#EF4444",
	"#A855F7",
] as const;

const EMPTY_FORM: AccountTypeFormState = {
	balanceNature: "asset",
	color: DEFAULT_CUSTOM_COLOR,
	icon: "circle-dollar-sign",
	name: "",
};

const getInitialFormState = (
	accountType: AccountTypeItem | null
): AccountTypeFormState => {
	if (!accountType) {
		return EMPTY_FORM;
	}

	return {
		balanceNature: accountType.balanceNature,
		color: accountType.color ?? "",
		icon: accountType.icon ?? "",
		name: accountType.name,
	};
};

const getNatureDescription = (balanceNature: BalanceNature): string => {
	if (balanceNature === "liability") {
		return "Negative balances represent money owed, such as credit cards or loans.";
	}
	return "Positive balances represent money available, such as cash or savings.";
};

function AccountTypesLoadingState() {
	return (
		<div className="flex flex-col gap-5">
			<Skeleton className="h-32 w-full rounded-2xl" />
			<div className="flex flex-col gap-3">
				<Skeleton className="h-40 w-full rounded-xl" />
				<Skeleton className="h-40 w-full rounded-xl" />
				<Skeleton className="h-40 w-full rounded-xl" />
			</div>
		</div>
	);
}

function AccountTypesSummary({ types }: { types: AccountTypeItem[] }) {
	const activeCount = types.filter((type) => !type.isArchived).length;
	const liabilityCount = types.filter(
		(type) => type.balanceNature === "liability"
	).length;
	const summaryItems = [
		{
			description: "Custom classifications",
			label: "Total Types",
			value: types.length,
		},
		{
			description: "Available for assignment",
			label: "Active",
			value: activeCount,
		},
		{
			description: "Track money owed",
			label: "Liabilities",
			value: liabilityCount,
		},
	] as const;

	return (
		<DataSummaryStrip ariaLabel="Account type overview" items={summaryItems} />
	);
}

interface AccountTypeEditorDialogProps {
	accountType: AccountTypeItem | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

function AccountTypeEditorDialog({
	accountType,
	onOpenChange,
	open,
}: AccountTypeEditorDialogProps) {
	const createAccountType = useMutation(api.accountTypes.create);
	const updateAccountType = useMutation(api.accountTypes.update);
	const usage = useQuery(
		api.accountTypes.getUsage,
		open && accountType ? { accountTypeId: accountType._id } : "skip"
	);
	const [form, setForm] = useState<AccountTypeFormState>(() =>
		getInitialFormState(accountType)
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [nameError, setNameError] = useState<string>();

	const isEditing = accountType !== null;
	const isColorValid =
		form.color.length === 0 || HEX_COLOR_PATTERN.test(form.color);
	const isBalanceNatureLocked =
		isEditing && (usage === undefined || usage.accountCount > 0);
	const formPrefix = isEditing ? "edit-account-type" : "create-account-type";
	let submitIcon = <Plus data-icon="inline-start" />;
	if (isEditing) {
		submitIcon = <Pencil data-icon="inline-start" />;
	}
	if (isSubmitting) {
		submitIcon = (
			<LoaderCircle className="animate-spin" data-icon="inline-start" />
		);
	}

	const updateForm = <Key extends keyof AccountTypeFormState>(
		key: Key,
		value: AccountTypeFormState[Key]
	) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = form.name.trim();
		if (!name) {
			setNameError("Enter an account type name.");
			return;
		}
		if (!isColorValid) {
			return;
		}

		setNameError(undefined);
		setIsSubmitting(true);
		try {
			if (accountType) {
				await updateAccountType({
					accountTypeId: accountType._id,
					balanceNature: form.balanceNature,
					color: form.color || null,
					icon: form.icon || null,
					name,
				});
				toast.success("Account type updated");
			} else {
				await createAccountType({
					balanceNature: form.balanceNature,
					color: form.color || undefined,
					icon: form.icon || undefined,
					name,
				});
				toast.success("Account type created");
			}
			onOpenChange(false);
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(
					error,
					isEditing
						? "Failed to update the account type"
						: "Failed to create the account type"
				)
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit account type" : "Create account type"}
					</DialogTitle>
					<DialogDescription>
						Choose how this type looks and whether it represents available money
						or money owed.
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
					<FieldGroup>
						<Field data-invalid={Boolean(nameError)}>
							<FieldLabel htmlFor={`${formPrefix}-name`}>Name</FieldLabel>
							<Input
								aria-invalid={Boolean(nameError)}
								autoFocus
								id={`${formPrefix}-name`}
								onChange={(event) => {
									updateForm("name", event.target.value);
									setNameError(undefined);
								}}
								placeholder="Brokerage, Mortgage, Travel wallet…"
								value={form.name}
							/>
							<FieldDescription>
								Names are unique in your account, ignoring capitalization.
							</FieldDescription>
							<FieldError>{nameError}</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor={`${formPrefix}-icon`}>Icon</FieldLabel>
							<Select
								onValueChange={(value) =>
									updateForm("icon", value === "none" ? "" : value)
								}
								value={form.icon || "none"}
							>
								<SelectTrigger className="w-full" id={`${formPrefix}-icon`}>
									<SelectValue placeholder="Choose an icon" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="none">No icon</SelectItem>
										{ACCOUNT_TYPE_ICON_OPTIONS.map((option) => (
											<SelectItem key={option.key} value={option.key}>
												<option.icon />
												{option.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>

						<Field data-invalid={!isColorValid}>
							<FieldLabel htmlFor={`${formPrefix}-color`}>Color</FieldLabel>
							<div className="flex flex-wrap items-center gap-2">
								<Input
									aria-label="Choose account type color"
									className="size-9 p-1"
									onChange={(event) => updateForm("color", event.target.value)}
									type="color"
									value={form.color || DEFAULT_CUSTOM_COLOR}
								/>
								<Input
									aria-invalid={!isColorValid}
									className="w-32 font-mono uppercase"
									id={`${formPrefix}-color`}
									onChange={(event) => updateForm("color", event.target.value)}
									placeholder="#6366F1"
									value={form.color}
								/>
								<Button
									onClick={() => updateForm("color", "")}
									size="sm"
									type="button"
									variant="ghost"
								>
									Use default
								</Button>
							</div>
							<div className="flex flex-wrap gap-2">
								{COLOR_PRESETS.map((color) => (
									<button
										aria-label={`Use ${color}`}
										aria-pressed={form.color.toUpperCase() === color}
										className="size-7 rounded-full border ring-offset-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2"
										key={color}
										onClick={() => updateForm("color", color)}
										style={{ backgroundColor: color }}
										type="button"
									/>
								))}
							</div>
							<FieldDescription>
								Color is optional and is used as a visual marker throughout
								Spendly.
							</FieldDescription>
							<FieldError>
								{isColorValid ? undefined : "Enter a six-digit hex color."}
							</FieldError>
						</Field>

						<Field data-disabled={isBalanceNatureLocked}>
							<FieldLabel htmlFor={`${formPrefix}-nature`}>
								Balance nature
							</FieldLabel>
							<Select
								disabled={isBalanceNatureLocked}
								onValueChange={(value) => {
									if (value === "asset" || value === "liability") {
										updateForm("balanceNature", value);
									}
								}}
								value={form.balanceNature}
							>
								<SelectTrigger className="w-full" id={`${formPrefix}-nature`}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="asset">
											Asset · money available
										</SelectItem>
										<SelectItem value="liability">
											Liability · money owed
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<FieldDescription>
								{getNatureDescription(form.balanceNature)}
							</FieldDescription>
						</Field>
					</FieldGroup>

					{isBalanceNatureLocked ? (
						<Alert>
							<Info />
							<AlertTitle>Balance nature is locked</AlertTitle>
							<AlertDescription>
								This type is assigned to {usage?.accountCount ?? "one or more"}{" "}
								accounts. Reassign them before changing asset or liability
								behavior.
							</AlertDescription>
						</Alert>
					) : null}

					<DialogFooter>
						<Button
							disabled={isSubmitting}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={isSubmitting || !form.name.trim() || !isColorValid}
							type="submit"
						>
							{submitIcon}
							{isEditing ? "Save changes" : "Create type"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

interface AccountTypeCardProps {
	accountType: AccountTypeItem;
	isMutationPending: boolean;
	onArchive: (accountType: AccountTypeItem) => void;
	onDelete: (accountType: AccountTypeItem) => void;
	onEdit: (accountType: AccountTypeItem) => void;
	onReactivate: (accountType: AccountTypeItem) => void;
}

function AccountTypeCard({
	accountType,
	isMutationPending,
	onArchive,
	onDelete,
	onEdit,
	onReactivate,
}: AccountTypeCardProps) {
	const usage = useQuery(api.accountTypes.getUsage, {
		accountTypeId: accountType._id,
	});
	const isArchived = Boolean(accountType.isArchived);
	const colorStyle = accountType.color
		? { borderLeftColor: accountType.color }
		: undefined;

	return (
		<Card
			className={cn(
				"gap-4 border-l-4 py-5",
				isArchived && "border-dashed opacity-80"
			)}
			style={colorStyle}
		>
			<CardHeader className="grid grid-cols-[1fr_auto] items-center gap-3 px-5">
				<div className="flex min-w-0 items-center gap-3">
					<div
						className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"
						style={accountType.color ? { color: accountType.color } : undefined}
					>
						<AccountTypeIcon className="size-5" iconKey={accountType.icon} />
					</div>
					<div className="min-w-0">
						<CardTitle className="flex flex-wrap items-center gap-2">
							<span className="truncate">{accountType.name}</span>
							{isArchived ? <Badge variant="outline">Archived</Badge> : null}
						</CardTitle>
						<CardDescription className="mt-1 capitalize">
							{accountType.balanceNature} · {accountType.icon ?? "default icon"}
						</CardDescription>
					</div>
				</div>

				<CardAction>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label={`Manage ${accountType.name}`}
								disabled={isMutationPending}
								size="icon-sm"
								variant="ghost"
							>
								<MoreHorizontal data-icon="inline-start" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuItem onClick={() => onEdit(accountType)}>
									<Pencil />
									Edit
								</DropdownMenuItem>
								{isArchived ? (
									<DropdownMenuItem onClick={() => onReactivate(accountType)}>
										<ArchiveRestore />
										Reactivate
									</DropdownMenuItem>
								) : (
									<DropdownMenuItem onClick={() => onArchive(accountType)}>
										<Archive />
										Archive
									</DropdownMenuItem>
								)}
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									disabled={usage === undefined || !usage.canDelete}
									onClick={() => onDelete(accountType)}
									variant="destructive"
								>
									<Trash2 />
									Delete permanently
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</CardAction>
			</CardHeader>

			<CardContent className="grid gap-4 px-5 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<p className="font-medium text-xs uppercase tracking-wide">
						{accountType.balanceNature === "asset"
							? "Money available"
							: "Money owed"}
					</p>
					<p className="text-muted-foreground text-sm">
						{getNatureDescription(accountType.balanceNature)}
					</p>
				</div>
				<div className="flex flex-col gap-1">
					<p className="font-medium text-xs uppercase tracking-wide">Usage</p>
					{usage === undefined ? (
						<Skeleton className="h-5 w-36" />
					) : (
						<p className="text-muted-foreground text-sm">
							{usage.accountCount === 0
								? "Unused · safe to delete"
								: `${usage.accountCount}${
										usage.hasMoreAccounts ? "+" : ""
									} ${usage.accountCount === 1 ? "account" : "accounts"} · deletion blocked`}
						</p>
					)}
				</div>
			</CardContent>

			<CardFooter className="justify-end border-t px-5 pt-4 text-muted-foreground text-xs">
				<span>
					{isArchived ? "Historical use only" : "Available for accounts"}
				</span>
			</CardFooter>
		</Card>
	);
}

export default function AccountTypesPage() {
	const accountTypes = useQuery(api.accountTypes.list, {
		includeArchived: true,
	});
	const archiveAccountType = useMutation(api.accountTypes.archive);
	const removeAccountType = useMutation(api.accountTypes.remove);
	const seedDefaults = useMutation(api.accountTypes.seedDefaults);
	const [createOpen, setCreateOpen] = useState(false);
	const [editingType, setEditingType] = useState<AccountTypeItem | null>(null);
	const [pendingArchive, setPendingArchive] = useState<AccountTypeItem | null>(
		null
	);
	const [pendingDelete, setPendingDelete] = useState<AccountTypeItem | null>(
		null
	);
	const [pendingMutationId, setPendingMutationId] =
		useState<Id<"account_types">>();
	const [isSeeding, setIsSeeding] = useState(false);

	const sortedTypes = accountTypes ?? EMPTY_ACCOUNT_TYPES;

	const handleArchive = async () => {
		if (!pendingArchive) {
			return;
		}
		setPendingMutationId(pendingArchive._id);
		try {
			await archiveAccountType({
				accountTypeId: pendingArchive._id,
				isArchived: true,
			});
			toast.success("Account type archived");
			setPendingArchive(null);
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(
					error,
					"Failed to archive the account type"
				)
			);
		} finally {
			setPendingMutationId(undefined);
		}
	};

	const handleReactivate = async (accountType: AccountTypeItem) => {
		setPendingMutationId(accountType._id);
		try {
			await archiveAccountType({
				accountTypeId: accountType._id,
				isArchived: false,
			});
			toast.success("Account type reactivated");
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(
					error,
					"Failed to reactivate the account type"
				)
			);
		} finally {
			setPendingMutationId(undefined);
		}
	};

	const handleDelete = async () => {
		if (!pendingDelete) {
			return;
		}
		setPendingMutationId(pendingDelete._id);
		try {
			await removeAccountType({ accountTypeId: pendingDelete._id });
			toast.success("Account type deleted");
			setPendingDelete(null);
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(error, "Failed to delete the account type")
			);
		} finally {
			setPendingMutationId(undefined);
		}
	};

	const handleSeedDefaults = async () => {
		setIsSeeding(true);
		try {
			const result = await seedDefaults({});
			toast.success(
				result.createdCount === 0
					? "All default account types already exist"
					: `${result.createdCount} default ${
							result.createdCount === 1 ? "type" : "types"
						} restored`
			);
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(error, "Failed to restore default types")
			);
		} finally {
			setIsSeeding(false);
		}
	};

	return (
		<div className="flex flex-col gap-8 py-3">
			<header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
				<div className="flex items-center gap-4">
					<Button asChild size="icon" variant="ghost">
						<Link aria-label="Back to dashboard" href="/dashboard">
							<ChevronLeft data-icon="inline-start" />
						</Link>
					</Button>
					<div className="flex flex-col gap-1">
						<h1 className="font-bold text-3xl tracking-tight">Account Types</h1>
						<p className="max-w-2xl text-muted-foreground text-sm">
							Control the names, icons, colors, and balance behavior used to
							classify your accounts.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2 sm:justify-end">
					<Button
						disabled={isSeeding}
						onClick={handleSeedDefaults}
						variant="outline"
					>
						{isSeeding ? (
							<LoaderCircle className="animate-spin" data-icon="inline-start" />
						) : (
							<RotateCcw data-icon="inline-start" />
						)}
						Restore defaults
					</Button>
					<Button onClick={() => setCreateOpen(true)}>
						<Plus data-icon="inline-start" />
						New type
					</Button>
				</div>
			</header>

			{accountTypes === undefined ? <AccountTypesLoadingState /> : null}
			{accountTypes !== undefined && accountTypes.length === 0 ? (
				<EmptyState
					action={
						<div className="flex flex-wrap justify-center gap-2">
							<Button onClick={handleSeedDefaults} variant="outline">
								<RotateCcw data-icon="inline-start" />
								Restore defaults
							</Button>
							<Button onClick={() => setCreateOpen(true)}>
								<Plus data-icon="inline-start" />
								Create a type
							</Button>
						</div>
					}
					className="min-h-72"
					description="Create a custom type or restore Spendly's standard Cash, Checking, Savings, Credit Card, Wallet, and Other templates."
					icon={<CircleDollarSign className="size-10" />}
					title="No account types yet"
				/>
			) : null}
			{accountTypes !== undefined && accountTypes.length > 0 ? (
				<>
					<AccountTypesSummary types={accountTypes} />
					<div className="flex flex-col gap-3">
						<div>
							<h2 className="font-semibold text-lg">Account types</h2>
							<p className="text-muted-foreground text-sm">
								Manage how each type looks and behaves across Spendly.
							</p>
						</div>
						<ul className="flex flex-col gap-3">
							{sortedTypes.map((accountType) => (
								<li key={accountType._id}>
									<AccountTypeCard
										accountType={accountType}
										isMutationPending={pendingMutationId === accountType._id}
										onArchive={setPendingArchive}
										onDelete={setPendingDelete}
										onEdit={setEditingType}
										onReactivate={handleReactivate}
									/>
								</li>
							))}
						</ul>
					</div>
				</>
			) : null}

			{createOpen ? (
				<AccountTypeEditorDialog
					accountType={null}
					onOpenChange={setCreateOpen}
					open
				/>
			) : null}
			{editingType ? (
				<AccountTypeEditorDialog
					accountType={editingType}
					onOpenChange={(open) => {
						if (!open) {
							setEditingType(null);
						}
					}}
					open
				/>
			) : null}

			<AlertDialog
				onOpenChange={(open) => {
					if (!open && pendingMutationId === undefined) {
						setPendingArchive(null);
					}
				}}
				open={pendingArchive !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Archive {pendingArchive?.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							Existing accounts and history will keep this type, but it will no
							longer be available for new account assignments until reactivated.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pendingMutationId !== undefined}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={pendingMutationId !== undefined}
							onClick={handleArchive}
						>
							{pendingMutationId !== undefined ? (
								<LoaderCircle
									className="animate-spin"
									data-icon="inline-start"
								/>
							) : (
								<Archive data-icon="inline-start" />
							)}
							Archive type
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				onOpenChange={(open) => {
					if (!open && pendingMutationId === undefined) {
						setPendingDelete(null);
					}
				}}
				open={pendingDelete !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {pendingDelete?.name} permanently?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. Spendly will reject the deletion if
							an account started using this type after the confirmation opened.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Alert variant="destructive">
						<CircleAlert />
						<AlertTitle>Permanent deletion</AlertTitle>
						<AlertDescription>
							Use archive instead if you may need this classification again.
						</AlertDescription>
					</Alert>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pendingMutationId !== undefined}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={pendingMutationId !== undefined}
							onClick={handleDelete}
							variant="destructive"
						>
							{pendingMutationId !== undefined ? (
								<LoaderCircle
									className="animate-spin"
									data-icon="inline-start"
								/>
							) : (
								<Trash2 data-icon="inline-start" />
							)}
							Delete permanently
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
