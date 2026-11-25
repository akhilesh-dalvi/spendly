import { type Command, Option } from "commander";
import type { CliRuntime } from "../runtime.js";
import { registerAccountMutationCommands } from "./account-mutations.js";
import { registerCycleCommands } from "./cycles.js";
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
		.argument("[expense-id]", "stable expense ID")
		.action(
			async (expenseId: string | undefined, _options, command: Command) => {
				const { runExpenseGet } = await import("./read-actions.js");
				await runExpenseGet(expenseId, command, runtime);
			}
		);
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

	const cycles = program.command("cycles").description("Manage expense cycles");
	registerCycleCommands(cycles, runtime);
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

	const categories = program
		.command("categories")
		.description("List, add, and edit expense categories");
	categories
		.command("add")
		.description("Add one category to an existing cycle")
		.requiredOption("--cycle-id <id>", "stable ID of the target cycle")
		.requiredOption("--name <name>", "name of the new category")
		.option("--category-type-id <id>", "stable ID of an existing category type")
		.option("--icon <icon>", "literal category icon")
		.option(
			"--planned-amount <amount>",
			"optional nonnegative budget, up to two decimal places"
		)
		.option(
			"--if-preferred-currency <currency>",
			"require the preferred currency from a reviewed budget preview"
		)
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (options, command: Command) => {
			const { runCategoryAdd } = await import("./category-actions.js");
			await runCategoryAdd(options, command, runtime);
		});
	categories
		.command("edit")
		.argument("<category-id>", "stable ID of the existing category")
		.description("Edit one category without moving its expenses")
		.option("--name <name>", "new category name")
		.option("--icon <icon>", "new literal category icon")
		.option("--category-type-id <id>", "stable ID of an existing category type")
		.addOption(
			new Option("--clear-category-type", "remove the category type").conflicts(
				"categoryTypeId"
			)
		)
		.option(
			"--planned-amount <amount>",
			"new nonnegative budget, up to two decimal places"
		)
		.addOption(
			new Option("--clear-planned-amount", "remove the budget").conflicts(
				"plannedAmount"
			)
		)
		.option(
			"--if-edit-snapshot <snapshot>",
			"snapshot from the identical dry-run patch"
		)
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (categoryId: string, options, command: Command) => {
			const { runCategoryEdit } = await import("./category-actions.js");
			await runCategoryEdit(categoryId, options, command, runtime);
		});
	categories
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
		.command("category-types")
		.description("Create reusable category types")
		.command("add")
		.description("Create a reusable category type without assigning it")
		.requiredOption("--name <name>", "name of the new category type")
		.option("--color <hex>", "color as #RRGGBB (default: #3b82f6)")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (options, command: Command) => {
			const { runCategoryTypeAdd } = await import("./category-type-actions.js");
			await runCategoryTypeAdd(options, command, runtime);
		});

	const tags = program
		.command("tags")
		.description("List, create, and rename expense tags");
	tags
		.command("list")
		.description("List tags")
		.action(async (_options, command: Command) => {
			const { runTagList } = await import("./read-actions.js");
			await runTagList(command, runtime);
		});
	tags
		.command("add")
		.description("Create a reusable tag without assigning it to an expense")
		.requiredOption("--name <name>", "name of the new tag")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (options, command: Command) => {
			const { runTagAdd } = await import("./tag-actions.js");
			await runTagAdd(options, command, runtime);
		});
	tags
		.command("rename <tag-id>")
		.description("Rename a tag without changing its expense links")
		.requiredOption("--name <name>", "new name for the tag")
		.option("--if-edit-snapshot <snapshot>", "reviewed snapshot from --dry-run")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (tagId: string, options, command: Command) => {
			const { runTagRename } = await import("./tag-actions.js");
			await runTagRename(tagId, options, command, runtime);
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
		.argument("[account]", "stable account ID or exact human name")
		.action(async (account: string | undefined, _options, command: Command) => {
			const { runAccountGet } = await import("./read-actions.js");
			await runAccountGet(account, command, runtime);
		});
	accounts
		.command("transactions")
		.description("List an account's ledger transactions")
		.argument("[account]", "stable account ID or exact human name")
		.option("--limit <number>", "page size from 1 to 100")
		.option("--cursor <cursor>", "opaque cursor from a previous response")
		.action(async (account: string | undefined, options, command: Command) => {
			const { runAccountTransactions } = await import("./read-actions.js");
			await runAccountTransactions(account, options, command, runtime);
		});
	registerAccountMutationCommands(accounts, runtime);

	const accountTypes = program
		.command("account-types")
		.description("Browse, create, or edit account types");
	accountTypes
		.command("add")
		.description("Create a standalone account type without creating an account")
		.requiredOption("--name <name>", "name of the new account type")
		.requiredOption(
			"--balance-nature <nature>",
			"asset (money available) or liability (money owed)"
		)
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (options, command: Command) => {
			const { runAccountTypeAdd } = await import("./account-type-actions.js");
			await runAccountTypeAdd(options, command, runtime);
		});
	accountTypes
		.command("edit")
		.description(
			"Edit a standalone account type without changing its assigned accounts"
		)
		.argument("<id>", "stable account type ID from account-types list")
		.option("--name <name>", "new name")
		.option(
			"--icon <key>",
			"supported account type icon key, such as wallet or vault"
		)
		.option("--color <hex>", "six-digit hex color, such as #14B8A6")
		.option(
			"--balance-nature <nature>",
			"asset or liability; only changes on unused types"
		)
		.option(
			"--if-edit-snapshot <snapshot>",
			"snapshot from a reviewed dry run (required for scripts)"
		)
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (id: string, options, command: Command) => {
			const { runAccountTypeEdit } = await import("./account-type-actions.js");
			await runAccountTypeEdit(id, options, command, runtime);
		});
	accountTypes
		.command("list")
		.description("List account types")
		.option("--include-archived", "include archived account types")
		.action(
			async (options: { includeArchived?: boolean }, command: Command) => {
				const { runAccountTypeList } = await import("./read-actions.js");
				await runAccountTypeList(options, command, runtime);
			}
		);
};
