// biome-ignore-all lint/performance/noAwaitInLoops: Stateful E2E steps and fixture cleanup require ordered execution.
import type { Page, WebSocketRoute } from "@playwright/test";
import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import {
	readExpenseFinancialState,
	seedExpenseCycleBoundary,
	seedExpenseMetadata,
} from "../src/expense-regression";
import { test } from "../src/playwright-fixtures";
import { type E2EUser, seedUser } from "../src/users";

const WALLET_OPTION = /^E2E Wallet\b/u;
const EXPENSES_URL = /\/expenses$/u;
const SAVINGS_OPTION = /^E2E Savings\b/u;
const NO_ACCOUNT_OPTION = /^No account selected/u;

const categoryPicker = (page: Page) =>
	page.getByRole("combobox", { exact: true, name: "Category" });

const selectCategory = async (page: Page, current: string, next: string) => {
	await categoryPicker(page).filter({ hasText: current }).click();
	await page.getByRole("option", { name: new RegExp(next) }).click();
};

const selectTag = async (page: Page, name: string) => {
	await page
		.getByRole("combobox", { exact: true, name: "Tags (optional)" })
		.click();
	await page.getByRole("option", { exact: true, name }).click();
	await page
		.getByPlaceholder("Search tags...", { exact: true })
		.press("Escape");
};

const dateLabel = (date: string) => {
	const parsed = new Date(`${date}T00:00:00.000Z`);
	const day = parsed.getUTCDate();
	let ordinal = "th";
	if (day < 11 || day > 13) {
		const endings: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
		ordinal = endings[day % 10] ?? "th";
	}
	const month = parsed.toLocaleString("en-US", {
		month: "long",
		timeZone: "UTC",
	});
	return `${month} ${day}${ordinal}, ${parsed.getUTCFullYear()}`;
};

const addExpenseThroughUI = async (
	page: Page,
	user: E2EUser,
	note: string,
	metadata?: { category: string; tags: readonly string[] }
) => {
	await page.goto("/expenses/new");
	await expect(
		page.getByRole("heading", { name: "Add New Expense" })
	).toBeVisible();
	await page.getByLabel("Amount", { exact: true }).fill("18.75");
	await page.getByLabel("Note (optional)", { exact: true }).fill(note);
	// Explicitly choose the wallet instead of depending on smart defaults.
	await page
		.getByRole("combobox", { exact: true, name: "Account (optional)" })
		.click();
	await page.getByRole("option", { name: WALLET_OPTION }).click();
	if (metadata) {
		await selectCategory(page, "Uncategorized", metadata.category);
		for (const tag of metadata.tags) {
			await selectTag(page, tag);
		}
	}
	await page.getByRole("button", { exact: true, name: "Add Expense" }).click();
	await expect
		.poll(async () => {
			const expenses = await user.query(api.expenses.list, {});
			return expenses.filter((candidate) => candidate.spentOn === note).length;
		})
		.toBe(1);
	const expenses = await user.query(api.expenses.list, {});
	const expense = expenses.find((candidate) => candidate.spentOn === note);
	if (!expense) {
		throw new Error(
			"UI-created expense was not returned by the authenticated public query"
		);
	}
	return expense;
};

test("creates an expense through the UI and persists it and the wallet balance after reload", async ({
	page,
	user,
}) => {
	const { accountId, cycleId } = await seedUser(user);
	const note = "E2E lunch persistence";
	const expense = await addExpenseThroughUI(page, user, note);
	expect(expense).toMatchObject({
		accountId,
		amount: 18.75,
		createdSource: "web",
		cycleId,
		spentOn: note,
	});
	await expect
		.poll(
			async () =>
				(await user.query(api.accounts.get, { accountId })).currentBalance
		)
		.toBe(981.25);

	await page.goto(`/expenses/${expense._id}`);
	await expect(
		page.getByRole("heading", { name: "Edit Expense" })
	).toBeVisible();
	await page.reload();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("18.75");
	await expect(page.getByLabel("Note (optional)", { exact: true })).toHaveValue(
		note
	);
	await expect(
		page.getByRole("combobox", { exact: true, name: "Account (optional)" })
	).toHaveText("E2E Wallet");
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({ accountId, amount: 18.75, spentOn: note });
	expect(
		(await user.query(api.accounts.get, { accountId })).currentBalance
	).toBe(981.25);
	await page.goto(`/accounts/${accountId}`);
	await expect(page.getByText("$981.25", { exact: true })).toBeVisible();
});

