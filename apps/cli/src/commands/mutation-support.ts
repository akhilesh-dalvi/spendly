import type { Command } from "commander";
import type { z } from "zod";
import {
	type BackendCommandContext,
	createBackendCommandContext,
} from "../client/convex-client.js";
import type { OperationName } from "../core/operations.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import {
	renderHumanLines,
	resolveHumanRenderOptions,
} from "../output/human.js";
import { writeSuccess } from "../output/index.js";
import { startBackendProgress } from "../output/progress.js";
import type { CliRuntime } from "../runtime.js";

export const queryParsed = async <Output>(
	context: BackendCommandContext,
	operationName: OperationName,
	args: Readonly<Record<string, unknown>>,
	_schema: z.ZodType<Output>
): Promise<Output> =>
	(await context.operations.invoke(operationName, args)) as Output;

export const mutationParsed = async <Output>(options: {
	args: Readonly<Record<string, unknown>>;
	context: BackendCommandContext;
	idempotencyKey?: string;
	name: OperationName;
	schema: z.ZodType<Output>;
}): Promise<Output> => {
	return (await options.context.operations.invoke(
		options.name,
		options.args
	)) as Output;
};

export const commitParsed = async <Output>(options: {
	args: Readonly<Record<string, unknown>>;
	context: BackendCommandContext;
	idempotencyKey?: string;
	name: OperationName;
	schema: z.ZodType<Output>;
}): Promise<Output> => await mutationParsed(options);

export const withBackend = async (
	command: Command,
	runtime: CliRuntime,
	operation: (context: BackendCommandContext) => Promise<void>
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const stopProgress = startBackendProgress(globalOptions, runtime);
	let context: BackendCommandContext | undefined;
	try {
		context = await createBackendCommandContext(command, runtime);
		stopProgress();
		await operation(context);
	} finally {
		stopProgress();
		context?.dispose();
	}
};

export const writeMutationSuccess = (options: {
	context: BackendCommandContext;
	data: unknown;
	human: string;
	meta: Readonly<Record<string, unknown>>;
	runtime: CliRuntime;
}): void => {
	const humanOutput =
		options.meta.dryRun === true
			? `PREVIEW ONLY - no changes were saved.\n\n${options.human}`
			: options.human;
	const human = renderHumanLines(
		humanOutput.split("\n"),
		resolveHumanRenderOptions(options.runtime.stdout)
	);
	writeSuccess(
		options.context.globalOptions.json ? options.data : human,
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
