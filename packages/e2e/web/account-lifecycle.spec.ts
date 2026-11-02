import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";
import { seedUser } from "../src/users";

test("edits, defaults, archives and reactivates an account without losing its ledger", async ({
	page,
	user,
}) => {
	const { destinationId, date } = await seedUser(user);
	await page.goto(`/accounts/${destinationId}`);
	await page.getByLabel("Account name", { exact: true }).fill("E2E Rainy day");
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "E2E Rainy day", exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Make default", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Default account", exact: true })
	).toBeDisabled();
	expect((await user.query(api.users.get, {})).defaultAccountId).toBe(
		destinationId
	);
	await page.goto("/expenses/new");
	await expect(
		page.getByRole("combobox", { name: "Account (optional)", exact: true })
	).toHaveText("E2E Rainy day");
	await page.goto(`/accounts/${destinationId}`);
	await page.getByRole("button", { name: "Archive", exact: true }).click();
	const confirmation = page.getByRole("alertdialog", {
		name: "Archive E2E Rainy day?",
		exact: true,
	});
	await confirmation
		.getByRole("button", { name: "Cancel", exact: true })
		.click();
	expect(
		(await user.query(api.accounts.get, { accountId: destinationId }))
			.isArchived
	).toBe(false);
	await page.getByRole("button", { name: "Archive", exact: true }).click();
	await confirmation
		.getByRole("button", { name: "Archive account", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Reactivate", exact: true })
	).toBeVisible();
	expect(
		(await user.query(api.accounts.list, {})).map((account) => account._id)
	).not.toContain(destinationId);
	expect(
		(await user.query(api.users.get, {})).defaultAccountId
	).toBeUndefined();
	await expect(
		user.mutation(api.expenses.create, {
			accountId: destinationId,
			amount: 25,
			date,
		})
	).rejects.toThrow("ACCOUNT_ARCHIVED");
	expect(await user.query(api.expenses.list, {})).toHaveLength(0);
	expect(
		await user.query(api.accounts.listTransactions, {
			accountId: destinationId,
		})
	).toMatchObject([
		{ type: "opening_balance", amount: 200, balanceAfter: 200 },
	]);
	await page.getByRole("button", { name: "Reactivate", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Archive", exact: true })
	).toBeVisible();
	await page.reload();
	expect(
		await user.query(api.accounts.get, { accountId: destinationId })
	).toMatchObject({
		name: "E2E Rainy day",
		isArchived: false,
		currentBalance: 200,
		startingBalance: 200,
	});
	expect(
		await user.query(api.accounts.listTransactions, {
			accountId: destinationId,
		})
	).toHaveLength(1);
});
