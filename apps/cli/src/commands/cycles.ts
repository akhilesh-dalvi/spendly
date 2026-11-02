import { type Command, Option } from "commander";

const collectOption = (value: string, previous: string[]): string[] => [
	...previous,
	value,
];

import type { CliRuntime } from "../runtime.js";

export const registerCycleCommands = (
	cycles: Command,
	runtime: CliRuntime
): void => {
	cycles
		.command("add")
		.description("Add an expense cycle or preview it without saving")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--name <name>", "cycle name")
		.option("--start-date <date>", "inclusive start date in YYYY-MM-DD")
		.option("--end-date-exclusive <date>", "exclusive end date in YYYY-MM-DD")
		.option("--copy-from-cycle-id <id>", "copy categories from an owned cycle")
		.option(
			"--if-copy-snapshot <snapshot>",
			"category-copy snapshot returned by --dry-run"
		)
		.addOption(
			new Option(
				"--copy-category-id <id>",
				"select a source category; repeatable"
			)
				.argParser(collectOption)
				.default([])
				.conflicts("withoutCategories")
		)
		.addOption(
			new Option(
				"--without-categories",
				"copy no categories, even when a source is supplied"
			).conflicts([
				"copyCategoryId",
				"includePlannedAmounts",
				"plannedAmount",
				"clearPlannedAmount",
			])
		)
		.option("--include-planned-amounts", "copy source planned amounts")
		.option(
			"--planned-amount <id=amount>",
			"override a source category plan; repeatable",
			collectOption,
			[]
		)
		.option(
			"--clear-planned-amount <id>",
			"clear a copied category plan; repeatable",
			collectOption,
			[]
		)
		.option("--dry-run", "validate and preview without saving")
		.action(async (options, command: Command) => {
			const { runCycleAdd } = await import("./cycle-actions.js");
			await runCycleAdd(options, command, runtime);
		});
	cycles
		.command("edit")
		.description("Edit cycle fields; existing expenses are not reassigned")
		.argument("[cycle-id]", "stable cycle ID")
		.option("--name <name>", "new cycle name")
		.option("--start-date <date>", "inclusive start date in YYYY-MM-DD")
		.option("--end-date-exclusive <date>", "exclusive end date in YYYY-MM-DD")
		.option("--if-revision <revision>", "expected current cycle revision")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without saving")
		.action(async (cycleId: string | undefined, options, command: Command) => {
			const { runCycleEdit } = await import("./cycle-actions.js");
			await runCycleEdit(cycleId, options, command, runtime);
		});
	cycles
		.command("delete")
		.description("Permanently delete an empty cycle and all its categories")
		.argument("[cycle-id]", "stable cycle ID")
		.option("--confirmation-token <token>", "token returned by --dry-run")
		.option("--if-revision <revision>", "expected current cycle revision")
		.option("--idempotency-key <key>", "stable key for this intended deletion")
		.option("--dry-run", "preview category loss and mint a confirmation token")
		.action(async (cycleId: string | undefined, options, command: Command) => {
			const { runCycleDelete } = await import("./cycle-actions.js");
			await runCycleDelete(cycleId, options, command, runtime);
		});
	cycles
		.command("get")
		.description("Get an expense cycle and its revision")
		.argument("[cycle-id]", "stable cycle ID")
		.action(async (cycleId: string | undefined, _options, command: Command) => {
			const { runCycleGet } = await import("./cycle-actions.js");
			await runCycleGet(cycleId, command, runtime);
		});
};
