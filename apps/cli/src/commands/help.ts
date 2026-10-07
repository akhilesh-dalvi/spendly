import type { Command } from "commander";

interface CommandExamples {
	flags: string;
	guided?: string;
}

const examples: Readonly<Record<string, CommandExamples>> = {
	"account-types list": {
		flags: "spendly account-types list --include-archived",
		guided: "spendly account-types list --interactive",
	},
	"accounts adjust-balance": {
		flags:
			"spendly accounts adjust-balance account_demo --balance 2500 --dry-run",
		guided: "spendly accounts adjust-balance --interactive --dry-run",
	},
	"accounts archive": {
		flags: "spendly accounts archive account_demo --dry-run",
		guided: "spendly accounts archive --interactive --dry-run",
	},
	"accounts add": {
		flags:
			'spendly accounts add --name "Travel Wallet" --account-type-id type_demo --starting-balance 500 --dry-run',
		guided: "spendly accounts add --interactive --dry-run",
	},
	"accounts get": {
		flags: "spendly accounts get account_demo",
		guided: "spendly accounts get --interactive",
	},
	"accounts list": {
		flags: "spendly accounts list --include-archived",
		guided: "spendly accounts list --interactive",
	},
	"accounts reactivate": {
		flags: "spendly accounts reactivate account_demo --dry-run",
		guided: "spendly accounts reactivate --interactive --dry-run",
	},
	"accounts set-default": {
		flags: "spendly accounts set-default account_demo --dry-run",
		guided: "spendly accounts set-default --interactive --dry-run",
	},
	"accounts transactions": {
		flags: "spendly accounts transactions account_demo --limit 25",
		guided: "spendly accounts transactions --interactive",
	},
	"accounts transfer": {
		flags:
			"spendly accounts transfer --from-account-id account_one --to-account-id account_two --amount 250 --dry-run",
		guided: "spendly accounts transfer --interactive --dry-run",
	},
	"accounts edit": {
		flags: 'spendly accounts edit account_demo --name "Daily Wallet" --dry-run',
		guided: "spendly accounts edit --interactive --dry-run",
	},
	"auth login": {
		flags: "spendly auth login --no-browser",
		guided: "spendly auth login",
	},
	"auth logout": { flags: "spendly auth logout" },
	"auth status": { flags: "spendly auth status" },
	"categories list": {
		flags: "spendly categories list --cycle-id cycle_demo",
		guided: "spendly categories list --interactive",
	},
	"cycles add": {
		flags:
			'spendly cycles add --name "September" --start-date 2026-09-01 --end-date-exclusive 2026-10-01 --dry-run',
		guided: "spendly cycles add --interactive --dry-run",
	},
	"cycles get": {
		flags: "spendly cycles get cycle_demo",
		guided: "spendly cycles get --interactive",
	},
	"cycles edit": {
		flags: 'spendly cycles edit cycle_demo --name "New name" --dry-run',
		guided: "spendly cycles edit --interactive --dry-run",
	},
	"cycles delete": {
		flags: "spendly cycles delete cycle_demo --dry-run",
		guided: "spendly cycles delete --interactive --dry-run",
	},
	"cycles current": {
		flags: "spendly cycles current --date 2026-09-14",
		guided: "spendly cycles current --interactive",
	},
	"cycles list": { flags: "spendly cycles list" },
	"expenses add": {
		flags: 'spendly expenses add --amount 18.75 --spent-on "Lunch" --dry-run',
		guided: "spendly expenses add --interactive --dry-run",
	},
	"expenses delete": {
		flags: "spendly expenses delete expense_demo --dry-run",
		guided: "spendly expenses delete --interactive --dry-run",
	},
	"expenses get": {
		flags: "spendly expenses get expense_demo",
		guided: "spendly expenses get --interactive",
	},
	"expenses list": {
		flags: "spendly expenses list --from 2026-09-01 --limit 25",
		guided: "spendly expenses list --interactive",
	},
	"expenses edit": {
		flags: "spendly expenses edit expense_demo --amount 20 --dry-run",
		guided: "spendly expenses edit --interactive --dry-run",
	},
	summary: {
		flags: "spendly summary --date 2026-09-14",
		guided: "spendly summary --interactive",
	},
	"tags list": { flags: "spendly tags list" },
};

const rootHelpGroups: Readonly<Record<string, string>> = {
	"account-types": "Planning data",
	accounts: "Accounts",
	auth: "Authentication",
	categories: "Planning data",
	completion: "Shell setup",
	context: "Quick start",
	cycles: "Planning data",
	expenses: "Expenses",
	summary: "Quick start",
	tags: "Planning data",
};

const commandPath = (command: Command): string => {
	const names: string[] = [];
	let current: Command | null = command;
	while (current?.parent) {
		names.unshift(current.name());
		current = current.parent;
	}
	return names.join(" ");
};

export const addCommandExamples = (program: Command): void => {
	for (const command of program.commands) {
		const group = rootHelpGroups[command.name()];
		if (group) {
			command.helpGroup(group);
		}
	}
	const remaining = [...program.commands];
	while (remaining.length > 0) {
		const command = remaining.shift();
		if (!command) {
			continue;
		}
		remaining.push(...command.commands);
		const commandExamples = examples[commandPath(command)];
		if (!commandExamples) {
			continue;
		}
		const lines = ["", "Examples:"];
		if (commandExamples.guided) {
			lines.push(`  Guided: ${commandExamples.guided}`);
		}
		lines.push(`  Flags:   ${commandExamples.flags}`);
		command.addHelpText("after", lines.join("\n"));
	}
};
