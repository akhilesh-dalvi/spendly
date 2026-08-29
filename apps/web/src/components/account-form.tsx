"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	CircleAlert,
	Info,
	LoaderCircle,
	Pencil,
	Plus,
	Save,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AccountTypeEditorDialog } from "@/components/account-type-editor-dialog";
import { AccountTypeIcon } from "@/components/account-type-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

interface AccountFormDefaults {
	accountTypeId: Id<"account_types">;
	name: string;
}

interface AccountFormProps {
	accountId?: Id<"accounts">;
	allowAccountTypeManagement?: boolean;
	defaultCurrency: string;
	defaultValues?: AccountFormDefaults;
	onSuccess: (accountId: Id<"accounts">) => void;
}

interface AccountTypeFieldProps {
	accountTypeError?: string;
	accountTypesLoading: boolean;
	allowManagement: boolean;
	isOpen: boolean;
	onManage: (mode: "create" | "edit") => void;
	onOpenChange: (open: boolean) => void;
	onSelect: (accountTypeId: Id<"account_types">) => void;
	selectableAccountTypes: Doc<"account_types">[];
	selectedAccountType?: Doc<"account_types">;
	value?: Id<"account_types">;
}

function AccountTypeField({
	accountTypeError,
	accountTypesLoading,
	allowManagement,
	isOpen,
	onManage,
	onOpenChange,
	onSelect,
	selectableAccountTypes,
	selectedAccountType,
	value,
}: AccountTypeFieldProps) {
	return (
		<Field data-invalid={Boolean(accountTypeError)}>
			<FieldLabel htmlFor="account-type">Account type</FieldLabel>
			<Select
				disabled={
					accountTypesLoading ||
					(!allowManagement && selectableAccountTypes.length === 0)
				}
				onOpenChange={onOpenChange}
				onValueChange={(nextValue) =>
					onSelect(nextValue as Id<"account_types">)
				}
				open={isOpen}
				value={value ?? ""}
			>
				<SelectTrigger
					aria-invalid={Boolean(accountTypeError)}
					className="w-full"
					id="account-type"
				>
					<SelectValue placeholder="Choose an account type" />
				</SelectTrigger>
				<SelectContent>
					{allowManagement ? (
						<div className="grid grid-cols-2 gap-1 border-b p-1">
							<Button
								className="justify-start"
								onClick={() => onManage("create")}
								size="sm"
								type="button"
								variant="ghost"
							>
								<Plus data-icon="inline-start" />
								New type
							</Button>
							<Button
								className="justify-start"
								disabled={!selectedAccountType}
								onClick={() => onManage("edit")}
								size="sm"
								type="button"
								variant="ghost"
							>
								<Pencil data-icon="inline-start" />
								Edit selected
							</Button>
						</div>
					) : null}
					<SelectGroup>
						{selectableAccountTypes.length === 0 ? (
							<p className="px-2 py-3 text-muted-foreground text-sm">
								No active account types yet.
							</p>
						) : null}
						{selectableAccountTypes.map((accountType) => (
							<SelectItem key={accountType._id} value={accountType._id}>
								<span className="flex items-center gap-2">
									<span
										className="flex size-6 items-center justify-center rounded-md bg-muted"
										style={
											accountType.color
												? { color: accountType.color }
												: undefined
										}
									>
										<AccountTypeIcon iconKey={accountType.icon} />
									</span>
									<span>{accountType.name}</span>
									{accountType.isArchived ? (
										<span className="text-muted-foreground">(Archived)</span>
									) : null}
								</span>
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<FieldDescription>
				{selectedAccountType?.balanceNature === "liability"
					? "Tracks money owed, such as credit cards or loans."
					: "Tracks money available, such as cash, checking, or savings."}
			</FieldDescription>
			<FieldError>{accountTypeError}</FieldError>
		</Field>
	);
}

export function AccountForm({
	accountId,
	allowAccountTypeManagement = false,
	defaultCurrency,
	defaultValues,
	onSuccess,
}: AccountFormProps) {
	const createAccount = useMutation(api.accounts.create);
	const updateAccount = useMutation(api.accounts.update);
	const accountTypes = useQuery(api.accountTypes.list, {
		includeArchived: true,
	});
	const [name, setName] = useState(defaultValues?.name ?? "");
	const [accountTypeId, setAccountTypeId] = useState<Id<"account_types">>();
	const [startingBalance, setStartingBalance] = useState("0");
	const [nameError, setNameError] = useState<string>();
	const [accountTypeError, setAccountTypeError] = useState<string>();
	const [balanceError, setBalanceError] = useState<string>();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isAccountTypeSelectOpen, setIsAccountTypeSelectOpen] = useState(false);
	const [accountTypeDialogMode, setAccountTypeDialogMode] = useState<
		"create" | "edit" | null
	>(null);
	const isEditing = Boolean(accountId);
	const activeAccountTypes =
		accountTypes?.filter((accountType) => !accountType.isArchived) ?? [];
	const currentAccountType = accountTypes?.find(
		(accountType) => accountType._id === defaultValues?.accountTypeId
	);
	const selectableAccountTypes =
		accountTypes?.filter(
			(accountType) =>
				!accountType.isArchived ||
				accountType._id === defaultValues?.accountTypeId
		) ?? [];
	const resolvedAccountTypeId =
		accountTypeId ?? defaultValues?.accountTypeId ?? activeAccountTypes[0]?._id;
	const selectedAccountType = selectableAccountTypes.find(
		(accountType) => accountType._id === resolvedAccountTypeId
	);
	const hasNoActiveAccountTypes =
		accountTypes !== undefined && activeAccountTypes.length === 0;
	const isCurrentTypeArchived = Boolean(currentAccountType?.isArchived);
	const openAccountTypeDialog = (mode: "create" | "edit") => {
		setIsAccountTypeSelectOpen(false);
		setAccountTypeDialogMode(mode);
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedName = name.trim();
		const parsedBalance = Number(startingBalance);
		const nextNameError = normalizedName ? undefined : "Enter an account name.";
		const nextAccountTypeError = resolvedAccountTypeId
			? undefined
			: "Choose an account type.";
		const nextBalanceError = Number.isFinite(parsedBalance)
			? undefined
			: "Enter a valid opening balance.";

		setNameError(nextNameError);
		setAccountTypeError(nextAccountTypeError);
		setBalanceError(nextBalanceError);
		if (
			nextNameError ||
			nextAccountTypeError ||
			(!isEditing && nextBalanceError) ||
			!resolvedAccountTypeId
		) {
			return;
		}

		setIsSubmitting(true);
		try {
			if (accountId) {
				await updateAccount({
					accountId,
					accountTypeId: resolvedAccountTypeId,
					name: normalizedName,
				});
				toast.success("Account updated");
				onSuccess(accountId);
				return;
			}

			const account = await createAccount({
				accountTypeId: resolvedAccountTypeId,
				name: normalizedName,
				startingBalance: parsedBalance,
			});
			if (!account) {
				throw new Error("Account could not be loaded after creation");
			}
			toast.success("Account created");
			onSuccess(account._id);
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(
					error,
					isEditing ? "Failed to update account" : "Failed to create account"
				)
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			<form className="flex flex-col gap-8" onSubmit={handleSubmit}>
				<FieldGroup>
					<Field data-invalid={Boolean(nameError)}>
						<FieldLabel htmlFor="account-name">Account name</FieldLabel>
						<Input
							aria-invalid={Boolean(nameError)}
							autoComplete="off"
							id="account-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="Everyday checking"
							value={name}
						/>
						<FieldDescription>
							Use the name you recognize from your bank or wallet.
						</FieldDescription>
						<FieldError>{nameError}</FieldError>
					</Field>

					<AccountTypeField
						accountTypeError={accountTypeError}
						accountTypesLoading={accountTypes === undefined}
						allowManagement={allowAccountTypeManagement}
						isOpen={isAccountTypeSelectOpen}
						onManage={openAccountTypeDialog}
						onOpenChange={setIsAccountTypeSelectOpen}
						onSelect={(nextAccountTypeId) => {
							setAccountTypeId(nextAccountTypeId);
							setAccountTypeError(undefined);
						}}
						selectableAccountTypes={selectableAccountTypes}
						selectedAccountType={selectedAccountType}
						value={resolvedAccountTypeId}
					/>

					{isEditing ? null : (
						<Field data-invalid={Boolean(balanceError)}>
							<FieldLabel htmlFor="starting-balance">
								Opening balance ({defaultCurrency})
							</FieldLabel>
							<Input
								aria-invalid={Boolean(balanceError)}
								id="starting-balance"
								inputMode="decimal"
								onChange={(event) => setStartingBalance(event.target.value)}
								step="0.01"
								type="number"
								value={startingBalance}
							/>
							<FieldDescription>
								Zero and negative balances are supported. This opening snapshot
								cannot be edited later.
							</FieldDescription>
							<FieldError>{balanceError}</FieldError>
						</Field>
					)}
				</FieldGroup>

				{hasNoActiveAccountTypes && !isEditing ? (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertTitle>Create an account type first</AlertTitle>
						<AlertDescription className="flex flex-col items-start gap-3">
							<span>
								Accounts need an active type before they can be created.
							</span>
							{allowAccountTypeManagement ? (
								<Button
									onClick={() => openAccountTypeDialog("create")}
									size="sm"
									type="button"
									variant="outline"
								>
									<Plus data-icon="inline-start" />
									Create account type
								</Button>
							) : (
								<Button asChild size="sm" variant="outline">
									<Link href="/data/account-types">Manage account types</Link>
								</Button>
							)}
						</AlertDescription>
					</Alert>
				) : null}

				{isCurrentTypeArchived ? (
					<Alert>
						<Info />
						<AlertTitle>Current type is archived</AlertTitle>
						<AlertDescription>
							{currentAccountType?.name} remains selected so this account can be
							saved without changing its history. Choose an active type to
							reassign it.
						</AlertDescription>
					</Alert>
				) : null}

				<div className="flex justify-end">
					<Button
						disabled={
							isSubmitting ||
							accountTypes === undefined ||
							!resolvedAccountTypeId ||
							(!isEditing && hasNoActiveAccountTypes)
						}
						type="submit"
					>
						{isSubmitting ? (
							<LoaderCircle className="animate-spin" data-icon="inline-start" />
						) : (
							<Save data-icon="inline-start" />
						)}
						{isEditing ? "Save changes" : "Create account"}
					</Button>
				</div>
			</form>

			<AccountTypeEditorDialog
				accountType={
					accountTypeDialogMode === "edit"
						? (selectedAccountType ?? null)
						: null
				}
				key={accountTypeDialogMode ?? "closed"}
				onOpenChange={(open) => {
					if (!open) {
						setAccountTypeDialogMode(null);
					}
				}}
				onSuccess={(savedAccountType) => {
					setAccountTypeId(savedAccountType._id);
					setAccountTypeError(undefined);
				}}
				open={allowAccountTypeManagement && accountTypeDialogMode !== null}
			/>
		</>
	);
}
