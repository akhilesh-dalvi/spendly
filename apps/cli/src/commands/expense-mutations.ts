import { type Command, Option } from "commander";
import type { CliRuntime } from "../runtime.js";

const collectOption = (value: string, previous: string[]): string[] => [
	...previous,
	value,
];

export const registerExpenseMutationCommands = (
	expenses: Command,
	runtime: CliRuntime
): void => {
	expenses
		.command("add")
		.description("Add an expense or preview the normalized result")
		.option("--amount <amount>", "positive decimal amount")
		.option("--date <date>", "local date in YYYY-MM-DD")
		.option("--spent-on <text>", "expense description")
		.option("--category-id <id>", "stable category ID")
		.addOption(
			new Option("--category <name>", "exact category name").conflicts(
				"categoryId"
			)
		)
		.addOption(
			new Option("--account-id <id>", "stable account ID").conflicts([
				"account",
				"withoutAccount",
			])
		)
		.addOption(
			new Option("--account <name>", "exact account name").conflicts([
				"accountId",
				"withoutAccount",
			])
		)
		.addOption(
			new Option(
				"--no-account, --without-account",
				"leave the expense unassigned"
			).conflicts(["account", "accountId"])
		)
		.option("--tag-id <id>", "stable tag ID; repeatable", collectOption, [])
		.option("--tag <name>", "exact tag name; repeatable", collectOption, [])
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without writing")
		.action(async (options, command: Command) => {
			const { runExpenseAdd } = await import("./expense-mutation-actions.js");
			await runExpenseAdd(options, command, runtime);
		});

	expenses
		.command("edit")
		.description("Edit an expense or preview the before/after result")
		.argument("[expense-id]", "stable expense ID")
		.option("--amount <amount>", "positive decimal amount")
		.option("--date <date>", "local date in YYYY-MM-DD")
		.addOption(
			new Option("--spent-on <text>", "new expense description").conflicts(
				"clearSpentOn"
			)
		)
		.option("--clear-spent-on", "remove the expense description")
		.addOption(
			new Option("--category-id <id>", "stable category ID").conflicts([
				"category",
				"clearCategory",
			])
		)
		.addOption(
			new Option("--category <name>", "exact category name").conflicts([
				"categoryId",
				"clearCategory",
			])
		)
		.option("--clear-category", "move the expense to Uncategorized")
		.addOption(
			new Option("--account-id <id>", "stable account ID").conflicts([
				"account",
				"clearAccount",
			])
		)
		.addOption(
			new Option("--account <name>", "exact account name").conflicts([
				"accountId",
				"clearAccount",
			])
		)
		.option("--clear-account", "leave the expense unassigned")
		.addOption(
			new Option("--tag-id <id>", "replacement tag ID; repeatable")
				.argParser(collectOption)
				.default([])
				.conflicts("clearTags")
		)
		.addOption(
			new Option("--tag <name>", "replacement exact tag name; repeatable")
				.argParser(collectOption)
				.default([])
				.conflicts("clearTags")
		)
		.option("--clear-tags", "remove all tags")
		.option("--if-revision <revision>", "expected current expense revision")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without writing")
		.action(
			async (expenseId: string | undefined, options, command: Command) => {
				const { runExpenseEdit } = await import(
					"./expense-mutation-actions.js"
				);
				await runExpenseEdit(expenseId, options, command, runtime);
			}
		);

	expenses
		.command("delete")
		.description("Permanently delete an expense using a confirmation preview")
		.argument("[expense-id]", "stable expense ID")
		.option("--confirmation-token <token>", "token returned by --dry-run")
		.option("--if-revision <revision>", "expected current expense revision")
		.option("--idempotency-key <key>", "stable key for this intended deletion")
		.option("--dry-run", "return the deletion confirmation without deleting")
		.action(
			async (expenseId: string | undefined, options, command: Command) => {
				const { runExpenseDelete } = await import(
					"./expense-mutation-actions.js"
				);
				await runExpenseDelete(expenseId, options, command, runtime);
			}
		);
};
