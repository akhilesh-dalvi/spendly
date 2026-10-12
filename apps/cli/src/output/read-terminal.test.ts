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
	it("explains missing context cycle, totals, and timezone", () => {
		const context = contextSchema.parse({
			...readFixture("context"),
			currentCycle: null,
			totals: [],
			timezone: null,
		});
		const output = renderContext(context);
		expect(output).toContain("Current cycle: none");
		expect(output).toContain("Account totals: none");
		expect(output).toContain("timezone unknown");
		expect(renderContext({ ...context, timezone: "UTC" })).toContain("(UTC;");
		expect(renderCycle(null)).toBe(
			"No cycle contains the requested local date."
		);
	});

	it("renders unassigned, uncategorized expenses without descriptions or tags", () => {
		const expense = {
			...expensePageSchema.parse(readFixture("expense-page")).items[0],
			spentOn: null,
			account: null,
			category: null,
			cycle: null,
			tags: [],
		};
		const output = renderExpense(expense);
		expect(output).toContain("Expense: No description");
		expect(output).toContain("Category: Uncategorized");
		expect(output).toContain("Account: Unassigned");
		expect(output).toContain("Cycle: none");
		expect(output).toContain("Tags: none");
		const table = renderExpenses([expense]);
		expect(table).toContain("Uncategorized");
		expect(table).toContain("Unassigned");
	});

	it("distinguishes hidden categories and unset plans", () => {
		const category = categorySchema
			.array()
			.parse(readFixture("resources").categories)[0];
		const output = renderCategories(
			[
				{
					...category,
					categoryType: null,
					plannedAmount: null,
					isHidden: true,
				},
			],
			"INR"
		);
		expect(output).toContain("Hidden");
		expect(output).toContain("-");
		expect(output).not.toContain("INR");
	});

	it("shows overspending and unplanned category activity", () => {
		const summary = summarySchema.parse(readFixture("resources").summary);
		const output = renderSummary(
			{
				...summary,
				remaining: -25,
				daysRemaining: null,
				categories: summary.categories.map((category) => ({
					...category,
					planned: null,
					difference: null,
				})),
			},
			"INR"
		);
		expect(output).toContain("Remaining: INR -25.00");
		expect(output).toContain("Status: Over planned spending");
		expect(output).toContain("Days remaining: not available");
		expect(output).toContain("-");
	});

	it("distinguishes archived liability accounts from active assets", () => {
		const account = accountSchema
			.array()
			.parse(readFixture("accounts").accounts)[0];
		const liability = {
			...account,
			accountType: {
				...account.accountType,
				balanceNature: "liability" as const,
			},
			isArchived: true,
			isDefault: false,
		};
		const output = renderAccount(liability);
		expect(output).toContain("(Liability)");
		expect(output).toContain("Status: Archived");
		expect(output).toContain("Default: No");
		expect(renderAccounts([liability])).toContain("Archived");
		const type = accountTypeSchema
			.array()
			.parse(readFixture("accounts").accountTypes)[0];
		const types = renderAccountTypes([
			{ ...type, balanceNature: "liability", isArchived: true },
		]);
		expect(types).toContain("Liability");
		expect(types).toContain("Archived");
	});

	it("uses a dash for ledger entries without notes", () => {
		const transaction = transactionPageSchema.parse(
			readFixture("accounts").transactions
		).items[0];
		const output = renderTransactions([{ ...transaction, note: null }], "INR");
		expect(output).toContain("-");
		expect(output).not.toContain("null");
	});
	it("normalizes the legacy Kolkata timezone alias for human output", () => {
		const context = contextSchema.parse({
			...readFixture("context"),
			timezone: "Asia/Calcutta",
		});

		expect(renderContext(context)).toContain("Asia/Kolkata");
		expect(renderContext(context)).not.toContain("Asia/Calcutta");
	});

	it.each([
		40, 80, 120,
	])("keeps every read renderer within %i columns", (columns) => {
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
	});
});
