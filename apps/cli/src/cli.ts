import { Command, CommanderError, Option } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerReadCommands } from "./commands/read.js";
import {
	CLI_EXIT_CODE,
	CliError,
	type CliExitCode,
	toCliError,
} from "./errors.js";
import { hasArgumentFlag, type ResolvedGlobalOptions } from "./options.js";
import { writeDebugError } from "./output/debug.js";
import { writeError } from "./output/index.js";
import { createJsonSuccessEnvelope, writeJson } from "./output/json.js";
import type { CliRuntime } from "./runtime.js";
import { CLI_VERSION } from "./version.js";

const defaultGlobalOptions: ResolvedGlobalOptions = {
	allowFileStorage: false,
	color: true,
	debug: false,
	json: false,
	nonInteractive: false,
	retry: true,
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
		.option("--json", "write one versioned JSON document to stdout", false)
		.option("--non-interactive", "disable all interactive prompts", false)
		.option("--debug", "write redacted diagnostics to stderr", false)
		.option("--no-color", "disable terminal colors")
		.option("--no-retry", "disable retries for read-only requests")
		.addOption(
			new Option(
				"--allow-file-storage",
				"allow owner-only plaintext storage when the OS keychain is unavailable"
			).default(false)
		)
		.showHelpAfterError(false)
		.exitOverride()
		.configureOutput({
			writeErr: () => undefined,
			writeOut: writeCommandOutput,
		});

	registerAuthCommands(program, runtime);
	registerReadCommands(program, runtime);
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
	color:
		runtime.environment.NO_COLOR === undefined &&
		!hasArgumentFlag(args, "--no-color") &&
		!hasArgumentFlag(args, "--json"),
	debug: hasArgumentFlag(args, "--debug"),
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
		await program.parseAsync([...args], { from: "user" });
		return CLI_EXIT_CODE.success;
	} catch (error) {
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
