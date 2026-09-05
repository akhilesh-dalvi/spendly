import { type Command, Option } from "commander";
import type { CliRuntime } from "../runtime.js";
import { registerAccountMutationCommands } from "./account-mutations.js";
import { registerExpenseMutationCommands } from "./expense-mutations.js";

const collectOption = (value: string, previous: string[]): string[] => [
	...previous,
	value,
];

export const registerReadCommands = (
	program: Command,
	runtime: CliRuntime
): void => {
	program
		.command("context")
		.description("Show the current Spendly context")
		.option("--date <date>", "resolve context for YYYY-MM-DD")
		.action(async (options: { date?: string }, command: Command) => {
			const { runContext } = await import("./read-actions.js");
			await runContext(options, command, runtime);
		});

	const expenses = program
		.command("expenses")
		.description("Read Spendly expenses");
	expenses
		.command("get")
		.description("Get an expense by ID")
		.argument("<expense-id>", "stable expense ID")
		.action(async (expenseId: string, _options, command: Command) => {
			const { runExpenseGet } = await import("./read-actions.js");
			await runExpenseGet(expenseId, command, runtime);
		});
	expenses
		.command("list")
		.description("List expenses using cursor pagination")
		.option("--cycle-id <id>", "filter by cycle ID")
		.addOption(
			new Option("--cycle <name>", "filter by exact cycle name").conflicts(
				"cycleId"
			)
		)
		.option("--category-id <id>", "filter by category ID")
		.addOption(
			new Option(
				"--category <name>",
				"filter by exact category name"
			).conflicts(["categoryId", "uncategorized"])
		)
		.addOption(
			new Option(
				"--uncategorized",
				"show only uncategorized expenses"
			).conflicts(["category", "categoryId"])
		)
		.option("--account-id <id>", "filter by account ID")
		.addOption(
			new Option("--account <name>", "filter by exact account name").conflicts([
				"accountId",
				"unassigned",
			])
		)
		.addOption(
			new Option("--unassigned", "show only unassigned expenses").conflicts([
				"account",
				"accountId",
			])
		)
		.option("--tag-id <id>", "require a tag ID; repeatable", collectOption, [])
		.option(
			"--tag <name>",
			"require an exact tag name; repeatable",
			collectOption,
			[]
		)
		.option("--from <date>", "inclusive start date YYYY-MM-DD")
		.option("--to <date>", "inclusive end date YYYY-MM-DD")
		.option("--limit <number>", "page size from 1 to 100")
		.option("--cursor <cursor>", "opaque cursor from a previous response")
		.action(async (options, command: Command) => {
			const { runExpenseList } = await import("./read-actions.js");
			await runExpenseList(options, command, runtime);
		});
	registerExpenseMutationCommands(expenses, runtime);

	const cycles = program.command("cycles").description("Read expense cycles");
	cycles
		.command("list")
		.description("List expense cycles")
		.action(async (_options, command: Command) => {
			const { runCycleList } = await import("./read-actions.js");
			await runCycleList(command, runtime);
		});
	cycles
		.command("current")
		.description("Show the cycle containing a local date")
		.option("--date <date>", "date in YYYY-MM-DD")
		.action(async (options: { date?: string }, command: Command) => {
			const { runCycleCurrent } = await import("./read-actions.js");
			await runCycleCurrent(options, command, runtime);
		});

	program
		.command("categories")
		.description("Read expense categories")
		.command("list")
		.description("List categories in one cycle")
		.option("--cycle-id <id>", "stable cycle ID")
		.addOption(
			new Option("--cycle <name>", "exact cycle name").conflicts("cycleId")
		)
		.action(async (options, command: Command) => {
			const { runCategoryList } = await import("./read-actions.js");
			await runCategoryList(options, command, runtime);
		});

	program
		.command("tags")
		.description("Read expense tags")
		.command("list")
		.description("List tags")
		.action(async (_options, command: Command) => {
			const { runTagList } = await import("./read-actions.js");
			await runTagList(command, runtime);
		});

	program
		.command("summary")
		.description("Show an expense-cycle summary")
		.option("--date <date>", "local date for cycle lookup and days remaining")
		.option("--cycle-id <id>", "stable cycle ID")
		.addOption(
			new Option("--cycle <name>", "exact cycle name").conflicts([
				"current",
				"cycleId",
			])
		)
		.addOption(
			new Option(
				"--current",
				"use the cycle containing today's local date"
			).conflicts(["cycle", "cycleId"])
		)
		.action(async (options, command: Command) => {
			const { runSummary } = await import("./read-actions.js");
			await runSummary(options, command, runtime);
		});

	const accounts = program
		.command("accounts")
		.description("Read and manage Spendly accounts");
	accounts
		.command("list")
		.description("List accounts")
		.option("--include-archived", "include archived accounts")
		.action(
			async (options: { includeArchived?: boolean }, command: Command) => {
				const { runAccountList } = await import("./read-actions.js");
				await runAccountList(options, command, runtime);
			}
		);
	accounts
		.command("get")
		.description("Get an account by ID or exact name")
		.argument("<account>", "stable account ID or exact human name")
		.action(async (account: string, _options, command: Command) => {
			const { runAccountGet } = await import("./read-actions.js");
			await runAccountGet(account, command, runtime);
		});
	accounts
		.command("transactions")
		.description("List an account's ledger transactions")
		.argument("<account>", "stable account ID or exact human name")
		.option("--limit <number>", "page size from 1 to 100")
		.option("--cursor <cursor>", "opaque cursor from a previous response")
		.action(async (account: string, options, command: Command) => {
			const { runAccountTransactions } = await import("./read-actions.js");
			await runAccountTransactions(account, options, command, runtime);
		});
	registerAccountMutationCommands(accounts, runtime);

	program
		.command("account-types")
		.description("Read account types")
		.command("list")
		.description("List read-only account types")
		.option("--include-archived", "include archived account types")
		.action(
			async (options: { includeArchived?: boolean }, command: Command) => {
				const { runAccountTypeList } = await import("./read-actions.js");
				await runAccountTypeList(options, command, runtime);
			}
		);
};
