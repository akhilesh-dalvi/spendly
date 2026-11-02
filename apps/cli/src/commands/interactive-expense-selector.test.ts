import { readFileSync } from "node:fs";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { createBackendCommandContext } from "../client/convex-client.js";
import { PRODUCTION_CONFIG } from "../config.js";
import { expensePageSchema } from "../domain/read-schemas.js";
import type {
	InteractivePrompter,
	SelectPromptOptions,
	TextPromptOptions,
} from "../input/types.js";
import { createProcessRuntime } from "../runtime.js";
import { selectExpenseId } from "./interactive-support.js";

const page = expensePageSchema.parse(
	JSON.parse(
		readFileSync(
			new URL("../../test/fixtures/expense-page.json", import.meta.url),
			"utf8"
		)
	)
);

const createSelector = async (pages: unknown[], choices: string[]) => {
	const query = vi.fn(
		async (_name: string, _args: Readonly<Record<string, unknown>>) =>
			pages.shift()
	);
	const context = await createBackendCommandContext(new Command(), {
		...createProcessRuntime(PRODUCTION_CONFIG, {}),
		backendQuery: async <Result>(
			name: string,
			args: Readonly<Record<string, unknown>>
		): Promise<Result> => (await query(name, args)) as Result,
	});
	const select = vi.fn((_options: SelectPromptOptions): Promise<string> => {
		const choice = choices.shift();
		if (choice === undefined) {
			throw new Error("Unexpected extra selection prompt");
		}
		return Promise.resolve(choice);
	});
	const text = vi.fn(async (_options: TextPromptOptions) => "expense-manual");
	const prompter: InteractivePrompter = {
		confirm: async () => false,
		date: async () => "2026-09-02",
		multiselect: async () => [],
		select: async <Value extends string>(
			options: SelectPromptOptions<Value>
		): Promise<Value> => (await select(options)) as Value,
		text,
	};
	return { context, prompter, query, select, text };
};

describe("interactive expense selection", () => {
	it("loads another page with the cursor and shows fallback expense labels", async () => {
		const nextExpense = {
			...page.items[0],
			account: null,
			id: "expense-next",
			spentOn: null,
		};
		const selector = await createSelector(
			[page, { hasMore: false, items: [nextExpense], nextCursor: null }],
			["__spendly_load_more__", "expense-next"]
		);
		await expect(
			selectExpenseId({ ...selector, message: "Expense" })
		).resolves.toBe("expense-next");
		expect(selector.query.mock.calls).toEqual([
			["cli/v1/expenses:list", { cursor: undefined, limit: 50 }],
			["cli/v1/expenses:list", { cursor: "cursor-next", limit: 50 }],
		]);
		expect(selector.select.mock.calls[0]?.[0].options).toContainEqual({
			label: "Load more expenses",
			value: "__spendly_load_more__",
		});
		expect(selector.select.mock.calls[1]?.[0].options[0]).toEqual({
			hint: "INR 250.00 · Unassigned",
			label: "2026-09-02 · No description",
			value: "expense-next",
		});
	});

	it("allows manual IDs after an empty continuation page and validates nonempty input", async () => {
		const selector = await createSelector(
			[page, { hasMore: false, items: [], nextCursor: null }],
			["__spendly_load_more__", "__spendly_enter_id__"]
		);
		await expect(
			selectExpenseId({ ...selector, message: "Expense" })
		).resolves.toBe("expense-manual");
		const validation = selector.text.mock.calls[0]?.[0].validate;
		expect(validation?.(" \t")).toBe("Expense ID is required");
		expect(validation?.("expense-manual")).toBeUndefined();
		expect(selector.select.mock.calls[1]?.[0].options).toEqual([
			{ label: "Enter an expense ID", value: "__spendly_enter_id__" },
		]);
	});

	it("reports no expenses instead of displaying an empty initial selector", async () => {
		const selector = await createSelector(
			[{ hasMore: false, items: [], nextCursor: null }],
			[]
		);
		await expect(
			selectExpenseId({ ...selector, message: "Expense" })
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
		expect(selector.select).not.toHaveBeenCalled();
	});

	it("does not offer load-more without a usable continuation cursor", async () => {
		const selector = await createSelector(
			[{ ...page, nextCursor: null }],
			["expense-lunch"]
		);
		await expect(
			selectExpenseId({ ...selector, message: "Expense" })
		).resolves.toBe("expense-lunch");
		expect(
			selector.select.mock.calls[0]?.[0].options.map((option) => option.value)
		).toEqual(["expense-lunch", "__spendly_enter_id__"]);
		expect(selector.query).toHaveBeenCalledOnce();
	});
});
