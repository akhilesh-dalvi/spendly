import type { Readable, Writable } from "node:stream";
import type { RuntimeConfig } from "./config.js";
import type { BackendOperation } from "./core/operations.js";
import type { InteractivePrompter } from "./input/types.js";

export interface OutputWriter {
	columns?: number;
	isTTY?: boolean;
	write(value: string): unknown;
}

export type BackendQuery = BackendOperation;

export type BackendMutation = BackendOperation;

export interface CliRuntime {
	backendMutation?: BackendMutation;
	backendQuery?: BackendQuery;
	confirm?: (message: string) => Promise<boolean>;
	developmentTools: boolean;
	environment: NodeJS.ProcessEnv;
	getConfig: () => RuntimeConfig;
	now?: () => Date;
	promptInput?: Readable & { isTTY?: boolean };
	promptOutput?: Writable & { columns?: number; isTTY?: boolean };
	prompter?: InteractivePrompter;
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
	promptInput: process.stdin,
	promptOutput: process.stderr,
	stderr: process.stderr,
	stdout: process.stdout,
});
