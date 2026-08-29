"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { format } from "date-fns";
import {
	ArrowLeftRight,
	LoaderCircle,
	MoreHorizontal,
	SlidersHorizontal,
	TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AccountTypeIcon } from "@/components/account-type-icon";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
	formatAccountMoney,
	getAccountActionErrorMessage,
	type ResolvedAccount,
} from "@/lib/accounts";

type Account = ResolvedAccount;
type ActiveDialog = "adjust" | "transfer";

interface AccountActionDialogsProps {
	account: Account;
	accounts: Account[];
	defaultCurrency: string;
	presentation: "buttons" | "menu";
}

interface DialogControlProps {
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

interface BalanceAdjustmentDialogProps extends DialogControlProps {
	account: Account;
	currency: string;
}

interface TransferDialogProps extends DialogControlProps {
	account: Account;
	accounts: Account[];
	defaultCurrency: string;
}

const getAccountCurrency = (account: Account, defaultCurrency: string) =>
	account.currency ?? defaultCurrency;

const getEligibleTransferAccounts = (
	account: Account,
	accounts: Account[],
	defaultCurrency: string
) => {
	const sourceCurrency = getAccountCurrency(account, defaultCurrency);
	return accounts.filter(
		(candidate) =>
			candidate._id !== account._id &&
			!candidate.isArchived &&
			getAccountCurrency(candidate, defaultCurrency) === sourceCurrency
	);
};

function NegativeBalanceWarning({
	balance,
	currency,
}: {
	balance: number;
	currency: string;
}) {
	return (
		<Alert>
			<TriangleAlert />
			<AlertTitle>This account will have a negative balance</AlertTitle>
			<AlertDescription>
				The resulting balance will be {formatAccountMoney(balance, currency)}.
				Spendly will record it without blocking the change.
			</AlertDescription>
		</Alert>
	);
}

function BalanceAdjustmentDialog({
	account,
	currency,
	onOpenChange,
	open,
}: BalanceAdjustmentDialogProps) {
	const updateBalance = useMutation(api.accounts.updateBalance);
	const [newBalance, setNewBalance] = useState(
		account.currentBalance.toString()
	);
	const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
	const [note, setNote] = useState("");
	const [balanceError, setBalanceError] = useState<string>();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const parsedBalance = Number(newBalance);
	const hasValidBalance =
		newBalance.trim().length > 0 && Number.isFinite(parsedBalance);
	const adjustment = hasValidBalance
		? parsedBalance - account.currentBalance
		: undefined;

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!hasValidBalance) {
			setBalanceError("Enter a valid account balance.");
			return;
		}

		setBalanceError(undefined);
		if (adjustment === 0) {
			toast.info("The account balance already matches");
			onOpenChange(false);
			return;
		}

