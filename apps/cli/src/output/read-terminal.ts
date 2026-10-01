import type {
	Account,
	AccountType,
	Category,
	Context,
	Cycle,
	Expense,
	Summary,
	Tag,
	Transaction,
} from "../domain/read-schemas.js";
import {
	formatInclusiveDateRange,
	formatMoney,
	type HumanRenderOptions,
	renderHumanLines,
	renderHumanTable,
} from "./human.js";

const transactionTypeLabels: Readonly<Record<Transaction["type"], string>> = {
	expense: "Expense",
	manual_adjustment: "Balance adjustment",
	opening_balance: "Opening balance",
	transfer_in: "Transfer in",
	transfer_out: "Transfer out",
};

const humanTimezoneAliases: Readonly<Record<string, string>> = {
	"Asia/Calcutta": "Asia/Kolkata",
};

const formatHumanTimezone = (timezone: string | null): string =>
	timezone ? (humanTimezoneAliases[timezone] ?? timezone) : "timezone unknown";

export const renderContext = (
	context: Context,
	options: HumanRenderOptions = {}
): string => {
	const cycle = context.currentCycle
		? `${context.currentCycle.name} (${formatInclusiveDateRange(context.currentCycle.startDate, context.currentCycle.endDateExclusive)})`
		: "none";
	const totals =
		context.totals.length > 0
			? context.totals
					.map((total) => formatMoney(total.total, total.currency))
					.join(", ")
			: "none";
	return renderHumanLines(
		[
			`Currency: ${context.currency}`,
			`Effective date: ${context.effectiveDate} (${formatHumanTimezone(context.timezone)}; ${context.dateSource})`,
			`Current cycle: ${cycle}`,
			`Active accounts: ${context.accounts.length}`,
			`Account totals: ${totals}`,
			`Visible categories: ${context.categories.length}`,
			`Tags: ${context.tags.length}`,
			`Account setup: ${context.accountsOnboardingStatus}`,
		],
		options
	);
};

export const renderExpense = (
	expense: Expense,
	options: HumanRenderOptions = {}
): string =>
	renderHumanLines(
		[
			`Expense: ${expense.spentOn ?? "No description"}`,
			`Date: ${expense.date}`,
			`Amount: ${formatMoney(expense.amount, expense.currency)}`,
			`Category: ${expense.category?.name ?? "Uncategorized"}`,
			`Account: ${expense.account?.name ?? "Unassigned"}`,
			`Cycle: ${expense.cycle?.name ?? "none"}`,
			`Tags: ${expense.tags.map((tag) => tag.name).join(", ") || "none"}`,
			`ID: ${expense.id}`,
			`Revision: ${expense.revision}`,
		],
		options
	);

export const renderExpenses = (
	expenses: Expense[],
	options: HumanRenderOptions = {},
	emptyMessage = "No expenses yet."
): string =>
	renderHumanTable(
		["DATE", "AMOUNT", "SPENT ON", "CATEGORY", "ACCOUNT", "ID"],
		expenses.map((expense) => [
			expense.date,
			formatMoney(expense.amount, expense.currency),
			expense.spentOn ?? "-",
			expense.category?.name ?? "Uncategorized",
			expense.account?.name ?? "Unassigned",
			expense.id,
		]),
		{ ...options, emptyMessage, rightAlign: [1] }
	);

export const renderCycles = (
	cycles: Cycle[],
	options: HumanRenderOptions = {}
): string =>
	renderHumanTable(
		["NAME", "DATES", "ID"],
		cycles.map((cycle) => [
			cycle.name,
			formatInclusiveDateRange(cycle.startDate, cycle.endDateExclusive),
			cycle.id,
		]),
		{ ...options, emptyMessage: "No expense cycles are configured." }
	);

export const renderCycle = (
	cycle: Cycle | null,
	options: HumanRenderOptions = {}
): string =>
	cycle
		? `Current cycle\n${renderCycles([cycle], options)}`
		: "No cycle contains the requested local date.";

export const renderCategories = (
	categories: Category[],
	currency: string,
	options: HumanRenderOptions = {}
): string =>
	renderHumanTable(
		["NAME", "TYPE", "PLANNED", "STATE", "ID"],
		categories.map((category) => [
			category.name,
			category.categoryType?.name ?? "-",
			category.plannedAmount === null
				? "-"
				: formatMoney(category.plannedAmount, currency),
			category.isHidden ? "Hidden" : "Visible",
			category.id,
		]),
		{
			...options,
			emptyMessage: "No categories are configured for this cycle.",
			rightAlign: [2],
		}
	);