test("edits a direct expense detail URL and cancels then confirms deletion, restoring the balance", {
	tag: "@smoke",
}, async ({ page, user }) => {
	const { accountId } = await seedUser(user);
	const expense = await addExpenseThroughUI(page, user, "E2E edit and delete");
	await page.goto(`/expenses/${expense._id}`);
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("18.75");
	await page.getByLabel("Amount", { exact: true }).fill("25");
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	await expect
		.poll(
			async () =>
				(await user.query(api.expenses.get, { expenseId: expense._id })).amount
		)
		.toBe(25);
	await expect
		.poll(
			async () =>
				(await user.query(api.accounts.get, { accountId })).currentBalance
		)
		.toBe(975);
	const ledgerBeforeDeletion = await user.query(api.accounts.listTransactions, {
		accountId,
	});
	expect(ledgerBeforeDeletion).toHaveLength(3);

	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("25");
	await page.getByRole("button", { exact: true, name: "Delete" }).click();
	const confirmation = page.getByRole("alertdialog", {
		name: "Delete expense?",
	});
	await expect(confirmation).toBeVisible();
	await confirmation
		.getByRole("button", { exact: true, name: "Cancel" })
		.click();
	await expect(confirmation).toBeHidden();
	expect(
		(await user.query(api.expenses.get, { expenseId: expense._id })).amount
	).toBe(25);
	expect(
		(await user.query(api.accounts.get, { accountId })).currentBalance
	).toBe(975);
	expect(
		await user.query(api.accounts.listTransactions, { accountId })
	).toEqual(ledgerBeforeDeletion);

	await page.getByRole("button", { exact: true, name: "Delete" }).click();
	await confirmation
		.getByRole("button", { exact: true, name: "Delete" })
		.click();
	await expect(page).toHaveURL(EXPENSES_URL);
	await expect
		.poll(async () => {
			const expenses = await user.query(api.expenses.list, {});
			return expenses.some((candidate) => candidate._id === expense._id);
		})
		.toBe(false);
	await expect
		.poll(
			async () =>
				(await user.query(api.accounts.get, { accountId })).currentBalance
		)
		.toBe(1000);
	await page.reload();
	expect(await user.query(api.expenses.list, {})).toEqual([]);
	expect(
		(await user.query(api.accounts.get, { accountId })).currentBalance
	).toBe(1000);
	const ledger = await user.query(api.accounts.listTransactions, {
		accountId,
	});
	// Deletion appends one reversal; it must not erase or rewrite audit history.
	expect(ledger).toHaveLength(4);
	expect(ledger.slice(1)).toEqual(ledgerBeforeDeletion);
	expect(ledger).toMatchObject([
		{
			amount: 25,
			balanceAfter: 1000,
			expenseId: expense._id,
			source: "web",
			type: "expense",
		},
		{
			amount: -6.25,
			balanceAfter: 975,
			expenseId: expense._id,
			source: "web",
			type: "expense",
		},
		{
			amount: -18.75,
			balanceAfter: 981.25,
			expenseId: expense._id,
			source: "web",
			type: "expense",
		},
		{ amount: 1000, balanceAfter: 1000, type: "opening_balance" },
	]);
});

