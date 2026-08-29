"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Info, LoaderCircle, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ACCOUNT_TYPE_ICON_OPTIONS } from "@/components/account-type-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { getAccountActionErrorMessage } from "@/lib/accounts";

type AccountTypeItem = Doc<"account_types">;
type BalanceNature = AccountTypeItem["balanceNature"];

interface AccountTypeFormState {
	balanceNature: BalanceNature;
	color: string;
	icon: string;
	name: string;
}

interface AccountTypeEditorDialogProps {
	accountType: AccountTypeItem | null;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (accountType: AccountTypeItem) => void;
	open: boolean;
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

export function AccountTypeEditorDialog({
	accountType,
	onOpenChange,
	onSuccess,
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
			const savedAccountType = accountType
				? await updateAccountType({
						accountTypeId: accountType._id,
						balanceNature: form.balanceNature,
						color: form.color || null,
						icon: form.icon || null,
						name,
					})
				: await createAccountType({
						balanceNature: form.balanceNature,
						color: form.color || undefined,
						icon: form.icon || undefined,
						name,
					});
			toast.success(
				accountType ? "Account type updated" : "Account type created"
			);
			onSuccess?.(savedAccountType);
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
