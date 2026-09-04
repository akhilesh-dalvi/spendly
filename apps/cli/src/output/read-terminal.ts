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

const renderTable = (headers: string[], rows: string[][]): string => {
	if (rows.length === 0) {
		return "No results.";
	}
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
	);
	const renderRow = (row: string[]): string =>
		row.map((value, index) => value.padEnd(widths[index] ?? 0)).join("  ");
	return [
		renderRow(headers),
		renderRow(widths.map((width) => "-".repeat(width))),
		...rows.map(renderRow),
	].join("\n");
};

const money = (amount: number, currency: string): string =>
	`${currency} ${amount.toFixed(2)}`;

export const renderContext = (context: Context): string => {
	const cycle = context.currentCycle
		? `${context.currentCycle.name} (${context.currentCycle.startDate} to ${context.currentCycle.endDateExclusive})`
		: "none";
	const totals =
		context.totals.length > 0
			? context.totals
					.map((total) => money(total.total, total.currency))
					.join(", ")
			: "none";
	return [
		`User: ${context.userId}`,
		`Date: ${context.effectiveDate} (${context.dateSource})`,
		`Timezone: ${context.timezone ?? "unknown"}`,
		`Currency: ${context.currency}`,
		`Current cycle: ${cycle}`,
		`Active accounts: ${context.accounts.length}`,
		`Account totals: ${totals}`,
		`Visible categories: ${context.categories.length}`,
		`Tags: ${context.tags.length}`,
	].join("\n");
};

export const renderExpense = (expense: Expense): string =>
	[
		`Expense: ${expense.id}`,
		`Date: ${expense.date}`,
		`Amount: ${money(expense.amount, expense.currency)}`,
		`Spent on: ${expense.spentOn ?? "none"}`,
		`Category: ${expense.category?.name ?? "Uncategorized"}`,
		`Account: ${expense.account?.name ?? "Unassigned"}`,
		`Cycle: ${expense.cycle?.name ?? "none"}`,
		`Tags: ${expense.tags.map((tag) => tag.name).join(", ") || "none"}`,
		`Revision: ${expense.revision}`,
	].join("\n");

export const renderExpenses = (expenses: Expense[]): string =>
	renderTable(
		["DATE", "AMOUNT", "SPENT ON", "CATEGORY", "ACCOUNT", "ID"],
		expenses.map((expense) => [
			expense.date,
			money(expense.amount, expense.currency),
			expense.spentOn ?? "-",
			expense.category?.name ?? "Uncategorized",
			expense.account?.name ?? "Unassigned",
			expense.id,
		])
	);

export const renderCycles = (cycles: Cycle[]): string =>
	renderTable(
		["NAME", "START", "END (EXCLUSIVE)", "ID"],
		cycles.map((cycle) => [
			cycle.name,
			cycle.startDate,
			cycle.endDateExclusive,
			cycle.id,
		])
	);

export const renderCycle = (cycle: Cycle | null): string =>
	cycle ? renderCycles([cycle]) : "No cycle contains the requested local date.";

export const renderCategories = (categories: Category[]): string =>
	renderTable(
		["NAME", "TYPE", "PLANNED", "HIDDEN", "ID"],
		categories.map((category) => [
			category.name,
			category.categoryType?.name ?? "-",
			category.plannedAmount?.toFixed(2) ?? "-",
			category.isHidden ? "yes" : "no",
			category.id,
		])
	);

export const renderTags = (tags: Tag[]): string =>
	renderTable(
		["NAME", "ID"],
		tags.map((tag) => [tag.name, tag.id])
	);

export const renderSummary = (summary: Summary): string =>
	[
		`Cycle: ${summary.cycle.name}`,
		`Dates: ${summary.cycle.startDate} to ${summary.cycle.endDateExclusive}`,
		`Spent: ${summary.totalSpent.toFixed(2)}`,
		`Planned: ${summary.totalPlanned.toFixed(2)}`,
		`Remaining: ${summary.remaining.toFixed(2)}`,
		"",
		renderTable(
			["CATEGORY", "SPENT", "PLANNED", "DIFFERENCE"],
			summary.categories.map((category) => [
				category.name,
				category.spent.toFixed(2),
				category.planned?.toFixed(2) ?? "-",
				category.difference?.toFixed(2) ?? "-",
			])
		),
	].join("\n");

export const renderAccount = (account: Account): string =>
	[
		`Account: ${account.name}`,
		`ID: ${account.id}`,
		`Type: ${account.accountType.name} (${account.accountType.balanceNature})`,
		`Balance: ${money(account.currentBalance, account.currency)}`,
		`Opening balance: ${money(account.startingBalance, account.currency)}`,
		`Default: ${account.isDefault ? "yes" : "no"}`,
		`Archived: ${account.isArchived ? "yes" : "no"}`,
		`Revision: ${account.revision}`,
	].join("\n");

export const renderAccounts = (accounts: Account[]): string =>
	renderTable(
		["NAME", "TYPE", "BALANCE", "DEFAULT", "ARCHIVED", "ID"],
		accounts.map((account) => [
			account.name,
			account.accountType.name,
			money(account.currentBalance, account.currency),
			account.isDefault ? "yes" : "no",
			account.isArchived ? "yes" : "no",
			account.id,
		])
	);

export const renderTransactions = (transactions: Transaction[]): string =>
	renderTable(
		["DATE", "TYPE", "AMOUNT", "BALANCE AFTER", "NOTE", "ID"],
		transactions.map((transaction) => [
			transaction.date,
			transaction.type,
			transaction.amount.toFixed(2),
			transaction.balanceAfter.toFixed(2),
			transaction.note ?? "-",
			transaction.id,
		])
	);

export const renderAccountTypes = (accountTypes: AccountType[]): string =>
	renderTable(
		["NAME", "NATURE", "ARCHIVED", "ID"],
		accountTypes.map((accountType) => [
			accountType.name,
			accountType.balanceNature,
			accountType.isArchived ? "yes" : "no",
			accountType.id,
		])
	);
