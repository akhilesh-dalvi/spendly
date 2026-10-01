import type {
	AccountCreateProposal,
	AccountCreateResult,
	AccountUpdatePreview,
	BalanceAdjustmentPreview,
	BalanceAdjustmentResult,
	TransferPreview,
	TransferResult,
} from "../domain/account-mutation-schemas.js";
import type { Account, Transaction } from "../domain/read-schemas.js";
import { formatMoney } from "./human.js";
import { shellQuote } from "./pagination.js";

const renderAccountNextAction = (id: string): string =>
	`Next: spendly accounts get ${shellQuote(id)}`;

const renderTransactionsNextAction = (id: string): string =>
	`Next: spendly accounts transactions ${shellQuote(id)}`;

const transactionTypeLabels: Readonly<Record<Transaction["type"], string>> = {
	expense: "Expense",
	manual_adjustment: "Balance adjustment",
	opening_balance: "Opening balance",
	transfer_in: "Transfer in",
	transfer_out: "Transfer out",
};

const renderLedgerReference = (transaction: Transaction | null): string =>
	transaction
		? `Ledger: ${transactionTypeLabels[transaction.type]} recorded`
		: "Ledger: no entry (balance unchanged)";

const renderMutationAccount = (account: Account): string =>
	[
		`Account: ${account.name}`,
		`Type: ${account.accountType.name} (${account.accountType.balanceNature === "asset" ? "Asset" : "Liability"})`,
		`Balance: ${formatMoney(account.currentBalance, account.currency)}`,
		`Opening balance: ${formatMoney(account.startingBalance, account.currency)}`,
		`Default: ${account.isDefault ? "Yes" : "No"}`,
		`Status: ${account.isArchived ? "Archived" : "Active"}`,
		`Revision: ${account.revision}`,
	].join("\n");

const warningMessages: Readonly<Record<string, string>> = {
	NEGATIVE_BALANCE: "The resulting account balance will be negative.",
	NEGATIVE_SOURCE_BALANCE:
		"The source account balance will be negative after this transfer.",
};

const renderWarnings = (warnings: readonly string[]): string => {
	if (warnings.length === 0) {
		return "Warnings: none";
	}
	return [
		"Warnings:",
		...warnings.map(
			(warning) => `- ${warningMessages[warning] ?? warning} [${warning}]`
		),
	].join("\n");
};

const renderAccountChanges = (preview: AccountUpdatePreview): string => {
	const changes = [
		["Name", preview.before.name, preview.after.name],
		["Type", preview.before.accountType.name, preview.after.accountType.name],
		[
			"Status",
			preview.before.isArchived ? "Archived" : "Active",
			preview.after.isArchived ? "Archived" : "Active",
		],
		[
			"Default",
			preview.before.isDefault ? "Yes" : "No",
			preview.after.isDefault ? "Yes" : "No",
		],
	].filter(([, beforeValue, afterValue]) => beforeValue !== afterValue);
	return changes.length > 0
		? changes
				.map(
					([label, beforeValue, afterValue]) =>
						`- ${label}: ${beforeValue} -> ${afterValue}`
				)
				.join("\n")
		: "- No visible field changes";
};

export const renderAccountSuccess = (
	account: Account,
	action: string
): string =>
	[
		`OK - ${action}`,
		renderMutationAccount(account),
		"",
		renderAccountNextAction(account.id),
	].join("\n");

export const renderAccountAddProposal = (
	proposal: AccountCreateProposal
): string =>
	[
		"Add account preview",
		`Name: ${proposal.name}`,
		`Type: ${proposal.accountType.name} (${proposal.accountType.balanceNature})`,
		`Opening balance: ${formatMoney(proposal.startingBalance, proposal.currency)}`,
		"An opening balance creates the account's first ledger entry.",
		`Opening date: ${proposal.date}`,
		`Revision: ${proposal.revision}`,
	].join("\n");

export const renderAccountAddResult = (result: AccountCreateResult): string =>
	[
		"OK - Account added",
		renderMutationAccount(result),
		"",
		renderLedgerReference(result.openingTransaction),
		"",
		renderAccountNextAction(result.id),
	].join("\n");

export const renderAccountEditPreview = (
	preview: AccountUpdatePreview
): string =>
	[
		`Edit account preview: ${preview.before.name}`,
		"Changes:",
		renderAccountChanges(preview),
	].join("\n");

