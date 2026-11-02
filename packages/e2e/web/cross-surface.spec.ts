import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { z } from "zod";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";
import { seedUser } from "../src/users";

const NOTE_LABEL = /Note/u;
const TRANSFER_OUT_LABEL = /^Transfer out · /u;
const TRANSFER_IN_LABEL = /^Transfer in · /u;
const success = z.object({ schemaVersion: z.literal(1), data: z.unknown() });
const expenseResult = success.extend({
	data: z.object({
		id: z.string(),
		amount: z.number(),
		spentOn: z.string().nullable(),
	}),
});
const accountExpenseResult = expenseResult.extend({
	data: expenseResult.shape.data.extend({
		account: z.object({ id: z.string(), name: z.string() }).nullable(),
		accountSource: z.enum(["explicit", "user_default", "none"]),
		accountEffects: z.array(
			z.object({
				accountId: z.string(),
				balanceBefore: z.number(),
				balanceAfter: z.number(),
			})
		),
	}),
});
const transferResult = success.extend({
	data: z.object({
		id: z.string(),
		amount: z.number(),
		fromAccount: z.object({ id: z.string(), currentBalance: z.number() }),
		toAccount: z.object({ id: z.string(), currentBalance: z.number() }),
	}),
});
const confirmation = success.extend({
	data: z.object({ confirmationToken: z.string(), revision: z.number() }),
});

test(
	"CLI expense can be edited in Web and read by a fresh CLI process",
	{ tag: "@smoke" },
	async ({ page, user }) => {
		const seed = await seedUser(user);
		await user.loginCli();
		const added = await user.runCli([
			"expenses",
			"add",
			"--amount",
			"18.75",
			"--date",
			seed.date,
			"--spent-on",
			"Cross-surface lunch",
			"--account-id",
			seed.accountId,
			"--idempotency-key",
			randomUUID(),
		]);
		expect(added.exitCode).toBe(0);
		expect(added.stderr).toBe("");
		const expense = expenseResult.parse(JSON.parse(added.stdout)).data;
		await page.goto(`/expenses/${expense.id}`);
		await expect(page.getByLabel("Amount", { exact: true })).toHaveValue(
			"18.75"
		);
		await page.getByLabel("Amount", { exact: true }).fill("25");
		await page
			.getByRole("button", { name: "Save Changes", exact: true })
			.click();
		await expect
			.poll(
				async () =>
					(await user.query(api.accounts.get, { accountId: seed.accountId }))
						.currentBalance
			)
			.toBe(975);
		const read = await user.runCli(["expenses", "get", expense.id]);
		expect(read.exitCode).toBe(0);
		expect(expenseResult.parse(JSON.parse(read.stdout)).data).toMatchObject({
			id: expense.id,
			amount: 25,
			spentOn: "Cross-surface lunch",
		});
		await page.goto(`/expenses/${expense.id}`);
		await page.reload();
		await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("25");
	}
);

test("Web expense can be confirmed and deleted by CLI with one balance reversal", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	await page.goto("/expenses/new");
	await page.getByLabel("Amount", { exact: true }).fill("18.75");
	await page.getByLabel(NOTE_LABEL).fill("Web-to-CLI lunch");
	await page.getByRole("button", { name: "Add Expense", exact: true }).click();
	await expect
		.poll(
			async () =>
				(await user.query(api.expenses.list, { cycleId: seed.cycleId })).length
		)
		.toBe(1);
	const [expense] = await user.query(api.expenses.list, {
		cycleId: seed.cycleId,
	});
	if (!expense) {
		throw new Error("Expected Web-created expense");
	}
	expect(expense).toMatchObject({ amount: 18.75, accountId: seed.accountId });
	await user.loginCli();
	const preview = await user.runCli([
		"expenses",
		"delete",
		expense._id,
		"--dry-run",
	]);
	expect(preview.exitCode).toBe(0);
	const prepared = confirmation.parse(JSON.parse(preview.stdout)).data;
	const removed = await user.runCli([
		"expenses",
		"delete",
		expense._id,
		"--confirmation-token",
		prepared.confirmationToken,
		"--if-revision",
		String(prepared.revision),
		"--idempotency-key",
		randomUUID(),
	]);
	expect(removed.exitCode).toBe(0);
	expect(
		await user.query(api.expenses.list, { cycleId: seed.cycleId })
	).toHaveLength(0);
	expect(
		(await user.query(api.accounts.get, { accountId: seed.accountId }))
			.currentBalance
	).toBe(1000);
	await page.goto("/expenses");
	await expect(page.getByText("Web-to-CLI lunch", { exact: true })).toHaveCount(
		0
	);
});