test("switches and clears a committed expense account without duplicate balance effects", {
	tag: "@compatibility",
}, async ({ page, user }) => {
	const seed = await seedUser(user);
	const opening = await readExpenseFinancialState(user, seed);
	const expense = await addExpenseThroughUI(page, user, "E2E move account");
	const created = await readExpenseFinancialState(user, seed);
	expect(created.wallet.currentBalance).toBe(981.25);
	expect(created.savings).toEqual(opening.savings);
	expect(created.walletLedger).toHaveLength(opening.walletLedger.length + 1);
	expect(created.walletLedger.slice(1)).toEqual(opening.walletLedger);
	expect(created.savingsLedger).toEqual(opening.savingsLedger);

	await page.goto(`/expenses/${expense._id}`);
	const accountPicker = page.getByRole("combobox", {
		exact: true,
		name: "Account (optional)",
	});
	await accountPicker.click();
	await page.getByRole("option", { name: SAVINGS_OPTION }).click();
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({
		accountId: seed.destinationId,
		amount: 18.75,
		revision: 2,
	});
	const moved = await readExpenseFinancialState(user, seed);
	expect(moved.wallet).toMatchObject({
		currentBalance: 1000,
		revision: created.wallet.revision + 1,
	});
	expect(moved.savings).toMatchObject({
		currentBalance: 181.25,
		revision: created.savings.revision + 1,
	});
	expect(moved.walletLedger).toHaveLength(created.walletLedger.length + 1);
	expect(moved.walletLedger[0]).toMatchObject({
		accountId: seed.accountId,
		amount: 18.75,
		balanceAfter: 1000,
		expenseId: expense._id,
		source: "web",
		type: "expense",
	});
	expect(moved.walletLedger.slice(1)).toEqual(created.walletLedger);
	expect(moved.savingsLedger).toHaveLength(created.savingsLedger.length + 1);
	expect(moved.savingsLedger[0]).toMatchObject({
		accountId: seed.destinationId,
		amount: -18.75,
		balanceAfter: 181.25,
		expenseId: expense._id,
		source: "web",
		type: "expense",
	});
	expect(moved.savingsLedger.slice(1)).toEqual(created.savingsLedger);

	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(accountPicker).toHaveText("E2E Savings");
	await accountPicker.click();
	await page.getByRole("option", { name: NO_ACCOUNT_OPTION }).click();
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	const cleared = await readExpenseFinancialState(user, seed);
	expect(cleared.wallet).toEqual(moved.wallet);
	expect(cleared.walletLedger).toEqual(moved.walletLedger);
	expect(cleared.savings).toMatchObject({
		currentBalance: 200,
		revision: moved.savings.revision + 1,
	});
	expect(cleared.savingsLedger).toHaveLength(moved.savingsLedger.length + 1);
	expect(cleared.savingsLedger[0]).toMatchObject({
		accountId: seed.destinationId,
		amount: 18.75,
		balanceAfter: 200,
		expenseId: expense._id,
		source: "web",
		type: "expense",
	});
	expect(cleared.savingsLedger.slice(1)).toEqual(moved.savingsLedger);
	expect(
		(await user.query(api.expenses.get, { expenseId: expense._id })).accountId
	).toBeUndefined();

	// A second real save of the cleared value must not append another refund.
	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(accountPicker).toHaveText("No account selected");
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	await page.reload();
	expect(await readExpenseFinancialState(user, seed)).toEqual(cleared);
	const savedAgain = await user.query(api.expenses.get, {
		expenseId: expense._id,
	});
	expect(savedAgain).toMatchObject({ amount: 18.75, revision: 4 });
	expect(savedAgain.accountId).toBeUndefined();
	expect(await user.query(api.expenses.list, {})).toHaveLength(1);
});