export const renderTags = (
	tags: Tag[],
	options: HumanRenderOptions = {}
): string =>
	renderHumanTable(
		["NAME", "ID"],
		tags.map((tag) => [tag.name, tag.id]),
		{
			...options,
			emptyMessage: "No tags yet. Expenses can continue without tags.",
		}
	);

export const renderSummary = (
	summary: Summary,
	currency: string,
	options: HumanRenderOptions = {}
): string =>
	[
		renderHumanLines(
			[
				`Cycle: ${summary.cycle.name}`,
				`Dates: ${formatInclusiveDateRange(summary.cycle.startDate, summary.cycle.endDateExclusive)}`,
				`Spent: ${formatMoney(summary.totalSpent, currency)}`,
				`Planned: ${formatMoney(summary.totalPlanned, currency)}`,
				`Remaining: ${formatMoney(summary.remaining, currency)}`,
				`Status: ${summary.remaining < 0 ? "Over planned spending" : "Within planned spending"}`,
				`Days remaining: ${summary.daysRemaining ?? "not available"}`,
			],
			options
		),
		"",
		renderHumanTable(
			["CATEGORY", "SPENT", "PLANNED", "DIFFERENCE"],
			summary.categories.map((category) => [
				category.name,
				formatMoney(category.spent, currency),
				category.planned === null
					? "-"
					: formatMoney(category.planned, currency),
				category.difference === null
					? "-"
					: formatMoney(category.difference, currency),
			]),
			{
				...options,
				emptyMessage: "No category activity in this cycle.",
				rightAlign: [1, 2, 3],
			}
		),
	].join("\n");

export const renderAccount = (
	account: Account,
	options: HumanRenderOptions = {}
): string =>
	renderHumanLines(
		[
			`Account: ${account.name}`,
			`ID: ${account.id}`,
			`Type: ${account.accountType.name} (${account.accountType.balanceNature === "asset" ? "Asset" : "Liability"})`,
			`Balance: ${formatMoney(account.currentBalance, account.currency)}`,
			`Opening balance: ${formatMoney(account.startingBalance, account.currency)}`,
			`Default: ${account.isDefault ? "Yes" : "No"}`,
			`Status: ${account.isArchived ? "Archived" : "Active"}`,
			`Revision: ${account.revision}`,
		],
		options
	);

export const renderAccounts = (
	accounts: Account[],
	options: HumanRenderOptions = {}
): string =>
	renderHumanTable(
		["NAME", "TYPE", "BALANCE", "DEFAULT", "STATE", "ID"],
		accounts.map((account) => [
			account.name,
			account.accountType.name,
			formatMoney(account.currentBalance, account.currency),
			account.isDefault ? "Default" : "-",
			account.isArchived ? "Archived" : "Active",
			account.id,
		]),
		{ ...options, emptyMessage: "No accounts yet.", rightAlign: [2] }
	);

export const renderTransactions = (
	transactions: Transaction[],
	currency: string,
	options: HumanRenderOptions = {}
): string =>
	renderHumanTable(
		["DATE", "TYPE", "AMOUNT", "BALANCE AFTER", "NOTE", "ID"],
		transactions.map((transaction) => [
			transaction.date,
			transactionTypeLabels[transaction.type],
			formatMoney(transaction.amount, currency),
			formatMoney(transaction.balanceAfter, currency),
			transaction.note ?? "-",
			transaction.id,
		]),
		{
			...options,
			emptyMessage: "This account has no ledger activity yet.",
			rightAlign: [2, 3],
		}
	);

export const renderAccountTypes = (
	accountTypes: AccountType[],
	options: HumanRenderOptions = {}
): string =>
	renderHumanTable(
		["NAME", "NATURE", "STATE", "ID"],
		accountTypes.map((accountType) => [
			accountType.name,
			accountType.balanceNature === "asset" ? "Asset" : "Liability",
			accountType.isArchived ? "Archived" : "Active",
			accountType.id,
		]),
		{ ...options, emptyMessage: "No account types are available." }
	);
