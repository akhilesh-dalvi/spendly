import { Command, CommanderError, Option } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCompletionCommand } from "./commands/completion.js";
import { addCommandExamples } from "./commands/help.js";
import { getPrompter } from "./commands/interactive-support.js";
import { registerReadCommands } from "./commands/read.js";
import {
	CLI_EXIT_CODE,
	CliError,
	type CliExitCode,
	toCliError,
} from "./errors.js";
import { PromptCancelledError } from "./input/types.js";
import {
	hasArgumentFlag,
	type ResolvedGlobalOptions,
	resolveGlobalOptions,
} from "./options.js";
import { writeDebugError } from "./output/debug.js";
import { writeError } from "./output/index.js";
import { createJsonSuccessEnvelope, writeJson } from "./output/json.js";
import type { CliRuntime } from "./runtime.js";
import { CLI_VERSION } from "./version.js";

const defaultGlobalOptions: ResolvedGlobalOptions = {
	accessible: false,
	agent: false,
	allowFileStorage: false,
	color: true,
	debug: false,
	interactive: false,
	json: false,
	nonInteractive: false,
	retry: true,
};

const launcherActions: Readonly<
	Record<string, Array<{ hint: string; label: string; value: string }>>
> = {
	accounts: [
		{
			hint: "See balances and status",
			label: "List accounts",
			value: "accounts list",
		},
		{
			hint: "Inspect one account",
			label: "View account",
			value: "accounts get",
		},
		{
			hint: "Add a new account",
			label: "Add account",
			value: "accounts add",
		},
		{
			hint: "Change name or type",
			label: "Edit account",
			value: "accounts edit",
		},
		{
			hint: "Set a desired final balance",
			label: "Adjust a balance",
			value: "accounts adjust-balance",
		},
		{
			hint: "Move money between accounts",
			label: "Transfer",
			value: "accounts transfer",
		},
		{
			hint: "Preserve history but stop new activity",
			label: "Archive account",
			value: "accounts archive",
		},
		{
			hint: "Allow new activity again",
			label: "Reactivate account",
			value: "accounts reactivate",
		},
		{
			hint: "Choose the automatic expense account",
			label: "Make default",
			value: "accounts set-default",
		},
		{
			hint: "Inspect account activity",
			label: "View account activity",
			value: "accounts transactions",
		},
	],
	auth: [
		{
			hint: "Open secure browser sign-in",
			label: "Sign in",
			value: "auth login",
		},
		{
			hint: "Check the current session",
			label: "Check authentication",
			value: "auth status",
		},
		{
			hint: "Remove local credentials",
			label: "Sign out",
			value: "auth logout",
		},
	],
	expenses: [
		{
			hint: "Record a purchase",
			label: "Add expense",
			value: "expenses add",
		},
		{
			hint: "Browse and filter expenses",
			label: "List expenses",
			value: "expenses list",
		},
		{
			hint: "Inspect one expense",
			label: "View expense",
			value: "expenses get",
		},
		{
			hint: "Change selected fields",
			label: "Edit expense",
			value: "expenses edit",
		},
		{
			hint: "Permanent; previewed and confirmed",
			label: "Delete expense",
			value: "expenses delete",
		},
	],
	planning: [
		{
			hint: "Currency, date, cycle, and setup",
			label: "View Spendly context",
			value: "context",
		},
		{
			hint: "Spending versus plan",
			label: "View a cycle summary",
			value: "summary",
		},
		{
			hint: "Browse expense cycles",
			label: "List cycles",
			value: "cycles list",
		},
		{
			hint: "Plan dates and copy categories",
			label: "Add cycle",
			value: "cycles add",
		},
		{
			hint: "Inspect dates and revision",
			label: "View cycle",
			value: "cycles get",
		},
		{ hint: "Change name or dates", label: "Edit cycle", value: "cycles edit" },
		{
			hint: "Permanent; removes categories, requires no expenses",
			label: "Delete cycle",
			value: "cycles delete",
		},
		{
			hint: "Browse one cycle's categories",
			label: "List categories",
			value: "categories list",
		},
		{ hint: "Browse expense tags", label: "List tags", value: "tags list" },
		{
			hint: "Browse read-only account types",
			label: "List account types",
			value: "account-types list",
		},
	],
	quick: [
		{
			hint: "Record a purchase",
			label: "Add expense",
			value: "expenses add",
		},
		{
			hint: "Browse recent spending",
			label: "List expenses",
			value: "expenses list",
		},
		{
			hint: "See balances and status",
			label: "List accounts",
			value: "accounts list",
		},
		{
			hint: "Spending versus plan",
			label: "View a cycle summary",
			value: "summary",
		},
		{
			hint: "Move money between accounts",
			label: "Transfer",
			value: "accounts transfer",
		},
	],
};

