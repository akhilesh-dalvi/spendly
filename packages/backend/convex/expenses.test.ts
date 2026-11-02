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
	return { category, client, expense };
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