test("creates, reads, replaces and removes populated expense categories and tags", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	const metadata = await seedExpenseMetadata(user, seed.cycleId);
	const expense = await addExpenseThroughUI(
		page,
		user,
		"E2E populated metadata",
		{
			category: metadata.meals.name,
			tags: ["E2E Work", "E2E Personal"],
		}
	);
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({
		categoryId: metadata.meals._id,
		categoryName: "E2E Meals",
		tagIds: [metadata.workId, metadata.personalId],
		tagNames: ["E2E Work", "E2E Personal"],
	});
	const before = await readExpenseFinancialState(user, seed);
	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(categoryPicker(page)).toContainText("E2E Meals");
	await expect(
		page.getByRole("button", { exact: true, name: "Remove tag E2E Work" })
	).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Remove tag E2E Personal" })
	).toBeVisible();
	await selectCategory(page, "E2E Meals", "E2E Travel");
	await page
		.getByRole("button", { exact: true, name: "Remove tag E2E Work" })
		.click();
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({
		categoryId: metadata.travel._id,
		revision: 2,
		tagIds: [metadata.personalId],
	});
	expect(await readExpenseFinancialState(user, seed)).toEqual(before);

	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(categoryPicker(page)).toContainText("E2E Travel");
	await expect(
		page.getByRole("button", { exact: true, name: "Remove tag E2E Work" })
	).toHaveCount(0);
	await selectCategory(page, "E2E Travel", "Uncategorized");
	await page
		.getByRole("button", { exact: true, name: "Remove tag E2E Personal" })
		.click();
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	const cleared = await user.query(api.expenses.get, {
		expenseId: expense._id,
	});
	expect(cleared.categoryId).toBeUndefined();
	expect(cleared.categoryName).toBeNull();
	expect(cleared.tagIds ?? []).toEqual([]);
	expect(cleared.tagNames).toEqual([]);
	expect(await readExpenseFinancialState(user, seed)).toEqual(before);
	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(categoryPicker(page)).toContainText("Uncategorized");
	await expect(
		page.getByRole("combobox", { exact: true, name: "Tags (optional)" })
	).toHaveText("Add tags...");
});

test("changes the date across an exclusive cycle boundary, resets the category and reselects from the new cycle", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	const { boundary, nextCycle, oldCategory, newCategory } =
		await seedExpenseCycleBoundary(user, seed);
	const expense = await user.mutation(api.expenses.create, {
		accountId: seed.accountId,
		amount: 25,
		categoryId: oldCategory._id,
		date: seed.date,
		spentOn: "E2E exclusive boundary",
	});
	const before = await readExpenseFinancialState(user, seed);
	expect(
		await user.query(api.cycles.getCurrent, { date: seed.date })
	).toMatchObject({ _id: seed.cycleId });
	expect(
		await user.query(api.cycles.getCurrent, { date: boundary })
	).toMatchObject({ _id: nextCycle._id });
	await page.goto(`/expenses/${expense._id}`);
	await expect(categoryPicker(page)).toContainText("E2E Boundary meals");
	await page
		.getByRole("button", { exact: true, name: dateLabel(seed.date) })
		.click();
	if (seed.date.slice(0, 7) !== boundary.slice(0, 7)) {
		await page
			.getByRole("button", { exact: true, name: "Go to the Next Month" })
			.click();
	}
	await page
		.getByRole("grid")
		.getByRole("button", { name: new RegExp(dateLabel(boundary)) })
		.click();
	await page.keyboard.press("Escape");
	await expect(
		page.getByText("Will be added to", { exact: false })
	).toContainText(nextCycle.name);
	await expect(categoryPicker(page)).toContainText("Uncategorized");
	// Save before reselecting: a visual empty label must not mask a stale old-cycle ID.
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	const moved = await user.query(api.expenses.get, { expenseId: expense._id });
	expect(moved).toMatchObject({
		cycleId: nextCycle._id,
		date: boundary,
		revision: 2,
	});
	expect(moved.categoryId).toBeUndefined();
	expect(
		await user.query(api.expenses.list, { cycleId: seed.cycleId })
	).toEqual([]);
	expect(
		(await user.query(api.expenses.list, { cycleId: nextCycle._id })).map(
			(entry) => entry._id
		)
	).toEqual([expense._id]);
	expect(await readExpenseFinancialState(user, seed)).toEqual(before);
	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await selectCategory(page, "Uncategorized", "E2E Boundary meals");
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({
		categoryId: newCategory._id,
		cycleId: nextCycle._id,
		date: boundary,
		revision: 3,
	});
	expect(await readExpenseFinancialState(user, seed)).toEqual(before);
});

