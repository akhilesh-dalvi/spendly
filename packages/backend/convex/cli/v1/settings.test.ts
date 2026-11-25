import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

const { settings } = api.cli.v1;
const error = (code: string) => ({ data: { code, retryable: false } });

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "currency-owner" });
	const other = test.withIdentity({ subject: "currency-other" });
	const ownerId = await owner.mutation(api.users.create, {
		email: "owner@example.com",
	});
	await other.mutation(api.users.create, { email: "other@example.com" });
	return { other, owner, ownerId, test };
};

const euro = { currency: "EUR" } as const;

const reviewEuro = async (
	owner: Awaited<ReturnType<typeof setup>>["owner"]
) => {
	const preview = await owner.query(settings.previewCurrency, euro);
	return {
		...euro,
		expectedEditSnapshot: preview.editSnapshot,
		idempotencyKey: "reviewed-currency-key",
	};
};

describe("CLI preferred currency", () => {
	it("previews read-only, persists only currency, and treats the stored match as a no-op", async () => {
		const { owner, other } = await setup();
		const before = await owner.query(api.users.get, {});
		const preview = await owner.query(settings.previewCurrency, euro);
		expect(preview).toMatchObject({
			beforeCurrency: "USD",
			beforeStatus: "set",
			changed: true,
			currency: "EUR",
		});
		expect(await owner.query(api.users.get, {})).toEqual(before);
		const args = await reviewEuro(owner);
		expect(await owner.mutation(settings.setCurrency, args)).toEqual({
			changed: true,
			currency: "EUR",
		});
		expect(await owner.query(api.users.get, {})).toEqual({
			...before,
			currency: "EUR",
		});
		expect(await other.query(api.users.get, {})).toMatchObject({
			currency: "USD",
		});
		const noop = await owner.query(settings.previewCurrency, euro);
		expect(noop).toMatchObject({ beforeCurrency: "EUR", changed: false });
		expect(
			await owner.mutation(settings.setCurrency, {
				...args,
				expectedEditSnapshot: noop.editSnapshot,
				idempotencyKey: "currency-no-change",
			})
		).toEqual({ changed: false, currency: "EUR" });
	});

	it("relabels inherited values without rewriting expenses, plans, accounts, or the ledger", async () => {
		const { owner } = await setup();
		await owner.mutation(api.users.beginOnboarding, {
			currency: "USD",
			path: "free",
		});
		const cycleId = await owner.mutation(api.cycles.saveOnboardingCycle, {
			endDate: "2026-10-01",
			name: "Review cycle",
			startDate: "2026-09-01",
		});
		const [type] = await owner.query(api.accountTypes.list, {});
		if (!type) {
			throw new Error("Expected a seeded account type");
		}
		const accountId = await owner.mutation(
			api.accounts.createOnboardingAccount,
			{
				accountTypeId: type._id,
				name: "Inheriting account",
				openingBalance: 100,
			}
		);
		const explicit = await owner.mutation(api.accounts.create, {
			accountTypeId: type._id,
			name: "Fixed currency account",
			startingBalance: 50,
		});
		const category = await owner.mutation(api.categories.create, {
			cycleId,
			name: "Budget",
			plannedAmount: 30,
		});
		if (!category) {
			throw new Error("Expected a category");
		}
		const expense = await owner.mutation(api.expenses.create, {
			accountId,
			amount: 12,
			categoryId: category._id,
			date: "2026-09-03",
		});
		const financialState = async () =>
			await Promise.all([
				owner.query(api.accounts.list, {}),
				owner.query(api.accounts.listTransactions, {}),
				owner.query(api.expenses.get, { expenseId: expense._id }),
				owner.query(api.cli.v1.resources.getSummary, {
					cycleId,
					today: "2026-09-03",
				}),
			]);
		const before = await financialState();
		await owner.mutation(settings.setCurrency, await reviewEuro(owner));
		expect(await financialState()).toEqual(before);
		expect(
			await owner.query(api.cli.v1.accounts.get, { accountId })
		).toMatchObject({ currency: "EUR", currentBalance: 88 });
		expect(
			await owner.query(api.cli.v1.accounts.get, { accountId: explicit._id })
		).toMatchObject({ currency: "USD", currentBalance: 50 });
		expect(
			await owner.query(api.cli.v1.expenses.get, { expenseId: expense._id })
		).toMatchObject({ amount: 12, currency: "EUR" });
	});

	it("rejects unauthenticated, uninitialized, cross-user, stale, and retargeted requests", async () => {
		const { test, owner, other } = await setup();
		const args = await reviewEuro(owner);
		const uninitialized = test.withIdentity({ subject: "uninitialized" });
		await expect(
			test.query(settings.previewCurrency, euro)
		).rejects.toMatchObject(error("AUTHENTICATION_REQUIRED"));
		await expect(
			test.mutation(settings.setCurrency, args)
		).rejects.toMatchObject(error("AUTHENTICATION_REQUIRED"));
		await expect(
			uninitialized.mutation(settings.setCurrency, args)
		).rejects.toMatchObject(error("ACCOUNT_SETUP_REQUIRED"));
		await expect(
			other.mutation(settings.setCurrency, args)
		).rejects.toMatchObject(error("PREFERRED_CURRENCY_CONFLICT"));
		await expect(
			owner.mutation(settings.setCurrency, { ...args, currency: "CAD" })
		).rejects.toMatchObject(error("PREFERRED_CURRENCY_CONFLICT"));
		await owner.mutation(api.users.updateCurrency, { currency: "GBP" });
		await expect(
			owner.mutation(settings.setCurrency, args)
		).rejects.toMatchObject(error("PREFERRED_CURRENCY_CONFLICT"));
		const usd = await owner.query(settings.previewCurrency, {
			currency: "USD",
		});
		await owner.mutation(settings.setCurrency, {
			...args,
			currency: "USD",
			expectedEditSnapshot: usd.editSnapshot,
		});
		await expect(
			owner.mutation(settings.setCurrency, {
				...args,
				idempotencyKey: "stale-currency-key",
			})
		).resolves.toMatchObject({ changed: true, currency: "EUR" });
	});

	it("replays a saved receipt without reverting a later Web edit and rejects a reused key with different inputs", async () => {
		const { owner } = await setup();
		const args = await reviewEuro(owner);
		const saved = await owner.mutation(settings.setCurrency, args);
		await owner.mutation(api.users.updateCurrency, { currency: "JPY" });
		expect(await owner.mutation(settings.setCurrency, args)).toEqual(saved);
		await expect(
			owner.mutation(settings.setCurrency, { ...args, agent: true })
		).rejects.toMatchObject(error("IDEMPOTENCY_CONFLICT"));
		expect(await owner.query(api.users.get, {})).toMatchObject({
			currency: "JPY",
		});
	});

	it("does not expose unsupported saved values and can repair them or set an unset default explicitly", async () => {
		const { owner, ownerId, test } = await setup();
		await test.run(async ({ db }) =>
			db.patch(ownerId, { currency: "invalid\nlegacy" })
		);
		const legacy = await owner.query(settings.previewCurrency, euro);
		expect(legacy).toMatchObject({
			beforeCurrency: null,
			beforeStatus: "unsupported",
			changed: true,
		});
		await test.run(async ({ db }) =>
			db.patch(ownerId, { currency: undefined })
		);
		const usd = await owner.query(settings.previewCurrency, {
			currency: "USD",
		});
		expect(usd).toMatchObject({
			beforeCurrency: null,
			beforeStatus: "unset",
			changed: true,
		});
		await expect(
			owner.mutation(settings.setCurrency, {
				...euro,
				expectedEditSnapshot: legacy.editSnapshot,
				idempotencyKey: "legacy-currency-key",
			})
		).rejects.toMatchObject(error("PREFERRED_CURRENCY_CONFLICT"));
		expect(
			await owner.mutation(settings.setCurrency, {
				currency: "USD",
				expectedEditSnapshot: usd.editSnapshot,
				idempotencyKey: "explicit-usd-key",
			})
		).toEqual({ changed: true, currency: "USD" });
	});
});
