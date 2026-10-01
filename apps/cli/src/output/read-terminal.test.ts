import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	accountSchema,
	accountTypeSchema,
	categorySchema,
	contextSchema,
	cycleSchema,
	expensePageSchema,
	summarySchema,
	tagSchema,
	transactionPageSchema,
} from "../domain/read-schemas.js";
import {
	renderAccount,
	renderAccounts,
	renderAccountTypes,
	renderCategories,
	renderContext,
	renderCycle,
	renderCycles,
	renderExpense,
	renderExpenses,
	renderSummary,
	renderTags,
	renderTransactions,
} from "./read-terminal.js";

const readFixture = (name: string): Record<string, unknown> =>
	JSON.parse(
		readFileSync(
			new URL(`../../test/fixtures/${name}.json`, import.meta.url),
			"utf8"
		)
	) as Record<string, unknown>;

describe("human read output widths", () => {
	it("normalizes the legacy Kolkata timezone alias for human output", () => {
		const context = contextSchema.parse({
			...readFixture("context"),
			timezone: "Asia/Calcutta",
		});

		expect(renderContext(context)).toContain("Asia/Kolkata");
		expect(renderContext(context)).not.toContain("Asia/Calcutta");
	});

	it.each([40, 80, 120])(
		"keeps every read renderer within %i columns",
		(columns) => {
			const accountFixture = readFixture("accounts");
			const expensePage = expensePageSchema.parse(readFixture("expense-page"));
			const resources = readFixture("resources");
			const accounts = accountSchema.array().parse(accountFixture.accounts);
			const accountTypes = accountTypeSchema
				.array()
				.parse(accountFixture.accountTypes);
			const transactions = transactionPageSchema.parse(
				accountFixture.transactions
			).items;
			const cycles = cycleSchema.array().parse(resources.cycles);
			const categories = categorySchema.array().parse(resources.categories);
			const tags = tagSchema.array().parse(resources.tags);
			const summary = summarySchema.parse(resources.summary);
			const options = { columns };
			const outputs = [
				renderContext(contextSchema.parse(readFixture("context")), options),
				renderExpense(expensePage.items[0], options),
				renderExpenses(expensePage.items, options),
				renderCycle(cycles[0], options),
				renderCycles(cycles, options),
				renderCategories(categories, "INR", options),
				renderTags(tags, options),
				renderSummary(summary, "INR", options),
				renderAccount(accounts[0], options),
				renderAccounts(accounts, options),
				renderTransactions(transactions, "INR", options),
				renderAccountTypes(accountTypes, options),
			];

			for (const output of outputs) {
				for (const line of output.split("\n")) {
					expect(line.length, line).toBeLessThanOrEqual(columns);
				}
			}
		}
	);
});
