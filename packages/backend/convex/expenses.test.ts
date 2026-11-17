import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

// Exercise the public wire contract independently of its generated argument type.
const clearCategory = makeFunctionReference<
	"mutation",
	{ id: Id<"expenses">; categoryId: null; date?: string }
>("expenses:update");

const clearNote = makeFunctionReference<
	"mutation",
	{ id: Id<"expenses">; spentOn: null }
>("expenses:update");

const fixture = async () => {
	const test = convexTest(schema, modules);
	const client = test.withIdentity({ subject: "expense-category-regression" });
	await client.mutation(api.users.create, {
		email: "expense-category-regression@example.com",
		name: "Expense category regression",
	});
	const cycle = await client.mutation(api.cycles.create, {
		endDate: "2026-02-01",
		name: "Before boundary",
		startDate: "2026-01-01",
	});
	if (!cycle) {
		throw new Error("Expected expense cycle fixture");
	}
	const category = await client.mutation(api.categories.create, {
		cycleId: cycle._id,
		name: "Groceries",
	});
	if (!category) {
		throw new Error("Expected expense category fixture");
	}
	const expense = await client.mutation(api.expenses.create, {
		accountId: null,
		amount: 25,
		categoryId: category._id,
		date: "2026-01-15",
	});
	return { category, client, expense, test };
};

it("preserves an omitted category and clears an explicitly null category through the Web API", async () => {
	const { client, category, expense } = await fixture();
	await client.mutation(api.expenses.update, { amount: 30, id: expense._id });
	expect(
		await client.query(api.expenses.get, { expenseId: expense._id })
	).toMatchObject({ amount: 30, categoryId: category._id, revision: 2 });
	await client.mutation(clearCategory, { categoryId: null, id: expense._id });
	const cleared = await client.query(api.expenses.get, {
		expenseId: expense._id,
	});
	expect(cleared.categoryId).toBeUndefined();
	expect(cleared).toMatchObject({
		amount: 30,
		categoryName: null,
		revision: 3,
	});
	expect(await client.query(api.accounts.listTransactions, {})).toEqual([]);
});

it.each([false, true])(
	"clears a note without changing amounts, assignments, balances, or ledger history (withoutCycle=%s)",
	async (withoutCycle) => {
		const { client, expense, test } = await fixture();
		if (withoutCycle) {
			await client.mutation(api.expenses.update, {
				categoryId: null,
				date: "2026-03-15",
				id: expense._id,
			});
		}
		const accountType = await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Note regression cash",
		});
		const account = await client.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			name: "Wallet",
			startingBalance: 100,
		});
		const tagId = await client.mutation(api.tags.create, { name: "Work" });
		await client.mutation(api.expenses.update, {
			accountId: account._id,
			id: expense._id,
			spentOn: "Lunch",
			tagIds: [tagId],
		});
		const before = await client.query(api.expenses.get, {
			expenseId: expense._id,
		});
		const balance = await client.query(api.accounts.get, {
			accountId: account._id,
		});
		const ledger = await client.query(api.accounts.listTransactions, {});

		await client.mutation(api.expenses.update, { id: expense._id });
		expect(await test.run((ctx) => ctx.db.get(expense._id))).toMatchObject({
			normalizedSpentOn: "lunch",
			spentOn: "Lunch",
		});
		// Match the complete payload sent by the Web editor, not just a note patch.
		await client.mutation(api.expenses.update, {
			accountId: before.accountId ?? null,
			amount: before.amount,
			categoryId: before.categoryId ?? null,
			date: before.date,
			id: expense._id,
			spentOn: null,
			tagIds: before.tagIds ?? [],
		});
		const cleared = await client.query(api.expenses.get, {
			expenseId: expense._id,
		});
		expect(cleared.spentOn).toBeUndefined();
		expect(await test.run((ctx) => ctx.db.get(expense._id))).not.toHaveProperty(
			"normalizedSpentOn"
		);
		expect(cleared).toMatchObject({
			accountId: before.accountId,
			amount: before.amount,
			date: before.date,
			revision: (before.revision ?? 1) + 2,
			tagIds: before.tagIds,
		});
		expect(cleared.categoryId).toBe(before.categoryId);
		expect(cleared.cycleId).toBe(before.cycleId);
		expect(
			await client.query(api.accounts.get, { accountId: account._id })
		).toEqual(balance);
		expect(await client.query(api.accounts.listTransactions, {})).toEqual(
			ledger
		);
		expect(await test.run((ctx) => ctx.db.get(expense._id))).not.toHaveProperty(
			"spentOn"
		);
		await client.mutation(clearNote, { id: expense._id, spentOn: null });
		expect(await client.query(api.accounts.listTransactions, {})).toEqual(
			ledger
		);
	}
);

it("preserves an omitted legacy note exactly and normalizes replacement text", async () => {
	const { client, expense, test } = await fixture();
	await test.run((ctx) =>
		ctx.db.patch(expense._id, { spentOn: " Legacy note " })
	);
	await client.mutation(api.expenses.update, { id: expense._id });
	expect(
		(await client.query(api.expenses.get, { expenseId: expense._id })).spentOn
	).toBe(" Legacy note ");
	await client.mutation(api.expenses.update, {
		id: expense._id,
		spentOn: " New note ",
	});
	expect(await test.run((ctx) => ctx.db.get(expense._id))).toMatchObject({
		normalizedSpentOn: "new note",
		spentOn: "New note",
	});
});