export const renderAccountLifecyclePreview = (
	preview: AccountUpdatePreview,
	action: "archive" | "reactivate"
): string =>
	[
		`${action === "archive" ? "Archive" : "Reactivate"} account preview: ${preview.before.name}`,
		"Changes:",
		renderAccountChanges(preview),
	].join("\n");

export const renderAccountLifecycleBatchPreview = (
	previews: readonly AccountUpdatePreview[],
	action: "archive" | "reactivate"
): string => {
	const actionLabel = action === "archive" ? "Archive" : "Reactivate";
	return [
		`${actionLabel} ${previews.length} accounts preview`,
		...previews.flatMap((preview) => [
			`- ${preview.before.name}`,
			`  Status: ${preview.before.isArchived ? "Archived" : "Active"} -> ${preview.after.isArchived ? "Archived" : "Active"}`,
		]),
	].join("\n");
};

export const renderAccountLifecycleBatchSuccess = (
	accounts: readonly Account[],
	action: "archive" | "reactivate"
): string => {
	const pastTense = action === "archive" ? "archived" : "reactivated";
	return [
		`OK - ${accounts.length} accounts ${pastTense}`,
		...accounts.map(
			(account) =>
				`- ${account.name}: ${account.isArchived ? "Archived" : "Active"}`
		),
	].join("\n");
};

export const renderSetDefaultPreview = (
	account: Account,
	previousDefault?: Account
): string =>
	[
		"Make default preview",
		`Account: ${account.name}`,
		"Default: No -> Yes",
		`Previous default: ${previousDefault?.name ?? "none"}`,
	].join("\n");

export const renderBalanceAdjustmentPreview = (
	preview: BalanceAdjustmentPreview
): string =>
	[
		"Balance adjustment preview",
		`Account: ${preview.account.name}`,
		`Current balance: ${formatMoney(preview.account.currentBalance, preview.currency)}`,
		`Desired final balance: ${formatMoney(preview.resultingBalance, preview.currency)}`,
		`Computed adjustment: ${formatMoney(preview.adjustment, preview.currency)}`,
		`Date: ${preview.date}`,
		renderWarnings(preview.warnings),
	].join("\n");

export const renderBalanceAdjustmentResult = (
	result: BalanceAdjustmentResult
): string =>
	[
		"OK - Account balance adjusted",
		renderMutationAccount(result.account),
		`Adjustment: ${formatMoney(result.adjustment, result.currency)}`,
		`Date: ${result.date}`,
		renderWarnings(result.warnings),
		renderLedgerReference(result.transaction),
		"",
		renderTransactionsNextAction(result.account.id),
	].join("\n");

export const renderTransferPreview = (preview: TransferPreview): string =>
	[
		`Transfer preview: ${preview.fromAccount.name} -> ${preview.toAccount.name}`,
		`Amount: ${formatMoney(preview.amount, preview.currency)}`,
		`From: ${preview.fromAccount.name}`,
		`From balance: ${formatMoney(preview.fromAccount.currentBalance, preview.currency)} -> ${formatMoney(preview.fromBalanceAfter, preview.currency)}`,
		`To: ${preview.toAccount.name}`,
		`To balance: ${formatMoney(preview.toAccount.currentBalance, preview.currency)} -> ${formatMoney(preview.toBalanceAfter, preview.currency)}`,
		`Date: ${preview.date}`,
		`Note: ${preview.note ?? "none"}`,
		renderWarnings(preview.warnings),
	].join("\n");

export const renderTransferResult = (result: TransferResult): string =>
	[
		"OK - Transfer completed",
		`Transfer: ${result.fromAccount.name} -> ${result.toAccount.name}`,
		`Amount: ${formatMoney(result.amount, result.currency)}`,
		`Date: ${result.date}`,
		`From: ${result.fromAccount.name} - ${formatMoney(result.fromAccount.currentBalance, result.currency)}`,
		`To: ${result.toAccount.name} - ${formatMoney(result.toAccount.currentBalance, result.currency)}`,
		renderWarnings(result.warnings),
		renderLedgerReference(result.fromTransaction),
		renderLedgerReference(result.toTransaction),
		"",
		renderTransactionsNextAction(result.fromAccount.id),
	].join("\n");
