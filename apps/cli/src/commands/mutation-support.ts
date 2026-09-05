import type { Command } from "commander";
import type { z } from "zod";
import {
	type BackendCommandContext,
	createBackendCommandContext,
} from "../client/convex-client.js";
import { CliError } from "../errors.js";
import { writeSuccess } from "../output/index.js";
import type { CliRuntime } from "../runtime.js";

export const queryParsed = async <Output>(
	context: BackendCommandContext,
	functionName: string,
	args: Readonly<Record<string, unknown>>,
	schema: z.ZodType<Output>
): Promise<Output> =>
	schema.parse(await context.query<unknown>(functionName, args));

export const mutationParsed = async <Output>(options: {
	args: Readonly<Record<string, unknown>>;
	context: BackendCommandContext;
	idempotencyKey?: string;
	name: string;
	schema: z.ZodType<Output>;
}): Promise<Output> => {
	try {
		return options.schema.parse(
			await options.context.mutation<unknown>(options.name, options.args)
		);
	} catch (error) {
		if (error instanceof CliError && error.code === "NETWORK_ERROR") {
			throw new CliError(
				"NETWORK_ERROR",
				options.idempotencyKey
					? "The mutation outcome is uncertain; repeat the same command with the same idempotency key"
					: "The mutation outcome is uncertain; repeat the preview command",
				{
					cause: error,
					details: {
						...(options.idempotencyKey
							? { idempotencyKey: options.idempotencyKey }
							: {}),
						outcome: "unknown",
					},
					retryable: true,
				}
			);
		}
		throw error;
	}
};

export const withBackend = async (
	command: Command,
	runtime: CliRuntime,
	operation: (context: BackendCommandContext) => Promise<void>
): Promise<void> => {
	const context = await createBackendCommandContext(command, runtime);
	try {
		await operation(context);
	} finally {
		context.dispose();
	}
};

export const writeMutationSuccess = (options: {
	context: BackendCommandContext;
	data: unknown;
	human: string;
	meta: Readonly<Record<string, unknown>>;
	runtime: CliRuntime;
}): void => {
	writeSuccess(
		options.context.globalOptions.json ? options.data : options.human,
		{
			globalOptions: options.context.globalOptions,
			runtime: options.runtime,
		},
		options.context.warnings.length > 0
			? { ...options.meta, warnings: options.context.warnings }
			: options.meta
	);
};

export const assertNamesAllowed = (
	names: Array<string | string[] | undefined>,
	nonInteractive: boolean
): void => {
	if (
		nonInteractive &&
		names.some((name) =>
			Array.isArray(name) ? name.length > 0 : name !== undefined
		)
	) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive mutation selectors require stable IDs"
		);
	}
};
