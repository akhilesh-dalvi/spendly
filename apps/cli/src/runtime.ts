import type { RuntimeConfig } from "./config.js";

export interface OutputWriter {
	write(value: string): unknown;
}

export interface CliRuntime {
	developmentTools: boolean;
	environment: NodeJS.ProcessEnv;
	getConfig: () => RuntimeConfig;
	stderr: OutputWriter;
	stdout: OutputWriter;
}

export const createProcessRuntime = (
	config: RuntimeConfig | (() => RuntimeConfig),
	environment: NodeJS.ProcessEnv = process.env,
	options: { developmentTools?: boolean } = {}
): CliRuntime => ({
	developmentTools: options.developmentTools ?? false,
	environment,
	getConfig: typeof config === "function" ? config : () => config,
	stderr: process.stderr,
	stdout: process.stdout,
});
