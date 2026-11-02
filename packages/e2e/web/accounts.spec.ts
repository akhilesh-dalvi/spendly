import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";
import { seedUser } from "../src/users";

const SAVINGS_OPTION = /^E2E Savings ·/u;

test("creates an account with a selected type and an opening ledger snapshot through the UI", async ({
	page,
	user,
}) => {
	const { assetTypeId } = await seedUser(user);
	const types = await user.query(api.accountTypes.list, {});
	const assetType = types.find((type) => type._id === assetTypeId);
	if (!assetType) {
		throw new Error("Seeded asset account type is missing");
	}
	await page.goto("/accounts/new");
	await expect(
		page.getByRole("heading", { exact: true, name: "New account" })
	).toBeVisible();
	await page
		.getByLabel("Account name", { exact: true })
		.fill("E2E Travel fund");
	await page
		.getByRole("combobox", { exact: true, name: "Account type" })
		.click();
	await page.getByRole("option", { exact: true, name: assetType.name }).click();
	await page
		.getByLabel("Opening balance (USD)", { exact: true })
		.fill("125.50");
	await page
		.getByRole("button", { exact: true, name: "Create account" })
		.click();
	await expect(
		page.getByRole("heading", { exact: true, name: "E2E Travel fund" })
	).toBeVisible();

	const accounts = await user.query(api.accounts.list, {});
	const account = accounts.find(
		(candidate) => candidate.name === "E2E Travel fund"
	);
	if (!account) {
		throw new Error(
			"UI-created account was not returned by the authenticated public query"
		);
	}
	expect(account).toMatchObject({
		accountTypeId: assetTypeId,
		createdSource: "web",
		currency: "USD",
		currentBalance: 125.5,
		startingBalance: 125.5,
	});
	await expect(page).toHaveURL(new RegExp(`/accounts/${account._id}$`, "u"));
	const ledger = await user.query(api.accounts.listTransactions, {
		accountId: account._id,
	});
	expect(ledger).toHaveLength(1);
	expect(ledger[0]).toMatchObject({
		accountId: account._id,
		amount: 125.5,
		balanceAfter: 125.5,
		source: "web",
		type: "opening_balance",
	});
	await page.reload();
	await expect(
		page.getByRole("heading", { exact: true, name: "E2E Travel fund" })
	).toBeVisible();
	await expect(page.getByLabel("Account name", { exact: true })).toHaveValue(
		"E2E Travel fund"
	);
	await expect(
		page.getByRole("combobox", { exact: true, name: "Account type" })
	).toHaveText(assetType.name);
	expect(
		(await user.query(api.accounts.get, { accountId: account._id }))
			.currentBalance
	).toBe(125.5);
});

test("transfers between accounts and reconciles the wallet through UI ledger actions", {
	tag: "@smoke",
}, async ({ page, user }) => {
	const { accountId, destinationId, date } = await seedUser(user);
	await page.goto(`/accounts/${accountId}`);
	await expect(
		page.getByRole("heading", { exact: true, name: "E2E Wallet" })
	).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Transfer" }).click();
	const transfer = page.getByRole("dialog", {
		exact: true,
		name: "Transfer from E2E Wallet",
	});
	await transfer
		.getByRole("combobox", { exact: true, name: "Destination account" })
		.click();
	await page.getByRole("option", { name: SAVINGS_OPTION }).click();
	await transfer.getByLabel("Amount (USD)", { exact: true }).fill("250");
	await transfer.getByLabel("Date", { exact: true }).fill(date);
	await transfer
		.getByLabel("Note", { exact: true })
		.fill("E2E emergency fund transfer");
	await transfer
		.getByRole("button", { exact: true, name: "Record transfer" })
		.click();
	await expect(transfer).toBeHidden();
	await expect
		.poll(
			async () =>
				(await user.query(api.accounts.get, { accountId })).currentBalance
		)
		.toBe(750);
	await expect
		.poll(
			async () =>
				(await user.query(api.accounts.get, { accountId: destinationId }))
					.currentBalance
		)
		.toBe(450);
	await expect(page.getByText("$750.00", { exact: true })).toBeVisible();

	const walletLedger = await user.query(api.accounts.listTransactions, {
		accountId,
	});
	const savingsLedger = await user.query(api.accounts.listTransactions, {
		accountId: destinationId,
	});
	const outgoing = walletLedger.filter(
		(entry) => entry.type === "transfer_out"
	);
	const incoming = savingsLedger.filter(
		(entry) => entry.type === "transfer_in"
	);
	expect(outgoing).toHaveLength(1);
	expect(incoming).toHaveLength(1);
	expect(outgoing[0]).toMatchObject({
		amount: -250,
		balanceAfter: 750,
		date,
		note: "E2E emergency fund transfer",
		source: "web",
	});
	expect(incoming[0]).toMatchObject({
		amount: 250,
		balanceAfter: 450,
		source: "web",
		transferId: outgoing[0]?.transferId,
	});
	expect(outgoing[0]?.transferId).toBeDefined();

	await page
		.getByRole("button", { exact: true, name: "Adjust balance" })
		.click();
	const adjustment = page.getByRole("dialog", {
		exact: true,
		name: "Adjust E2E Wallet",
	});
	await adjustment
		.getByLabel("Actual balance (USD)", { exact: true })
		.fill("800");
	await adjustment.getByLabel("Date", { exact: true }).fill(date);
	await adjustment
		.getByLabel("Note", { exact: true })
		.fill("E2E bank reconciliation");
	await adjustment
		.getByRole("button", { exact: true, name: "Update balance" })
		.click();
	await expect(adjustment).toBeHidden();
	await expect
		.poll(
			async () =>
				(await user.query(api.accounts.get, { accountId })).currentBalance
		)
		.toBe(800);
	await expect(page.getByText("$800.00", { exact: true })).toBeVisible();
	const adjustments = (
		await user.query(api.accounts.listTransactions, { accountId })
	).filter((entry) => entry.type === "manual_adjustment");
	expect(adjustments).toHaveLength(1);
	expect(adjustments[0]).toMatchObject({
		amount: 50,
		balanceAfter: 800,
		date,
		note: "E2E bank reconciliation",
		source: "web",
	});
	expect(
		(await user.query(api.accounts.get, { accountId: destinationId }))
			.currentBalance
	).toBe(450);
	await page.reload();
	await expect(page.getByText("$800.00", { exact: true })).toBeVisible();
	await expect(
		page.getByText("E2E bank reconciliation", { exact: true })
	).toBeVisible();
	await page.goto(`/accounts/${destinationId}`);
	await expect(
		page.getByRole("heading", { exact: true, name: "E2E Savings" })
	).toBeVisible();
	await expect(page.getByText("$450.00", { exact: true })).toBeVisible();
});
