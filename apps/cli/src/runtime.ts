import type { RuntimeConfig } from "./config.js";

export interface OutputWriter {
	write(value: string): unknown;
}

export type BackendQuery = <Result>(
	functionName: string,
	args: Readonly<Record<string, unknown>>
) => Promise<Result>;

export type BackendMutation = <Result>(
	functionName: string,
	args: Readonly<Record<string, unknown>>
) => Promise<Result>;

export interface CliRuntime {
	backendMutation?: BackendMutation;
	backendQuery?: BackendQuery;
	confirm?: (message: string) => Promise<boolean>;
	developmentTools: boolean;
	environment: NodeJS.ProcessEnv;
	getConfig: () => RuntimeConfig;
	now?: () => Date;
	randomIdempotencyKey?: () => string;
	sleep?: (milliseconds: number) => Promise<void>;
	stderr: OutputWriter;
	stdout: OutputWriter;
	timeZone?: () => string | undefined;
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
