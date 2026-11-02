import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";
import { seedUser } from "../src/users";

const DARK_CLASS = /(?:^|\s)dark(?:\s|$)/u;
const LIGHT_CLASS = /(?:^|\s)light(?:\s|$)/u;
const GROUP_HEADING = /^Preference needs /u;

test("currency and theme persist after reload on a narrow keyboard path @compatibility", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	const walletBefore = await user.query(api.accounts.get, {
		accountId: seed.accountId,
	});
	const savingsBefore = await user.query(api.accounts.get, {
		accountId: seed.destinationId,
	});
	expect(walletBefore.currency).toBeUndefined();
	expect(savingsBefore.currency).toBe("USD");
	const ledgerBefore = await user.query(api.accounts.listTransactions, {});
	await user.mutation(api.expenses.create, {
		accountId: null,
		amount: 10,
		date: seed.date,
		spentOn: "Preference currency expense",
	});
	await page.setViewportSize({ height: 844, width: 390 });
	await page.goto("/settings");
	await expect(
		page.getByRole("heading", { exact: true, name: "Settings" })
	).toBeVisible();
	await page
		.getByRole("combobox")
		.filter({ hasText: "US Dollar (USD)" })
		.click();
	await page.getByRole("option", { exact: true, name: "Euro (EUR)" }).click();
	await expect
		.poll(async () => (await user.query(api.users.get, {})).currency)
		.toBe("EUR");
	const dark = page.getByRole("button", { exact: true, name: "Dark" });
	await dark.focus();
	await expect(dark).toBeFocused();
	await dark.press("Enter");
	await expect(page.locator("html")).toHaveClass(DARK_CLASS);
	await page.reload();
	await expect(
		page.getByRole("combobox").filter({ hasText: "Euro (EUR)" })
	).toBeVisible();
	await expect(page.locator("html")).toHaveClass(DARK_CLASS);
	await page.goto("/expenses");
	await expect(
		page.getByText("Total spent", { exact: true }).locator("..")
	).toHaveText("Total spent€10.00");
	await expect(
		page
			.getByRole("row")
			.filter({ hasText: "Preference currency expense" })
			.getByRole("cell", { exact: true, name: "€10.00" })
	).toBeVisible();
	// Onboarding accounts intentionally inherit the user's display currency.
	// Accounts with an explicit currency must retain that currency instead.
	await page.goto(`/accounts/${seed.accountId}`);
	await expect(
		page
			.getByText("Current", { exact: true })
			.locator("..")
			.getByText("€1,000.00", { exact: true })
	).toBeVisible();
	await page.goto(`/accounts/${seed.destinationId}`);
	await expect(
		page
			.getByText("Current", { exact: true })
			.locator("..")
			.getByText("$200.00", { exact: true })
	).toBeVisible();
	expect(
		await user.query(api.accounts.get, { accountId: seed.accountId })
	).toEqual(walletBefore);
	expect(
		await user.query(api.accounts.get, { accountId: seed.destinationId })
	).toEqual(savingsBefore);
	expect(await user.query(api.accounts.listTransactions, {})).toEqual(
		ledgerBefore
	);
	await page.goto("/settings");
	await page.getByRole("button", { exact: true, name: "Light" }).press("Enter");
	await page.reload();
	await expect(page.locator("html")).toHaveClass(LIGHT_CLASS);
});

test("dashboard category view mode persists through navigation and reload", async ({
	page,
	user,
}) => {
	const { cycleId } = await seedUser(user);
	const type = await user.mutation(api.categories.createType, {
		name: "Preference needs",
	});
	if (!type) {
		throw new Error("Preference category type was not created");
	}
	await user.mutation(api.categories.create, {
		categoryTypeId: type._id,
		cycleId,
		name: "Preference groceries",
		plannedAmount: 50,
	});
	await page.goto("/dashboard");
	await expect(page.getByRole("button", { name: GROUP_HEADING })).toBeVisible();
	await page
		.getByRole("button", { exact: true, name: "Category view mode" })
		.click();
	await page
		.getByRole("menuitem", { exact: true, name: "Simple List" })
		.click();
	await expect
		.poll(async () => (await user.query(api.users.get, {})).dashboardViewMode)
		.toBe("list");
	await expect(page.getByRole("button", { name: GROUP_HEADING })).toHaveCount(
		0
	);
	await page.goto("/settings");
	await page.goto("/dashboard");
	await page.reload();
	await expect(
		page.getByRole("link").filter({ hasText: "Preference groceries" })
	).toBeVisible();
	await expect(page.getByRole("button", { name: GROUP_HEADING })).toHaveCount(
		0
	);
	await page
		.getByRole("button", { exact: true, name: "Category view mode" })
		.click();
	await page
		.getByRole("menuitem", { exact: true, name: "Grouped by Type" })
		.click();
	await expect
		.poll(async () => (await user.query(api.users.get, {})).dashboardViewMode)
		.toBe("grouped");
	await page.reload();
	await expect(page.getByRole("button", { name: GROUP_HEADING })).toBeVisible();
});