test("expense modal links support keyboard validation, Escape, back/forward and reload without writes", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	// A populated list has one Add Expense link (the empty state has two).
	const expense = await user.mutation(api.expenses.create, {
		accountId: seed.accountId,
		amount: 12,
		date: seed.date,
		spentOn: "E2E navigation",
	});
	const before = await readExpenseFinancialState(user, seed);
	await page.goto("/expenses");
	const addLink = page.getByRole("link", { exact: true, name: "Add Expense" });
	await addLink.focus();
	await addLink.press("Enter");
	const modal = page.getByRole("dialog", { exact: true, name: "Add Expense" });
	await expect(modal).toBeVisible();
	const amount = modal.getByLabel("Amount", { exact: true });
	await expect(amount).toBeFocused();
	await expect(
		modal.getByRole("button", { exact: true, name: "Add Expense" })
	).toBeEnabled();
	await amount.press("Enter");
	await expect(
		page.getByText("Please enter a valid amount", { exact: true })
	).toBeVisible();
	await amount.fill("0");
	await amount.press("Tab");
	await modal.getByRole("button", { exact: true, name: "Add Expense" }).click();
	await expect(modal).toBeVisible();
	await expect(amount).toHaveValue("0");
	expect(
		(await user.query(api.expenses.list, {})).map((entry) => entry._id)
	).toEqual([expense._id]);
	expect(await readExpenseFinancialState(user, seed)).toEqual(before);
	await amount.fill("9.50");
	await page.keyboard.press("Escape");
	await expect(modal).toBeHidden();
	await expect(page).toHaveURL(EXPENSES_URL);
	await addLink.click();
	await expect(modal).toBeVisible();
	await expect(amount).toHaveValue("");
	await page.goBack();
	await expect(modal).toBeHidden();
	await expect(page).toHaveURL(EXPENSES_URL);
	await page.goForward();
	await expect(modal).toBeVisible();
	await page.reload();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(
		page.getByRole("heading", { exact: true, name: "Add New Expense" })
	).toBeVisible();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("");
	await page.goto("/expenses");
	await page.getByRole("row").filter({ hasText: "E2E navigation" }).click();
	await expect(
		page.getByRole("dialog", { exact: true, name: "Edit Expense" })
	).toBeVisible();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("12");
	await page.reload();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(
		page.getByRole("heading", { exact: true, name: "Edit Expense" })
	).toBeVisible();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("12");
	expect(await readExpenseFinancialState(user, seed)).toEqual(before);
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({ amount: 12, revision: 1 });
});

test("a rejected stale-account edit preserves input and retries successfully without partial financial writes", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	const expense = await addExpenseThroughUI(
		page,
		user,
		"E2E failed edit retry"
	);
	await page.goto(`/expenses/${expense._id}`);
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("18.75");
	await page.getByLabel("Amount", { exact: true }).fill("25");
	const accountPicker = page.getByRole("combobox", {
		exact: true,
		name: "Account (optional)",
	});
	await accountPicker.click();
	await page.getByRole("option", { name: SAVINGS_OPTION }).click();
	// A real concurrent change, not a mocked mutation response: the selected
	// destination becomes archived before this expense can be committed.
	await user.mutation(api.accounts.archive, {
		accountId: seed.destinationId,
		isArchived: true,
	});
	const before = await readExpenseFinancialState(user, seed);
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(
		page.getByText("Failed to update expense", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Save Changes" })
	).toBeEnabled();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("25");
	await expect(accountPicker).toHaveText("E2E Savings");
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({
		accountId: seed.accountId,
		amount: 18.75,
		revision: 1,
	});
	expect(await readExpenseFinancialState(user, seed)).toEqual(before);
	await accountPicker.click();
	await page.getByRole("option", { name: WALLET_OPTION }).click();
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(EXPENSES_URL);
	const after = await readExpenseFinancialState(user, seed);
	expect(after.wallet).toMatchObject({
		currentBalance: 975,
		revision: before.wallet.revision + 1,
	});
	expect(after.savings).toEqual(before.savings);
	expect(after.savingsLedger).toEqual(before.savingsLedger);
	expect(after.walletLedger).toHaveLength(before.walletLedger.length + 1);
	expect(after.walletLedger[0]).toMatchObject({
		amount: -6.25,
		balanceAfter: 975,
		expenseId: expense._id,
		source: "web",
		type: "expense",
	});
	expect(after.walletLedger.slice(1)).toEqual(before.walletLedger);
	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("25");
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({
		accountId: seed.accountId,
		amount: 25,
		revision: 2,
	});
	expect(await readExpenseFinancialState(user, seed)).toEqual(after);
});

