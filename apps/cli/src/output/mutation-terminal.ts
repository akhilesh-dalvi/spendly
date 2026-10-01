import type {
	AccountBalanceEffect,
	ExpenseCreateResult,
	ExpenseDeletePreview,
	ExpenseDeleteResult,
	ExpenseMutationResult,
	ExpenseProposal,
	ExpenseUpdatePreview,
} from "../domain/mutation-schemas.js";
import { formatMoney } from "./human.js";
import { shellQuote } from "./pagination.js";
import { renderExpense } from "./read-terminal.js";

export interface ExpenseProposalPresentation {
	account: string;
	category: string;
	cycle: string;
	tags: string[];
}

const renderExpenseNextAction = (id: string): string =>
	`Next: spendly expenses get ${shellQuote(id)}`;

const renderAccountEffects = (effects: AccountBalanceEffect[]): string => {
	if (effects.length === 0) {
		return "Account balance effects: none";
	}
	return [
		"Account balance effects:",
		...effects.map(
			(effect) =>
				`- ${effect.accountName}: ${formatMoney(effect.balanceBefore, effect.currency)} -> ${formatMoney(effect.balanceAfter, effect.currency)} (${effect.delta >= 0 ? "+" : ""}${formatMoney(effect.delta, effect.currency)})`
		),
	].join("\n");
};

const renderChangedFields = (
	before: ExpenseUpdatePreview["before"],
	after: ExpenseUpdatePreview["after"]
): string => {
	const changes = [
		["Date", before.date, after.date],
		[
			"Amount",
			formatMoney(before.amount, before.currency),
			formatMoney(after.amount, after.currency),
		],
		["Description", before.spentOn ?? "none", after.spentOn ?? "none"],
		[
			"Category",
			before.category?.name ?? "Uncategorized",
			after.category?.name ?? "Uncategorized",
		],
		[
			"Account",
			before.account?.name ?? "Unassigned",
			after.account?.name ?? "Unassigned",
		],
		[
			"Tags",
			before.tags.map((tag) => tag.name).join(", ") || "none",
			after.tags.map((tag) => tag.name).join(", ") || "none",
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

export const renderExpenseProposal = (
	proposal: ExpenseProposal,
	presentation: ExpenseProposalPresentation = {
		account: proposal.accountId ?? "Unassigned",
		category: proposal.categoryId ?? "Uncategorized",
		cycle: proposal.cycleId ?? "none",
		tags: proposal.tagIds,
	}
): string =>
	[
		"Add expense preview",
		`Date: ${proposal.date}`,
		`Amount: ${formatMoney(proposal.amount, proposal.currency)}`,
		`Spent on: ${proposal.spentOn ?? "none"}`,
		`Category: ${presentation.category}`,
		`Account: ${presentation.account}`,
		`Cycle: ${presentation.cycle}`,
		`Tags: ${presentation.tags.join(", ") || "none"}`,
		`Revision: ${proposal.revision}`,
		"",
		renderAccountEffects(proposal.accountEffects),
	].join("\n");

export const renderExpenseMutationResult = (
	result: ExpenseMutationResult
): string =>
	[
		"OK - Expense updated",
		renderExpense(result),
		"",
		renderAccountEffects(result.accountEffects),
		"",
		renderExpenseNextAction(result.id),
	].join("\n");

export const renderExpenseAddResult = (result: ExpenseCreateResult): string =>
	[
		"OK - Expense added successfully",
		renderExpense(result),
		"",
		renderAccountEffects(result.accountEffects),
		`Category source: ${result.categorySource}`,
		`Account source: ${result.accountSource}`,
		"",
		renderExpenseNextAction(result.id),
	].join("\n");

export const renderExpenseEditPreview = (
	preview: ExpenseUpdatePreview
): string =>
	[
		"Edit expense preview",
		`Expense: ${preview.before.date} · ${preview.before.spentOn ?? "No description"} · ${formatMoney(preview.before.amount, preview.before.currency)}`,
		"Changes:",
		renderChangedFields(preview.before, preview.after),
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
		"OK - Expense permanently deleted",
		`ID: ${result.expense.id}`,
		`Spent on: ${result.expense.spentOn ?? "none"}`,
		`Amount: ${formatMoney(result.expense.amount, result.expense.currency)}`,
		"",
		renderAccountEffects(result.accountEffects),
		"",
		"Next: spendly expenses list",
	].join("\n");
