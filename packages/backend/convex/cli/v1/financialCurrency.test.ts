// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

const DATE = "2026-09-01";
const { accounts, expenses } = api.cli.v1;

const setup = async () => {
	const test = convexTest(schema, modules);
	const client = test.withIdentity({ subject: "currency-guard-owner" });
	const userId = await client.mutation(api.users.create, {
		email: "currency-guard-owner@example.com",
	});
	const [accountType] = await client.query(api.accountTypes.list, {});
	if (!accountType) {
		throw new Error("Expected a seeded account type");
	}
	const newAccount = {
		accountTypeId: accountType._id,
		date: DATE,
		name: "New account",
		startingBalance: 100,
	};
	const createAccount = (name: string) =>
		client.mutation(accounts.create, {
			...newAccount,
			idempotencyKey: `create-${name}`,
			name,
		});
	return { client, createAccount, newAccount, test, userId };
};

const currencyConflict = {
	data: { code: "PREFERRED_CURRENCY_CONFLICT", retryable: false },
};

describe("CLI financial preview currency guard", () => {
	it("rejects stale account creation, balance adjustment, and transfer after a Web currency change", async () => {
		const { client, createAccount, newAccount } = await setup();
		const source = await createAccount("Source");
		const destination = await createAccount("Destination");
		const adjustment = {
			accountId: source.id,
			date: DATE,
			expectedRevision: source.revision,
			newBalance: 80,
		};
		const transfer = {
			amount: 10,
			date: DATE,
			expectedFromRevision: source.revision,
			expectedToRevision: destination.revision,
			fromAccountId: source.id,
			toAccountId: destination.id,
		};
		const createPreview = await client.mutation(
			accounts.previewCreate,
			newAccount
		);
		const adjustmentPreview = await client.mutation(
			accounts.previewBalanceAdjustment,
			adjustment
		);
		const transferPreview = await client.mutation(
			accounts.previewTransfer,
			transfer
		);
		expect(createPreview.preferredCurrency).toBe("USD");
		expect(adjustmentPreview.preferredCurrency).toBe("USD");
		expect(transferPreview.preferredCurrency).toBe("USD");
		const before = await client.query(accounts.list, {});

		await client.mutation(api.users.updateCurrency, { currency: "EUR" });
		expect(
			await client.mutation(accounts.previewTransfer, transfer)
		).toMatchObject({
			currency: "USD",
			preferredCurrency: "EUR",
		});
		await expect(
			client.mutation(accounts.create, {
				...newAccount,
				expectedPreferredCurrency: createPreview.preferredCurrency,
				idempotencyKey: "stale-create",
			})
		).rejects.toMatchObject(currencyConflict);
		await expect(
			client.mutation(accounts.adjustBalance, {
				...adjustment,
				expectedPreferredCurrency: adjustmentPreview.preferredCurrency,
				idempotencyKey: "stale-adjustment",
			})
		).rejects.toMatchObject(currencyConflict);
		await expect(
			client.mutation(accounts.transfer, {
				...transfer,
				expectedPreferredCurrency: transferPreview.preferredCurrency,
				idempotencyKey: "stale-transfer",
			})
		).rejects.toMatchObject(currencyConflict);

		expect(await client.query(accounts.list, {})).toEqual(before);
		expect(
			(await client.query(accounts.listTransactions, { accountId: source.id }))
				.items
		).toEqual([source.openingTransaction]);
		expect(
			(
				await client.query(accounts.listTransactions, {
					accountId: destination.id,
				})
			).items
		).toEqual([destination.openingTransaction]);
	});

	it("rejects stale expense saves and deletion without changing expenses, tags, or the ledger", async () => {
		const { client, createAccount } = await setup();
		const account = await createAccount("Wallet");
		const create = { accountId: account.id, amount: 10, date: DATE };
		const expense = await client.mutation(expenses.create, {
			...create,
			idempotencyKey: "initial-expense",
		});
		const createWithTags = { ...create, newTagNames: ["New expense tag"] };
		const update = {
			amount: 20,
			expectedRevision: expense.revision,
			expenseId: expense.id,
			newTagNames: ["Edited expense tag"],
		};
		const createPreview = await client.query(
			expenses.previewCreate,
			createWithTags
		);
		const updatePreview = await client.query(expenses.previewUpdate, update);
		const deletion = await client.mutation(expenses.previewDelete, {
			expenseId: expense.id,
		});
		expect(createPreview.preferredCurrency).toBe("USD");
		expect(updatePreview.preferredCurrency).toBe("USD");
		expect(deletion.preferredCurrency).toBe("USD");
		const ledgerArgs = { accountId: account.id };
		const ledgerBefore = await client.query(
			accounts.listTransactions,
			ledgerArgs
		);

		await client.mutation(api.users.updateCurrency, { currency: "EUR" });
		await expect(
			client.mutation(expenses.create, {
				...createWithTags,
				expectedPreferredCurrency: createPreview.preferredCurrency,
				idempotencyKey: "stale-expense-create",
			})
		).rejects.toMatchObject(currencyConflict);
		await expect(
			client.mutation(expenses.update, {
				...update,
				expectedPreferredCurrency: updatePreview.preferredCurrency,
				idempotencyKey: "stale-expense-update",
			})
		).rejects.toMatchObject(currencyConflict);
		const remove = {
			confirmationToken: deletion.confirmationToken,
			expectedPreferredCurrency: deletion.preferredCurrency,
			expectedRevision: deletion.revision,
			expenseId: expense.id,
			idempotencyKey: "stale-expense-delete",
		};
		await expect(
			client.mutation(expenses.remove, remove)
		).rejects.toMatchObject(currencyConflict);

		expect((await client.query(expenses.list, {})).items).toEqual([
			deletion.expense,
		]);
		expect(await client.query(api.tags.list, {})).toEqual([]);
		expect(await client.query(accounts.get, ledgerArgs)).toMatchObject({
			currentBalance: 90,
		});
		expect(await client.query(accounts.listTransactions, ledgerArgs)).toEqual(
			ledgerBefore
		);
		await client.mutation(api.users.updateCurrency, { currency: "USD" });
		expect(await client.mutation(expenses.remove, remove)).toMatchObject({
			deleted: true,
		});
	});

	it("rejects a reviewed inherited account after explicit USD is set", async () => {
		const { client, newAccount, test, userId } = await setup();
		await test.run(async ({ db }) => db.patch(userId, { currency: undefined }));
		const inherited = await client.mutation(accounts.previewCreate, newAccount);
		expect(inherited).toMatchObject({
			currency: "USD",
			currencyMode: "inherited",
		});
		await client.mutation(api.users.updateCurrency, { currency: "USD" });
		const fixed = await client.mutation(accounts.previewCreate, newAccount);
		expect(fixed).toMatchObject({ currency: "USD", currencyMode: "fixed" });
		await expect(
			client.mutation(accounts.create, {
				...newAccount,
				expectedCurrencyMode: inherited.currencyMode,
				expectedPreferredCurrency: inherited.preferredCurrency,
				idempotencyKey: "stale-currency-mode",
			})
		).rejects.toMatchObject(currencyConflict);
		expect(await client.query(accounts.list, {})).toEqual([]);
	});

	it("accepts the same effective preference and replays guarded and unguarded commits", async () => {
		const { client, newAccount, test, userId } = await setup();
		await test.run(
			async (ctx) => await ctx.db.patch(userId, { currency: undefined })
		);
		const preview = await client.mutation(accounts.previewCreate, newAccount);
		expect(preview.preferredCurrency).toBe("USD");
		await test.run(
			async (ctx) => await ctx.db.patch(userId, { currency: " " })
		);
		expect(
			(await client.mutation(accounts.previewCreate, newAccount))
				.preferredCurrency
		).toBe("USD");
		await test.run(
			async (ctx) => await ctx.db.patch(userId, { currency: " usd " })
		);
		const guarded = {
			...newAccount,
			expectedPreferredCurrency: preview.preferredCurrency,
			idempotencyKey: "guarded-currency-create",
		};
		const unguarded = {
			...newAccount,
			idempotencyKey: "unguarded-currency-create",
			name: "Legacy client account",
		};
		const saved = await client.mutation(accounts.create, guarded);
		const legacy = await client.mutation(accounts.create, unguarded);
		expect(saved.currency).toBe("USD");

		await client.mutation(api.users.updateCurrency, { currency: "EUR" });
		expect(await client.mutation(accounts.create, guarded)).toEqual(saved);
		expect(await client.mutation(accounts.create, unguarded)).toEqual(legacy);
		await expect(
			client.mutation(accounts.create, {
				...guarded,
				expectedPreferredCurrency: "EUR",
			})
		).rejects.toMatchObject({ data: { code: "IDEMPOTENCY_CONFLICT" } });
		expect(await client.query(accounts.list, {})).toHaveLength(2);
	});
});