test("resilience: a controlled Convex socket disconnect retains a pending edit and reconnects exactly once", async ({
	page,
	user,
}) => {
	const convexHost = new URL(user.config.convexUrl).hostname;
	let disconnected = false;
	let connection:
		| { client: WebSocketRoute; server: WebSocketRoute }
		| undefined;
	// Install before navigation creates the tested connection. Outside the
	// deliberate outage all frames are forwarded to the actual Convex server.
	await page.routeWebSocket(
		(url) => url.hostname === convexHost,
		async (client) => {
			// biome-ignore lint/suspicious/noUnnecessaryConditions: Playwright reenters this callback after the disconnect flag changes.
			if (disconnected) {
				await client.close({ code: 1013 });
				return;
			}
			connection = { client, server: client.connectToServer() };
		}
	);
	const seed = await seedUser(user);
	const expense = await addExpenseThroughUI(page, user, "E2E reconnect");
	await page.goto(`/expenses/${expense._id}`);
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("18.75");
	const before = await readExpenseFinancialState(user, seed);
	await page.getByLabel("Amount", { exact: true }).fill("25");
	await expect(
		page.getByRole("button", { exact: true, name: "Save Changes" })
	).toBeEnabled();
	// Fault injection only: this is reconnect resilience, not happy-path proof.
	if (!connection) {
		throw new Error(
			"Expected a routed live Convex WebSocket before disconnect"
		);
	}
	disconnected = true;
	try {
		await Promise.all([connection.client.close(), connection.server.close()]);
		await page
			.getByRole("button", { exact: true, name: "Save Changes" })
			.click();
		await expect(
			page.getByRole("button", { exact: true, name: "Saving..." })
		).toBeDisabled();
		await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("25");
		// This independent HTTP read cannot be satisfied by an optimistic browser
		// value, and proves the mutation did not commit during the outage.
		expect(
			await user.query(api.expenses.get, { expenseId: expense._id })
		).toMatchObject({ amount: 18.75, revision: 1 });
		expect(await readExpenseFinancialState(user, seed)).toEqual(before);
	} finally {
		disconnected = false;
	}
	await expect(page).toHaveURL(EXPENSES_URL, { timeout: 30_000 });
	const after = await readExpenseFinancialState(user, seed);
	expect(after.wallet).toMatchObject({
		currentBalance: 975,
		revision: before.wallet.revision + 1,
	});
	expect(after.savings).toEqual(before.savings);
	expect(after.savingsLedger).toEqual(before.savingsLedger);
	expect(after.walletLedger).toHaveLength(before.walletLedger.length + 1);
	expect(after.walletLedger[0]).toMatchObject({
		amount: -6.25,
		balanceAfter: 975,
		expenseId: expense._id,
		source: "web",
		type: "expense",
	});
	expect(after.walletLedger.slice(1)).toEqual(before.walletLedger);
	await page.goto(`/expenses/${expense._id}`);
	await page.reload();
	await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("25");
	expect(
		await user.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({ amount: 25, revision: 2 });
	expect(await readExpenseFinancialState(user, seed)).toEqual(after);
	expect(await user.query(api.expenses.list, {})).toHaveLength(1);
});
