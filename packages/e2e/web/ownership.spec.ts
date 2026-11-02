// biome-ignore-all lint/performance/noAwaitInLoops: Stateful E2E steps and fixture cleanup require ordered execution.
import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";
import { createUser, type E2EUser, seedUser } from "../src/users";

const WALLET_OPTION = /^E2E Wallet\b/u;

test("isolates two real users' expenses, accounts, cycles, and ledger reads", {
	tag: "@smoke",
}, async ({ browser, page, user }) => {
	const own = await seedUser(user);
	await page.goto("/expenses/new");
	await page.getByLabel("Amount", { exact: true }).fill("18.75");
	await page
		.getByLabel("Note (optional)", { exact: true })
		.fill("E2E owner-only lunch");
	await page
		.getByRole("combobox", { exact: true, name: "Account (optional)" })
		.click();
	await page.getByRole("option", { name: WALLET_OPTION }).click();
	await page.getByRole("button", { exact: true, name: "Add Expense" }).click();
	await expect
		.poll(async () => (await user.query(api.expenses.list, {})).length)
		.toBe(1);
	const [expense] = await user.query(api.expenses.list, {});
	if (!expense) {
		throw new Error("Owner's UI-created expense is missing");
	}
	expect(expense).toMatchObject({
		accountId: own.accountId,
		amount: 18.75,
		spentOn: "E2E owner-only lunch",
	});

	const ownerAccountName = "E2E owner-only private wallet";
	await user.mutation(api.accounts.update, {
		accountId: own.accountId,
		name: ownerAccountName,
	});

	// Separate context means the second user's Clerk session cannot overwrite
	// the fixture user's session. createUser also guards and journals cleanup.
	const context = await browser.newContext({
		baseURL: user.config.baseUrl,
		timezoneId: "UTC",
	});
	let other: E2EUser | undefined;
	try {
		other = await createUser(await context.newPage(), user.config);
		const foreign = await seedUser(other);
		expect((await user.query(api.users.get, {}))._id).not.toBe(
			(await other.query(api.users.get, {}))._id
		);
		await other.page.goto(`/accounts/${foreign.accountId}`);
		await expect(
			other.page.getByRole("heading", { exact: true, name: "E2E Wallet" })
		).toBeVisible();
		expect(await other.query(api.expenses.list, {})).toEqual([]);
		expect(
			(await other.query(api.accounts.list, {})).map((account) => account._id)
		).not.toContain(own.accountId);
		expect(
			(await user.query(api.accounts.list, {})).map((account) => account._id)
		).not.toContain(foreign.accountId);
		expect(
			(await other.query(api.cycles.list, {})).map((cycle) => cycle._id)
		).not.toContain(own.cycleId);
		expect(
			(await user.query(api.cycles.list, {})).map((cycle) => cycle._id)
		).not.toContain(foreign.cycleId);

		await expect(
			other.query(api.expenses.get, { expenseId: expense._id })
		).rejects.toThrow("NOT_FOUND");
		await expect(
			other.query(api.expenses.list, { accountId: own.accountId })
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			other.query(api.expenses.list, { cycleId: own.cycleId })
		).rejects.toThrow("NOT_FOUND");
		await expect(
			other.query(api.accounts.get, { accountId: own.accountId })
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			other.query(api.accounts.listTransactions, { accountId: own.accountId })
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			user.query(api.accounts.get, { accountId: foreign.accountId })
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			user.query(api.accounts.listTransactions, {
				accountId: foreign.accountId,
			})
		).rejects.toThrow("UNAUTHORIZED");
		expect(
			(await other.query(api.accounts.listTransactions, {})).every(
				(entry) =>
					entry.accountId !== own.accountId && entry.expenseId !== expense._id
			)
		).toBe(true);

		// Exercise full document URLs in B's real session as well as the live
		// API guards above. A spinner or hidden form alone is not a safe outcome:
		// wait for the app's generic error boundary and check for disclosure.
		for (const route of [
			`/expenses/${expense._id}`,
			`/accounts/${own.accountId}`,
		]) {
			await other.page.goto(route);
			await expect(
				other.page.getByRole("heading", {
					exact: true,
					name: "Something went wrong",
				})
			).toBeVisible();
			await expect(
				other.page.getByText(
					"We couldn't load this screen. Please try again.",
					{
						exact: true,
					}
				)
			).toBeVisible();
			await expect(other.page.locator("body")).not.toContainText(
				ownerAccountName
			);
			await expect(other.page.locator("body")).not.toContainText(
				"E2E owner-only lunch"
			);
			await expect(other.page.locator("body")).not.toContainText(user.email);
			await expect(other.page.locator("body")).not.toContainText("981.25");
			await expect(
				other.page.getByLabel("Note (optional)", { exact: true })
			).toBeHidden();
			await expect(
				other.page.getByLabel("Account name", { exact: true })
			).toBeHidden();
			await other.page.reload();
			await expect(
				other.page.getByRole("heading", {
					exact: true,
					name: "Something went wrong",
				})
			).toBeVisible();
			await expect(other.page.locator("body")).not.toContainText(
				ownerAccountName
			);
			await expect(other.page.locator("body")).not.toContainText(
				"E2E owner-only lunch"
			);
		}
		// Prove the error screen did not replace B's identity or poison normal navigation.
		await other.page.goto(`/accounts/${foreign.accountId}`);
		await expect(
			other.page.getByRole("heading", { exact: true, name: "E2E Wallet" })
		).toBeVisible();

		await expect(
			other.mutation(api.expenses.update, { amount: 999, id: expense._id })
		).rejects.toThrow("EXPENSE_NOT_FOUND");
		await expect(
			other.mutation(api.expenses.remove, { id: expense._id })
		).rejects.toThrow("EXPENSE_NOT_FOUND");

		// Rejected foreign reads and writes leave the owner's financial state intact.
		expect(
			await user.query(api.expenses.get, { expenseId: expense._id })
		).toMatchObject({ amount: 18.75, spentOn: "E2E owner-only lunch" });
		expect(
			(await user.query(api.accounts.get, { accountId: own.accountId }))
				.currentBalance
		).toBe(981.25);
		expect(
			(await other.query(api.accounts.get, { accountId: foreign.accountId }))
				.currentBalance
		).toBe(1000);
		await page.goto(`/expenses/${expense._id}`);
		await expect(
			page.getByLabel("Note (optional)", { exact: true })
		).toHaveValue("E2E owner-only lunch");
	} finally {
		try {
			await other?.dispose();
		} finally {
			await context.close();
		}
	}
});