const chooseLauncherCommand = async (
	prompter: NonNullable<Awaited<ReturnType<typeof getPrompter>>>
): Promise<string | undefined> => {
	for (;;) {
		const area = await prompter.select({
			message: "What would you like to work with?",
			options: [
				{ hint: "Common tasks", label: "Quick actions", value: "quick" },
				{
					hint: "Add, find, edit, or delete",
					label: "Expenses",
					value: "expenses",
				},
				{
					hint: "Balances, transfers, and account settings",
					label: "Accounts",
					value: "accounts",
				},
				{
					hint: "Context, summaries, cycles, categories, and tags",
					label: "Planning data",
					value: "planning",
				},
				{
					hint: "Sign in, status, or sign out",
					label: "Authentication",
					value: "auth",
				},
				{ hint: "Return to the shell", label: "Exit", value: "exit" },
			],
		});
		if (area === "exit") {
			return undefined;
		}
		const command = await prompter.select({
			message: "Choose an action",
			options: [
				...(launcherActions[area] ?? []),
				{ hint: "Choose another area", label: "Back", value: "back" },
			],
			searchable: true,
		});
		if (command !== "back") {
			return command;
		}
	}
};

const createProgram = (
	runtime: CliRuntime,
	writeCommandOutput: (value: string) => void
): Command => {
	const program = new Command();
	program
		.name("spendly")
		.description("Track and manage Spendly data from the command line")
		.version(CLI_VERSION)
		.option(
			"--accessible",
			"use static numbered prompts for screen readers",
			false
		)
		.option("--agent", "mark committed mutations as AI-agent initiated", false)
		.option("--json", "write one versioned JSON document to stdout", false)
		.option("--non-interactive", "disable all interactive prompts", false)
		.option("--debug", "write redacted diagnostics to stderr", false)
		.option("--interactive", "guide human input with terminal prompts", false)
		.option("--no-color", "disable terminal colors")
		.option("--no-retry", "disable retries for read-only requests")
		.addOption(
			new Option(
				"--allow-file-storage",
				"allow owner-only plaintext storage when the OS keychain is unavailable"
			).default(false)
		)
		.addHelpText(
			"after",
			`\nGuided mode: spendly --interactive\nFor command-specific guidance: spendly <command> --help\nDocumentation: https://spendly.akhileshdalvi.com/docs/cli\nInitial release (once published on next): npm install --global spendly@${CLI_VERSION}`
		)
		.showSuggestionAfterError(true)
		.showHelpAfterError(false)
		.exitOverride()
		.configureOutput({
			writeErr: () => undefined,
			writeOut: writeCommandOutput,
		});

	program.hook("preAction", (_thisCommand, actionCommand) => {
		const options = resolveGlobalOptions(actionCommand, runtime.environment);
		if (
			options.interactive &&
			(options.agent || options.json || options.nonInteractive)
		) {
			throw new CliError(
				"INVALID_INPUT",
				"--interactive cannot be combined with --agent, --json, or --non-interactive"
			);
		}
	});

	registerReadCommands(program, runtime);
	registerAuthCommands(program, runtime);
	registerCompletionCommand(program, runtime);
	addCommandExamples(program);
	return program;
};

const isSuccessfulCommanderExit = (error: CommanderError): boolean =>
	error.code === "commander.helpDisplayed" ||
	error.code === "commander.version" ||
	error.exitCode === CLI_EXIT_CODE.success;

