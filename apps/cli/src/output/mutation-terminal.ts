import type {
	AccountBalanceEffect,
	ExpenseCreateResult,
	ExpenseDeletePreview,
	ExpenseDeleteResult,
	ExpenseMutationResult,
	ExpenseProposal,
	ExpenseUpdatePreview,
} from "../domain/mutation-schemas.js";
import { renderExpense } from "./read-terminal.js";

const money = (amount: number, currency: string): string =>
	`${currency} ${amount.toFixed(2)}`;

const renderAccountEffects = (effects: AccountBalanceEffect[]): string => {
	if (effects.length === 0) {
		return "Account balance effects: none";
	}
	return [
		"Account balance effects:",
		...effects.map(
			(effect) =>
				`- ${effect.accountName}: ${money(effect.balanceBefore, effect.currency)} -> ${money(effect.balanceAfter, effect.currency)} (${effect.delta >= 0 ? "+" : ""}${effect.delta.toFixed(2)})`
		),
	].join("\n");
};

export const renderExpenseProposal = (proposal: ExpenseProposal): string =>
	[
		"Expense preview",
		`Date: ${proposal.date}`,
		`Amount: ${money(proposal.amount, proposal.currency)}`,
		`Spent on: ${proposal.spentOn ?? "none"}`,
		`Category ID: ${proposal.categoryId ?? "Uncategorized"} (${proposal.categorySource})`,
		`Account ID: ${proposal.accountId ?? "Unassigned"} (${proposal.accountSource})`,
		`Cycle ID: ${proposal.cycleId ?? "none"}`,
		`Tag IDs: ${proposal.tagIds.join(", ") || "none"}`,
		`Revision: ${proposal.revision}`,
		"",
		renderAccountEffects(proposal.accountEffects),
	].join("\n");

export const renderExpenseMutationResult = (
	result: ExpenseMutationResult
): string =>
	[renderExpense(result), "", renderAccountEffects(result.accountEffects)].join(
		"\n"
	);

export const renderExpenseCreateResult = (
	result: ExpenseCreateResult
): string =>
	[
		renderExpenseMutationResult(result),
		`Category source: ${result.categorySource}`,
		`Account source: ${result.accountSource}`,
	].join("\n");

export const renderExpenseUpdatePreview = (
	preview: ExpenseUpdatePreview
): string =>
	[
		"Before",
		renderExpense(preview.before),
		"",
		"After",
		renderExpense(preview.after),
		"",
		renderAccountEffects(preview.accountEffects),
	].join("\n");

export const renderExpenseDeletePreview = (
	preview: ExpenseDeletePreview
): string =>
	[
		"Permanent deletion preview",
		renderExpense(preview.expense),
		"",
		renderAccountEffects(preview.accountEffects),
		`Confirmation expires: ${preview.expiresAt}`,
	].join("\n");

export const renderExpenseDeleteResult = (
	result: ExpenseDeleteResult
): string =>
	[
		`Deleted expense: ${result.expense.id}`,
		`Spent on: ${result.expense.spentOn ?? "none"}`,
		`Amount: ${money(result.expense.amount, result.expense.currency)}`,
		"",
		renderAccountEffects(result.accountEffects),
	].join("\n");
