// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { forEachSequential } from "./lib/async";
import schema from "./schema";
import { modules } from "./test.setup";

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "accounts-owner" });
	const stranger = test.withIdentity({ subject: "accounts-stranger" });
	const userId = await owner.mutation(api.users.create, {
		email: "owner@example.com",
	});
	await stranger.mutation(api.users.create, { email: "stranger@example.com" });
	const [accountType] = await owner.query(api.accountTypes.list, {});
	if (!accountType) {
		throw new Error("Expected account type");
	}
	return { accountType, owner, stranger, test, userId };
};

describe("web account queries and ledger", () => {
	it("sorts active accounts before archived ones and summarizes balances separately by currency", async () => {
		const { owner, accountType } = await setup();
		const zulu = await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "usd",
			name: "Zulu",
			startingBalance: 100,
		});
		const alpha = await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "USD",
			name: "Alpha",
			startingBalance: 50,
		});
		await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "eur",
			name: "Euro",
			startingBalance: 30,
		});
		const archived = await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			name: "Archived",
			startingBalance: 999,
		});
		await owner.mutation(api.accounts.archive, {
			accountId: archived._id,
			isArchived: true,
		});
		await owner.mutation(api.users.updateDefaultAccount, {
			accountId: zulu._id,
		});
		expect(
			(await owner.query(api.accounts.list, {})).map((account) => account.name)
		).toEqual(["Alpha", "Euro", "Zulu"]);
		expect(
			(await owner.query(api.accounts.list, { includeArchived: true })).map(
				(account) => account.name
			)
		).toEqual(["Alpha", "Euro", "Zulu", "Archived"]);
		expect(await owner.query(api.accounts.getSummary, {})).toMatchObject({
			accounts: [
				expect.objectContaining({ _id: alpha._id, isDefault: false }),
				expect.objectContaining({ name: "Euro" }),
				expect.objectContaining({ _id: zulu._id, isDefault: true }),
			],
			hasMoreAccounts: false,
			totals: [
				{ currency: "EUR", total: 30 },
				{ currency: "USD", total: 150 },
			],
		});
	});

	it("uses legacy account currencies and archive defaults without merging currencies", async () => {
		const { test, owner, userId, accountType } = await setup();
		await owner.mutation(api.users.updateCurrency, { currency: "EUR" });
		const legacyId = await test.run(
			async (ctx) =>
				await ctx.db.insert("accounts", {
					accountTypeId: accountType._id,
					createdAt: 0,
					currentBalance: 12,
					name: "Legacy",
					startingBalance: 12,
					userId,
				})
		);
		expect(await owner.query(api.accounts.getSummary, {})).toMatchObject({
			totals: [{ currency: "EUR", total: 12 }],
		});
		expect(
			await owner.query(api.accounts.list, { includeArchived: true })
		).toEqual([expect.objectContaining({ _id: legacyId, name: "Legacy" })]);
		await test.run(
			async (ctx) => await ctx.db.patch(userId, { currency: " " })
		);
		expect(await owner.query(api.accounts.getSummary, {})).toMatchObject({
			totals: [{ currency: "USD", total: 12 }],
		});
	});

	it("preserves balances and ledger entries through adjustments, transfers, and pagination", async () => {
		const { owner, accountType } = await setup();
		const from = await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			name: "From",
			startingBalance: 100,
		});
		const to = await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			name: "To",
			startingBalance: 20,
		});
		expect(
			await owner.mutation(api.accounts.updateBalance, {
				accountId: from._id,
				date: "2026-01-02",
				newBalance: 90,
				note: "Correction",
			})
		).toMatchObject({ currentBalance: 90 });
		expect(
			await owner.mutation(api.accounts.transfer, {
				amount: 15,
				date: "2026-01-03",
				fromAccountId: from._id,
				note: "Move",
				toAccountId: to._id,
			})
		).toMatchObject({
			fromAccount: { currentBalance: 75 },
			toAccount: { currentBalance: 35 },
			transfer: { amount: 15, source: "web" },
		});
		const transactions = await owner.query(api.accounts.listTransactions, {
			accountId: from._id,
			limit: 1000,
		});
		expect(transactions).toHaveLength(3);
		expect(transactions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					amount: 100,
					balanceAfter: 100,
					type: "opening_balance",
				}),
				expect.objectContaining({
					amount: -10,
					balanceAfter: 90,
					note: "Correction",
					source: "web",
					type: "manual_adjustment",
				}),
				expect.objectContaining({
					amount: -15,
					balanceAfter: 75,
					source: "web",
					type: "transfer_out",
				}),
			])
		);
		expect(await owner.query(api.accounts.listTransactions, {})).toHaveLength(
			5
		);
		expect(
			await owner.query(api.accounts.listTransactions, { limit: 1 })
		).toHaveLength(1);
		const page = await owner.query(api.accounts.listTransactionsPaginated, {
			accountId: from._id,
			paginationOpts: { cursor: null, numItems: 2 },
		});
		expect(page.page).toHaveLength(2);
		expect(page.isDone).toBe(false);
		const next = await owner.query(api.accounts.listTransactionsPaginated, {
			accountId: from._id,
			paginationOpts: { cursor: page.continueCursor, numItems: 2 },
		});
		expect(next.page).toHaveLength(1);
		expect(next.isDone).toBe(true);
		expect(
			[...page.page, ...next.page].map((transaction) => transaction._id)
		).toEqual(transactions.map((transaction) => transaction._id));
	});

	it("rejects invalid limits, foreign ledger reads, and cross-currency transfers without changing balances", async () => {
		const { owner, stranger, accountType } = await setup();
		const usd = await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "USD",
			name: "USD",
			startingBalance: 10,
		});
		const eur = await owner.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "EUR",
			name: "EUR",
			startingBalance: 20,
		});
		await forEachSequential([0, -1, 0.5], async (limit) => {
			await expect(
				owner.query(api.accounts.listTransactions, { limit })
			).rejects.toThrow("INVALID_LIMIT");
		});
		await expect(
			stranger.query(api.accounts.listTransactions, { accountId: usd._id })
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			stranger.query(api.accounts.listTransactionsPaginated, {
				accountId: usd._id,
				paginationOpts: { cursor: null, numItems: 1 },
			})
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			owner.mutation(api.accounts.transfer, {
				amount: 5,
				fromAccountId: usd._id,
				toAccountId: eur._id,
			})
		).rejects.toThrow("TRANSFER_CURRENCY_MISMATCH");
		expect(
			await owner.query(api.accounts.get, { accountId: usd._id })
		).toMatchObject({ currentBalance: 10 });
		expect(
			await owner.query(api.accounts.get, { accountId: eur._id })
		).toMatchObject({ currentBalance: 20 });
		expect(await owner.query(api.accounts.listTransactions, {})).toHaveLength(
			2
		);
		await expect(
			owner.mutation(api.accounts.createOnboardingAccount, {
				accountTypeId: accountType._id,
				name: "Too early",
				openingBalance: 0,
			})
		).rejects.toThrow("ONBOARDING_CYCLE_REQUIRED");
	});
});