		setIsSubmitting(true);
		try {
			await updateBalance({
				accountId: account._id,
				date,
				newBalance: parsedBalance,
				note: note.trim() || undefined,
			});
			toast.success("Balance updated", {
				description: `${account.name} now matches ${formatAccountMoney(
					parsedBalance,
					currency
				)}.`,
			});
			onOpenChange(false);
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(error, "Failed to update the balance")
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Adjust {account.name}</DialogTitle>
					<DialogDescription>
						Enter the balance shown by your bank or wallet. Spendly will record
						the difference as a ledger adjustment.
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
					<FieldGroup>
						<Field data-invalid={Boolean(balanceError)}>
							<FieldLabel htmlFor="adjusted-balance">
								Actual balance ({currency})
							</FieldLabel>
							<Input
								aria-invalid={Boolean(balanceError)}
								autoFocus
								id="adjusted-balance"
								inputMode="decimal"
								onChange={(event) => setNewBalance(event.target.value)}
								step="0.01"
								type="number"
								value={newBalance}
							/>
							<FieldDescription>
								Current Spendly balance:{" "}
								{formatAccountMoney(account.currentBalance, currency)}
								{adjustment === undefined || adjustment === 0
									? null
									: ` · Adjustment ${
											adjustment > 0 ? "+" : ""
										}${formatAccountMoney(adjustment, currency)}`}
							</FieldDescription>
							<FieldError>{balanceError}</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor="adjustment-date">Date</FieldLabel>
							<Input
								id="adjustment-date"
								onChange={(event) => setDate(event.target.value)}
								required
								type="date"
								value={date}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="adjustment-note">Note</FieldLabel>
							<Input
								id="adjustment-note"
								onChange={(event) => setNote(event.target.value)}
								placeholder="ATM correction, bank reconciliation…"
								value={note}
							/>
							<FieldDescription>Optional</FieldDescription>
						</Field>
					</FieldGroup>

					{hasValidBalance && parsedBalance < 0 ? (
						<NegativeBalanceWarning
							balance={parsedBalance}
							currency={currency}
						/>
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
						<Button disabled={isSubmitting} type="submit">
							{isSubmitting ? (
								<LoaderCircle
									className="animate-spin"
									data-icon="inline-start"
								/>
							) : (
								<SlidersHorizontal data-icon="inline-start" />
							)}
							Update balance
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function TransferDialog({
	account,
	accounts,
	defaultCurrency,
	onOpenChange,
	open,
}: TransferDialogProps) {
	const router = useRouter();
	const transfer = useMutation(api.accounts.transfer);
	const [destinationId, setDestinationId] = useState<Id<"accounts">>();
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
	const [note, setNote] = useState("");
	const [amountError, setAmountError] = useState<string>();
	const [destinationError, setDestinationError] = useState<string>();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const currency = getAccountCurrency(account, defaultCurrency);
	const eligibleAccounts = getEligibleTransferAccounts(
		account,
		accounts,
		defaultCurrency
	);
	const parsedAmount = Number(amount);
	const hasValidAmount =
		amount.trim().length > 0 &&
		Number.isFinite(parsedAmount) &&
		parsedAmount > 0;
	const projectedBalance = hasValidAmount
		? account.currentBalance - parsedAmount
		: undefined;

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextAmountError = hasValidAmount
			? undefined
			: "Enter an amount greater than zero.";
		const nextDestinationError = destinationId
			? undefined
			: "Choose a destination account.";
		setAmountError(nextAmountError);
		setDestinationError(nextDestinationError);
		if (nextAmountError || nextDestinationError || !destinationId) {
			return;
		}

		setIsSubmitting(true);
		try {
			await transfer({
				amount: parsedAmount,
				date,
				fromAccountId: account._id,
				note: note.trim() || undefined,
				toAccountId: destinationId,
			});
			const destination = eligibleAccounts.find(
				(candidate) => candidate._id === destinationId
			);
			toast.success("Transfer recorded", {
				action: destination
					? {
							label: `View ${destination.name}`,
							onClick: () => router.push(`/accounts/${destination._id}`),
						}
					: undefined,
				description: destination
					? `${formatAccountMoney(parsedAmount, currency)} moved from ${account.name} to ${destination.name} (${destination.accountTypeName}).`
					: `${formatAccountMoney(parsedAmount, currency)} moved from ${account.name}.`,
			});
			onOpenChange(false);
		} catch (error) {
			toast.error(
				getAccountActionErrorMessage(error, "Failed to record the transfer")
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Transfer from {account.name}</DialogTitle>
					<DialogDescription>
						Move money between active {currency} accounts. Both account balances
						will update together.
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
					<FieldGroup>
						<Field data-invalid={Boolean(destinationError)}>
							<FieldLabel htmlFor="transfer-destination">
								Destination account
							</FieldLabel>
							<Select
								onValueChange={(value) => {
									setDestinationId(value as Id<"accounts">);
									setDestinationError(undefined);
								}}
								value={destinationId}
							>
								<SelectTrigger
									aria-invalid={Boolean(destinationError)}
									className="w-full"
									id="transfer-destination"
								>
									<SelectValue placeholder="Choose an account" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{eligibleAccounts.map((candidate) => (
											<SelectItem key={candidate._id} value={candidate._id}>
												<span className="flex items-center gap-2">
													<span
														className="flex size-6 items-center justify-center rounded-md bg-muted"
														style={
															candidate.accountTypeColor
																? { color: candidate.accountTypeColor }
																: undefined
														}
													>
														<AccountTypeIcon
															iconKey={candidate.accountTypeIcon}
														/>
													</span>
													<span>
														{candidate.name} · {candidate.accountTypeName} ·{" "}
														{formatAccountMoney(
															candidate.currentBalance,
															currency
														)}
													</span>
												</span>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							{eligibleAccounts.length === 0 ? (
								<FieldDescription>
									Create another active {currency} account before transferring.
								</FieldDescription>
							) : null}
							<FieldError>{destinationError}</FieldError>
						</Field>

						<Field data-invalid={Boolean(amountError)}>
							<FieldLabel htmlFor="transfer-amount">
								Amount ({currency})
							</FieldLabel>
							<Input
								aria-invalid={Boolean(amountError)}
								id="transfer-amount"
								inputMode="decimal"
								min="0.01"
								onChange={(event) => {
									setAmount(event.target.value);
									setAmountError(undefined);
								}}
								step="0.01"
								type="number"
								value={amount}
							/>
							<FieldDescription>
								Available balance:{" "}
								{formatAccountMoney(account.currentBalance, currency)}
							</FieldDescription>
							<FieldError>{amountError}</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor="transfer-date">Date</FieldLabel>
							<Input
								id="transfer-date"
								onChange={(event) => setDate(event.target.value)}
								required
								type="date"
								value={date}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="transfer-note">Note</FieldLabel>
							<Input
								id="transfer-note"
								onChange={(event) => setNote(event.target.value)}
								placeholder="Emergency fund, rent transfer…"
								value={note}
							/>
							<FieldDescription>Optional</FieldDescription>
						</Field>
					</FieldGroup>

					{projectedBalance !== undefined && projectedBalance < 0 ? (
						<NegativeBalanceWarning
							balance={projectedBalance}
							currency={currency}
						/>
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
							disabled={isSubmitting || eligibleAccounts.length === 0}
							type="submit"
						>
							{isSubmitting ? (
								<LoaderCircle
									className="animate-spin"
									data-icon="inline-start"
								/>
							) : (
								<ArrowLeftRight data-icon="inline-start" />
							)}
							Record transfer
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function AccountActionDialogs({
	account,
	accounts,
	defaultCurrency,
	presentation,
}: AccountActionDialogsProps) {
	const [activeDialog, setActiveDialog] = useState<ActiveDialog>();
	const currency = getAccountCurrency(account, defaultCurrency);

	if (account.isArchived) {
		return null;
	}

	return (
		<>
			{presentation === "menu" ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label={`Actions for ${account.name}`}
							size="icon-sm"
							variant="ghost"
						>
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuItem onSelect={() => setActiveDialog("adjust")}>
								<SlidersHorizontal />
								Adjust balance
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setActiveDialog("transfer")}>
								<ArrowLeftRight />
								Transfer
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<>
					<Button onClick={() => setActiveDialog("adjust")} variant="outline">
						<SlidersHorizontal data-icon="inline-start" />
						Adjust balance
					</Button>
					<Button onClick={() => setActiveDialog("transfer")} variant="outline">
						<ArrowLeftRight data-icon="inline-start" />
						Transfer
					</Button>
				</>
			)}

			{activeDialog === "adjust" ? (
				<BalanceAdjustmentDialog
					account={account}
					currency={currency}
					onOpenChange={(open) => {
						if (!open) {
							setActiveDialog(undefined);
						}
					}}
					open
				/>
			) : null}

			{activeDialog === "transfer" ? (
				<TransferDialog
					account={account}
					accounts={accounts}
					defaultCurrency={defaultCurrency}
					onOpenChange={(open) => {
						if (!open) {
							setActiveDialog(undefined);
						}
					}}
					open
				/>
			) : null}
		</>
	);
}
