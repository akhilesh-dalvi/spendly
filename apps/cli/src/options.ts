import type { Command } from "commander";

export interface GlobalOptions {
	accessible: boolean;
	agent: boolean;
	allowFileStorage: boolean;
	color: boolean;
	debug: boolean;
	interactive: boolean;
	json: boolean;
	nonInteractive: boolean;
	retry: boolean;
}

export interface ResolvedGlobalOptions extends GlobalOptions {
	color: boolean;
}

export const resolveGlobalOptions = (
	command: Command,
	environment: NodeJS.ProcessEnv
): ResolvedGlobalOptions => {
	const options = command.optsWithGlobals<GlobalOptions>();
	return {
		...options,
		accessible: options.accessible || environment.ACCESSIBLE === "1",
		color: options.color && environment.NO_COLOR === undefined && !options.json,
	};
};

export const hasArgumentFlag = (
	args: readonly string[],
	flag: string
): boolean => {
	for (const argument of args) {
		if (argument === "--") {
			return false;
		}
		if (argument === flag) {
			return true;
		}
	}
	return false;
};
