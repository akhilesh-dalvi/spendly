import type {
	AccountCreateProposal,
	AccountCreateResult,
	AccountUpdatePreview,
	BalanceAdjustmentPreview,
	BalanceAdjustmentResult,
	TransferPreview,
	TransferResult,
} from "../domain/account-mutation-schemas.js";
import type { Transaction } from "../domain/read-schemas.js";
import { renderAccount } from "./read-terminal.js";

const money = (amount: number, currency: string): string =>
	`${currency} ${amount.toFixed(2)}`;

const renderLedgerReference = (transaction: Transaction | null): string =>
	transaction
		? `Ledger: ${transaction.type} ${transaction.id}`
		: "Ledger: no entry (balance unchanged)";

const renderWarnings = (warnings: readonly string[]): string =>
	warnings.length > 0 ? `Warnings: ${warnings.join(", ")}` : "Warnings: none";

export const renderAccountCreateProposal = (
	proposal: AccountCreateProposal
): string =>
	[
		"Account preview",
		`Name: ${proposal.name}`,
		`Type: ${proposal.accountType.name} (${proposal.accountType.balanceNature})`,
		`Opening balance: ${money(proposal.startingBalance, proposal.currency)}`,
		`Opening date: ${proposal.date}`,
		`Revision: ${proposal.revision}`,
	].join("\n");

export const renderAccountCreateResult = (
	result: AccountCreateResult
): string =>
	[
		renderAccount(result),
		"",
		renderLedgerReference(result.openingTransaction),
	].join("\n");

export const renderAccountUpdatePreview = (
	preview: AccountUpdatePreview
): string =>
	[
		"Before",
		renderAccount(preview.before),
		"",
		"After",
		renderAccount(preview.after),
	].join("\n");

export const renderBalanceAdjustmentPreview = (
	preview: BalanceAdjustmentPreview
): string =>
	[
		"Balance adjustment preview",
		`Account: ${preview.account.name} (${preview.account.id})`,
		`Current balance: ${money(preview.account.currentBalance, preview.currency)}`,
		`Adjustment: ${money(preview.adjustment, preview.currency)}`,
		`Resulting balance: ${money(preview.resultingBalance, preview.currency)}`,
		`Date: ${preview.date}`,
		renderWarnings(preview.warnings),
	].join("\n");

export const renderBalanceAdjustmentResult = (
	result: BalanceAdjustmentResult
): string =>
	[
		renderAccount(result.account),
		`Adjustment: ${money(result.adjustment, result.currency)}`,
		`Date: ${result.date}`,
		renderWarnings(result.warnings),
		renderLedgerReference(result.transaction),
	].join("\n");

export const renderTransferPreview = (preview: TransferPreview): string =>
	[
		"Transfer preview",
		`From: ${preview.fromAccount.name} (${preview.fromAccount.id})`,
		`From balance: ${money(preview.fromAccount.currentBalance, preview.currency)} -> ${money(preview.fromBalanceAfter, preview.currency)}`,
		`To: ${preview.toAccount.name} (${preview.toAccount.id})`,
		`To balance: ${money(preview.toAccount.currentBalance, preview.currency)} -> ${money(preview.toBalanceAfter, preview.currency)}`,
		`Amount: ${money(preview.amount, preview.currency)}`,
		`Date: ${preview.date}`,
		`Note: ${preview.note ?? "none"}`,
		renderWarnings(preview.warnings),
	].join("\n");

export const renderTransferResult = (result: TransferResult): string =>
	[
		`Transfer: ${result.id}`,
		`Amount: ${money(result.amount, result.currency)}`,
		`Date: ${result.date}`,
		`From: ${result.fromAccount.name} — ${money(result.fromAccount.currentBalance, result.currency)}`,
		`To: ${result.toAccount.name} — ${money(result.toAccount.currentBalance, result.currency)}`,
		renderWarnings(result.warnings),
		renderLedgerReference(result.fromTransaction),
		renderLedgerReference(result.toTransaction),
	].join("\n");
