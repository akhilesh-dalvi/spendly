import { type Command, Option } from "commander";
import type { CliRuntime } from "../runtime.js";

export const registerAccountMutationCommands = (
	accounts: Command,
	runtime: CliRuntime
): void => {
	accounts
		.command("create")
		.description("Create an account or preview its opening ledger entry")
		.requiredOption("--name <name>", "account name")
		.requiredOption("--starting-balance <balance>", "opening account balance")
		.addOption(
			new Option("--account-type-id <id>", "stable account type ID").conflicts(
				"accountType"
			)
		)
		.addOption(
			new Option("--account-type <name>", "exact account type name").conflicts(
				"accountTypeId"
			)
		)
		.option("--date <date>", "opening ledger date in YYYY-MM-DD")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without creating the account")
		.action(async (options, command: Command) => {
			const { runAccountCreate } = await import(
				"./account-mutation-actions.js"
			);
			await runAccountCreate(options, command, runtime);
		});

	accounts
		.command("update")
		.description("Update an account name or active account type")
		.argument("<account>", "stable account ID or exact human name")
		.option("--name <name>", "new account name")
		.addOption(
			new Option("--account-type-id <id>", "stable account type ID").conflicts(
				"accountType"
			)
		)
		.addOption(
			new Option("--account-type <name>", "exact account type name").conflicts(
				"accountTypeId"
			)
		)
		.option("--if-revision <revision>", "expected current account revision")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without updating the account")
		.action(async (account: string, options, command: Command) => {
			const { runAccountUpdate } = await import(
				"./account-mutation-actions.js"
			);
			await runAccountUpdate(account, options, command, runtime);
		});

	for (const [name, description] of [
		["archive", "Archive an account while preserving its ledger"],
		["reactivate", "Reactivate an archived account"],
		["set-default", "Make an active account the default"],
	] as const) {
		accounts
			.command(name)
			.description(description)
			.argument("<account>", "stable account ID or exact human name")
			.option("--if-revision <revision>", "expected current account revision")
			.option("--idempotency-key <key>", "stable key for this intended commit")
			.option("--dry-run", "validate and preview without committing")
			.action(async (account: string, options, command: Command) => {
				const { runAccountLifecycle } = await import(
					"./account-mutation-actions.js"
				);
				await runAccountLifecycle(name, account, options, command, runtime);
			});
	}

	accounts
		.command("adjust-balance")
		.description("Set an account to an absolute balance with a ledger entry")
		.argument("<account>", "stable account ID or exact human name")
		.requiredOption("--balance <balance>", "desired absolute balance")
		.option("--date <date>", "ledger date in YYYY-MM-DD")
		.option("--note <note>", "ledger note")
		.option("--if-revision <revision>", "expected current account revision")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without changing the balance")
		.action(async (account: string, options, command: Command) => {
			const { runBalanceAdjustment } = await import(
				"./account-mutation-actions.js"
			);
			await runBalanceAdjustment(account, options, command, runtime);
		});

	accounts
		.command("transfer")
		.description("Transfer funds atomically between active accounts")
		.requiredOption("--amount <amount>", "positive decimal transfer amount")
		.addOption(
			new Option(
				"--from-account-id <id>",
				"stable source account ID"
			).conflicts("fromAccount")
		)
		.addOption(
			new Option(
				"--from-account <name>",
				"exact source account name"
			).conflicts("fromAccountId")
		)
		.addOption(
			new Option(
				"--to-account-id <id>",
				"stable destination account ID"
			).conflicts("toAccount")
		)
		.addOption(
			new Option(
				"--to-account <name>",
				"exact destination account name"
			).conflicts("toAccountId")
		)
		.option("--date <date>", "ledger date in YYYY-MM-DD")
		.option("--note <note>", "transfer note")
		.option("--if-from-revision <revision>", "expected source revision")
		.option("--if-to-revision <revision>", "expected destination revision")
		.option("--idempotency-key <key>", "stable key for this intended commit")
		.option("--dry-run", "validate and preview without transferring funds")
		.action(async (options, command: Command) => {
			const { runAccountTransfer } = await import(
				"./account-mutation-actions.js"
			);
			await runAccountTransfer(options, command, runtime);
		});
};