const getFallbackOptions = (
	args: readonly string[],
	runtime: CliRuntime
): ResolvedGlobalOptions => ({
	...defaultGlobalOptions,
	accessible:
		hasArgumentFlag(args, "--accessible") ||
		runtime.environment.ACCESSIBLE === "1",
	agent: hasArgumentFlag(args, "--agent"),
	color:
		runtime.environment.NO_COLOR === undefined &&
		!hasArgumentFlag(args, "--no-color") &&
		!hasArgumentFlag(args, "--json"),
	debug: hasArgumentFlag(args, "--debug"),
	interactive: hasArgumentFlag(args, "--interactive"),
	json: hasArgumentFlag(args, "--json"),
	nonInteractive: hasArgumentFlag(args, "--non-interactive"),
	retry: !hasArgumentFlag(args, "--no-retry"),
});

const writeCommandSuccess = (options: {
	args: readonly string[];
	commanderCode?: string;
	output: string;
	runtime: CliRuntime;
}): void => {
	if (!hasArgumentFlag(options.args, "--json")) {
		options.runtime.stdout.write(options.output);
		return;
	}
	const key =
		options.commanderCode === "commander.version" ? "version" : "help";
	writeJson(
		createJsonSuccessEnvelope({ [key]: options.output.trimEnd() }),
		options.runtime.stdout
	);
};

const getLauncherInvocation = async (
	args: readonly string[],
	runtime: CliRuntime
): Promise<readonly string[] | null | undefined> => {
	const launcherArguments = args.filter(
		(argument) =>
			argument !== "--interactive" &&
			argument !== "--no-color" &&
			argument !== "--accessible"
	);
	if (
		!(hasArgumentFlag(args, "--interactive") && launcherArguments.length === 0)
	) {
		return undefined;
	}
	const prompter = await getPrompter(
		getFallbackOptions(args, runtime),
		runtime,
		true
	);
	const command = await chooseLauncherCommand(prompter);
	if (!command) {
		return null;
	}
	return [
		...command.split(" "),
		"--interactive",
		...(hasArgumentFlag(args, "--no-color") ? ["--no-color"] : []),
		...(hasArgumentFlag(args, "--accessible") ? ["--accessible"] : []),
	];
};

export const runCli = async (
	args: readonly string[],
	runtime: CliRuntime
): Promise<CliExitCode> => {
	let commandOutput = "";
	const program = createProgram(runtime, (value) => {
		commandOutput += value;
	});
	if (args.length === 0) {
		program.outputHelp();
		writeCommandSuccess({ args, output: commandOutput, runtime });
		return CLI_EXIT_CODE.success;
	}

	try {
		const hasIncompatibleInteractiveOption = [
			"--agent",
			"--json",
			"--non-interactive",
		].some((flag) => hasArgumentFlag(args, flag));
		if (
			hasArgumentFlag(args, "--interactive") &&
			hasIncompatibleInteractiveOption
		) {
			throw new CliError(
				"INVALID_INPUT",
				"--interactive cannot be combined with --agent, --json, or --non-interactive"
			);
		}
		const launcherInvocation = await getLauncherInvocation(args, runtime);
		if (launcherInvocation === null) {
			runtime.stderr.write("Exited guided mode.\n");
			return CLI_EXIT_CODE.success;
		}
		if (launcherInvocation !== undefined) {
			return await runCli(launcherInvocation, runtime);
		}
		await program.parseAsync([...args], { from: "user" });
		return CLI_EXIT_CODE.success;
	} catch (error) {
		if (error instanceof PromptCancelledError) {
			runtime.stderr.write(`${error.message}\n`);
			return CLI_EXIT_CODE.success;
		}
		if (error instanceof CommanderError) {
			if (isSuccessfulCommanderExit(error)) {
				writeCommandSuccess({
					args,
					commanderCode: error.code,
					output: commandOutput,
					runtime,
				});
				return CLI_EXIT_CODE.success;
			}
			const cliError = new CliError("INVALID_COMMAND", error.message, {
				cause: error,
			});
			const globalOptions = getFallbackOptions(args, runtime);
			writeError(cliError, { globalOptions, runtime });
			if (globalOptions.debug) {
				writeDebugError(cliError, runtime.stderr);
			}
			return cliError.exitCode;
		}

		const cliError = toCliError(error);
		const globalOptions = getFallbackOptions(args, runtime);
		writeError(cliError, { globalOptions, runtime });
		if (globalOptions.debug) {
			writeDebugError(cliError, runtime.stderr);
		}
		return cliError.exitCode;
	}
};