it.each([false, true])(
	"requires authentication and ownership to clear a note (withoutCycle=%s)",
	async (withoutCycle) => {
		const { client, expense, test } = await fixture();
		if (withoutCycle) {
			await client.mutation(api.expenses.update, {
				categoryId: null,
				date: "2026-03-15",
				id: expense._id,
			});
		}
		await client.mutation(api.expenses.update, {
			id: expense._id,
			spentOn: "Saved note",
		});
		const before = await client.query(api.expenses.get, {
			expenseId: expense._id,
		});
		await expect(
			test.mutation(clearNote, { id: expense._id, spentOn: null })
		).rejects.toThrow("UNAUTHENTICATED");
		const other = test.withIdentity({ subject: "other-note-owner" });
		await other.mutation(api.users.create, {
			email: "other-note-owner@example.com",
		});
		await expect(
			other.mutation(clearNote, { id: expense._id, spentOn: null })
		).rejects.toThrow("EXPENSE_NOT_FOUND");
		expect(
			await client.query(api.expenses.get, { expenseId: expense._id })
		).toEqual(before);
	}
);

it.each(["", " \t "])(
	"rejects ambiguous blank API notes (%j) without changing saved data",
	async (spentOn) => {
		const { client, expense, test } = await fixture();
		await client.mutation(api.expenses.update, {
			id: expense._id,
			spentOn: "Saved note",
		});
		const before = await test.run((ctx) => ctx.db.get(expense._id));
		await expect(
			client.mutation(api.expenses.update, { id: expense._id, spentOn })
		).rejects.toThrow("EMPTY_TEXT_REQUIRES_EXPLICIT_CLEAR");
		expect(await test.run((ctx) => ctx.db.get(expense._id))).toEqual(before);
	}
);

it("requires explicit category removal when moving outside all cycles and can later return uncategorized", async () => {
	const { client, expense } = await fixture();
	const accountType = await client.mutation(api.accountTypes.create, {
		balanceNature: "asset",
		name: "Cycle edit regression cash",
	});
	const account = await client.mutation(api.accounts.create, {
		accountTypeId: accountType._id,
		name: "Cycle edit wallet",
		startingBalance: 100,
	});
	const tagId = await client.mutation(api.tags.create, {
		name: "Cycle edit work",
	});
	await client.mutation(api.expenses.update, {
		accountId: account._id,
		id: expense._id,
		spentOn: "Saved note",
		tagIds: [tagId],
	});
	const balance = await client.query(api.accounts.get, {
		accountId: account._id,
	});
	const ledger = await client.query(api.accounts.listTransactions, {});
	const before = await client.query(api.expenses.get, {
		expenseId: expense._id,
	});
	await expect(
		client.mutation(api.expenses.update, {
			date: "2026-02-01",
			id: expense._id,
		})
	).rejects.toThrow("CATEGORY_CYCLE_MISMATCH");
	expect(
		await client.query(api.expenses.get, { expenseId: expense._id })
	).toEqual(before);
	await client.mutation(api.expenses.update, {
		categoryId: null,
		date: "2026-02-01",
		id: expense._id,
	});
	const outside = await client.query(api.expenses.get, {
		expenseId: expense._id,
	});
	expect(outside).toMatchObject({ amount: 25, date: "2026-02-01" });
	expect(outside.categoryId).toBeUndefined();
	expect(outside.cycleId).toBeUndefined();
	await client.mutation(api.expenses.update, {
		date: before.date,
		id: expense._id,
	});
	const restored = await client.query(api.expenses.get, {
		expenseId: expense._id,
	});
	expect(restored.cycleId).toBe(before.cycleId);
	expect(restored.categoryId).toBeUndefined();
	expect(restored).toMatchObject({
		accountId: account._id,
		amount: before.amount,
		spentOn: before.spentOn,
		tagIds: [tagId],
	});
	expect(
		await client.query(api.accounts.get, { accountId: account._id })
	).toEqual(balance);
	expect(await client.query(api.accounts.listTransactions, {})).toEqual(ledger);
});

it("moves an expense across an exclusive cycle boundary while clearing its old category", async () => {
	const { client, expense } = await fixture();
	const next = await client.mutation(api.cycles.create, {
		endDate: "2026-03-01",
		name: "After boundary",
		startDate: "2026-02-01",
	});
	if (!next) {
		throw new Error("Expected next cycle fixture");
	}
	await client.mutation(clearCategory, {
		categoryId: null,
		date: "2026-02-01",
		id: expense._id,
	});
	const moved = await client.query(api.expenses.get, {
		expenseId: expense._id,
	});
	expect(moved).toMatchObject({
		amount: 25,
		cycleId: next._id,
		date: "2026-02-01",
		revision: 2,
	});
	expect(moved.categoryId).toBeUndefined();
	expect(await client.query(api.accounts.listTransactions, {})).toEqual([]);
});