test("CLI transfer appears in Web balances and history without creating an expense", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	await user.loginCli();
	const from = await user.query(api.cli.v1.accounts.get, {
		accountId: seed.accountId,
	});
	const to = await user.query(api.cli.v1.accounts.get, {
		accountId: seed.destinationId,
	});
	await page.goto(`/accounts/${seed.accountId}`);
	const result = await user.runCli([
		"accounts",
		"transfer",
		"--from-account-id",
		seed.accountId,
		"--to-account-id",
		seed.destinationId,
		"--amount",
		"125",
		"--date",
		seed.date,
		"--note",
		"CLI-to-Web reserve transfer",
		"--if-from-revision",
		String(from.revision),
		"--if-to-revision",
		String(to.revision),
		"--idempotency-key",
		randomUUID(),
	]);
	expect(result.exitCode).toBe(0);
	expect(result.stderr).toBe("");
	const transfer = transferResult.parse(JSON.parse(result.stdout)).data;
	expect(transfer).toMatchObject({
		amount: 125,
		fromAccount: { id: seed.accountId, currentBalance: 875 },
		toAccount: { id: seed.destinationId, currentBalance: 325 },
	});
	await expect(
		page
			.getByText("Current", { exact: true })
			.locator("..")
			.getByText("$875.00", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText("CLI-to-Web reserve transfer", { exact: true })
	).toBeVisible();
	await expect(page.getByText(TRANSFER_OUT_LABEL)).toBeVisible();
	await expect(page.getByText("-$125.00", { exact: true })).toBeVisible();
	await page.reload();
	await expect(
		page.getByText("$875.00 balance", { exact: true })
	).toBeVisible();
	await page.goto(`/accounts/${seed.destinationId}`);
	await expect(
		page
			.getByText("Current", { exact: true })
			.locator("..")
			.getByText("$325.00", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText("CLI-to-Web reserve transfer", { exact: true })
	).toBeVisible();
	await expect(page.getByText(TRANSFER_IN_LABEL)).toBeVisible();
	await expect(page.getByText("+$125.00", { exact: true })).toBeVisible();
	const outgoing = await user.query(api.accounts.listTransactions, {
		accountId: seed.accountId,
	});
	const incoming = await user.query(api.accounts.listTransactions, {
		accountId: seed.destinationId,
	});
	expect(outgoing).toHaveLength(2);
	expect(incoming).toHaveLength(2);
	expect(
		outgoing.filter((entry) => entry.type === "transfer_out")
	).toMatchObject([
		{
			transferId: transfer.id,
			amount: -125,
			balanceAfter: 875,
			source: "cli",
		},
	]);
	expect(
		incoming.filter((entry) => entry.type === "transfer_in")
	).toMatchObject([
		{
			transferId: transfer.id,
			amount: 125,
			balanceAfter: 325,
			source: "cli",
		},
	]);
	expect(await user.query(api.expenses.list, {})).toEqual([]);
	await page.goto("/expenses");
	await expect(
		page.getByRole("heading", { name: "No expenses found", exact: true })
	).toBeVisible();
	await expect(
		page.getByText("Total spent", { exact: true }).locator("..")
	).toHaveText("Total spent$0.00");
});

test("Web default-account change is used by fresh CLI processes unless --without-account overrides it", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	// Authenticate before the Web change to catch stale/default-account caching
	// across surfaces rather than merely loading the preference at login.
	await user.loginCli();
	await page.goto(`/accounts/${seed.destinationId}`);
	await page.getByRole("button", { name: "Make default", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Default account", exact: true })
	).toBeDisabled();
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Default account", exact: true })
	).toBeDisabled();
	expect((await user.query(api.users.get, {})).defaultAccountId).toBe(
		seed.destinationId
	);

	const defaulted = await user.runCli([
		"expenses",
		"add",
		"--amount",
		"10",
		"--date",
		seed.date,
		"--spent-on",
		"CLI changed Web default",
		"--idempotency-key",
		randomUUID(),
	]);
	expect(defaulted.exitCode).toBe(0);
	expect(defaulted.stderr).toBe("");
	const assigned = accountExpenseResult.parse(
		JSON.parse(defaulted.stdout)
	).data;
	expect(assigned).toMatchObject({
		amount: 10,
		account: { id: seed.destinationId, name: "E2E Savings" },
		accountSource: "user_default",
	});
	expect(assigned.accountEffects).toEqual([
		{
			accountId: seed.destinationId,
			balanceBefore: 200,
			balanceAfter: 190,
		},
	]);
	const unassigned = await user.runCli([
		"expenses",
		"add",
		"--amount",
		"20",
		"--date",
		seed.date,
		"--spent-on",
		"CLI explicit no account",
		"--without-account",
		"--idempotency-key",
		randomUUID(),
	]);
	expect(unassigned.exitCode).toBe(0);
	expect(unassigned.stderr).toBe("");
	const withoutAccount = accountExpenseResult.parse(
		JSON.parse(unassigned.stdout)
	).data;
	expect(withoutAccount).toMatchObject({
		amount: 20,
		account: null,
		accountSource: "none",
		accountEffects: [],
	});
	const expenses = await user.query(api.expenses.list, {});
	expect(expenses).toHaveLength(2);
	expect(expenses.find((expense) => expense._id === assigned.id)).toMatchObject(
		{ amount: 10, accountId: seed.destinationId, createdSource: "cli" }
	);
	expect(
		expenses.find((expense) => expense._id === withoutAccount.id)?.accountId
	).toBeUndefined();
	expect(
		(await user.query(api.accounts.get, { accountId: seed.accountId }))
			.currentBalance
	).toBe(1000);
	expect(
		(await user.query(api.accounts.get, { accountId: seed.destinationId }))
			.currentBalance
	).toBe(190);
	expect(
		await user.query(api.accounts.listTransactions, {
			accountId: seed.accountId,
		})
	).toHaveLength(1);
	expect(
		await user.query(api.accounts.listTransactions, {
			accountId: seed.destinationId,
		})
	).toHaveLength(2);
	await page.reload();
	await expect(
		page
			.getByText("Current", { exact: true })
			.locator("..")
			.getByText("$190.00", { exact: true })
	).toBeVisible();
	await page.goto("/expenses");
	await expect(
		page.getByText("Total spent", { exact: true }).locator("..")
	).toHaveText("Total spent$30.00");
	await expect(
		page
			.getByRole("row")
			.filter({ hasText: "CLI changed Web default" })
			.getByText("E2E Savings", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("row").filter({ hasText: "CLI explicit no account" })
	).toHaveCount(1);
	await page.goto(`/expenses/${withoutAccount.id}`);
	await expect(
		page.getByRole("combobox", { name: "Account (optional)", exact: true })
	).toHaveText("No account selected");
});
