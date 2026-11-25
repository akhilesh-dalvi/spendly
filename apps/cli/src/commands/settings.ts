import type { Command } from "commander";
import type { CliRuntime } from "../runtime.js";

export const registerSettingsCommands = (
	program: Command,
	runtime: CliRuntime
): void => {
	program
		.command("settings")
		.description("Manage Spendly preferences")
		.command("set-currency <code>")
		.description("Change the preferred currency without converting amounts")
		.option("--dry-run", "preview the change without saving")
		.option(
			"--if-edit-snapshot <snapshot>",
			"guard the save with the reviewed preview snapshot"
		)
		.option("--idempotency-key <key>", "safely replay the same save")
		.addHelpText(
			"after",
			"\nSupported codes: USD, EUR, GBP, INR, CAD, AUD, JPY, AED.\nRead the saved preference: spendly auth status\nScripts and agents: review --dry-run, then save with --if-edit-snapshot and --idempotency-key."
		)
		.action(async (code, options, command) => {
			const { runSetCurrency } = await import("./settings-actions.js");
			await runSetCurrency(code, options, command, runtime);
		});
};
