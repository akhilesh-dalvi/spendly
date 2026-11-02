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
	await page.getByRole("button", { exact: true, name: "Save changes" }).click();
	await expect(
		page.getByRole("heading", { exact: true, name: "E2E Rainy day" })
	).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Make default" }).click();
	await expect(
		page.getByRole("button", { exact: true, name: "Default account" })
	).toBeDisabled();
	expect((await user.query(api.users.get, {})).defaultAccountId).toBe(
		destinationId
	);
	await page.goto("/expenses/new");
	await expect(
		page.getByRole("combobox", { exact: true, name: "Account (optional)" })
	).toHaveText("E2E Rainy day");
	await page.goto(`/accounts/${destinationId}`);
	await page.getByRole("button", { exact: true, name: "Archive" }).click();
	const confirmation = page.getByRole("alertdialog", {
		exact: true,
		name: "Archive E2E Rainy day?",
	});
	await confirmation
		.getByRole("button", { exact: true, name: "Cancel" })
		.click();
	expect(
		(await user.query(api.accounts.get, { accountId: destinationId }))
			.isArchived
	).toBe(false);
	await page.getByRole("button", { exact: true, name: "Archive" }).click();
	await confirmation
		.getByRole("button", { exact: true, name: "Archive account" })
		.click();
	await expect(
		page.getByRole("button", { exact: true, name: "Reactivate" })
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
		{ amount: 200, balanceAfter: 200, type: "opening_balance" },
	]);
	await page.getByRole("button", { exact: true, name: "Reactivate" }).click();
	await expect(
		page.getByRole("button", { exact: true, name: "Archive" })
	).toBeVisible();
	await page.reload();
	expect(
		await user.query(api.accounts.get, { accountId: destinationId })
	).toMatchObject({
		currentBalance: 200,
		isArchived: false,
		name: "E2E Rainy day",
		startingBalance: 200,
	});
	expect(
		await user.query(api.accounts.listTransactions, {
			accountId: destinationId,
		})
	).toHaveLength(1);
});
