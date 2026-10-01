import type { Command } from "commander";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import { writeSuccess } from "../output/index.js";
import type { CliRuntime } from "../runtime.js";

const completionWords = [
	"context",
	"expenses",
	"accounts",
	"summary",
	"cycles",
	"categories",
	"tags",
	"account-types",
	"auth",
	"completion",
	"list",
	"get",
	"add",
	"edit",
	"delete",
	"transactions",
	"adjust-balance",
	"transfer",
	"archive",
	"reactivate",
	"set-default",
	"current",
	"login",
	"status",
	"logout",
	"--accessible",
	"--help",
	"--version",
	"--interactive",
	"--json",
	"--non-interactive",
	"--no-color",
	"--debug",
].join(" ");

const scripts: Readonly<Record<string, string>> = {
	bash: `_spendly_completion() {
  local current="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${completionWords}" -- "$current") )
}
complete -F _spendly_completion spendly`,
	fish: completionWords
		.split(" ")
		.map((word) => `complete -c spendly -a '${word}'`)
		.join("\n"),
	zsh: `#compdef spendly
_spendly() {
  local -a words
  words=(${completionWords})
  _describe 'Spendly command or option' words
}
compdef _spendly spendly`,
};

export const registerCompletionCommand = (
	program: Command,
	runtime: CliRuntime
): void => {
	program
		.command("completion")
		.description("Print shell completion for zsh, bash, or fish")
		.argument("<shell>", "zsh, bash, or fish")
		.action((shell: string, _options, command: Command) => {
			const script = scripts[shell];
			if (!script) {
				throw new CliError(
					"INVALID_INPUT",
					"Completion shell must be zsh, bash, or fish"
				);
			}
			writeSuccess(script, {
				globalOptions: resolveGlobalOptions(command, runtime.environment),
				runtime,
			});
		});
};
