import type { Command } from "commander";
import { resolveIdempotencyKey } from "../domain/mutation-input.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import type { CliRuntime } from "../runtime.js";
import { confirmMutation, getPrompter } from "./interactive-support.js";
import { withBackend, writeMutationSuccess } from "./mutation-support.js";

interface TagAddOptions {
	dryRun?: boolean;
	idempotencyKey?: string;
	name: string;
}

export const runTagAdd = async (
	options: TagAddOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const input = { name: options.name };
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = await getPrompter(globalOptions, runtime);
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: !prompter,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		if (dryRun || prompter) {
			const preview = await context.operations.invoke(
				"tags.previewCreate",
				input
			);
			const human = `Name: ${preview.name}`;
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: preview,
					human,
					meta: { dryRun: true },
					runtime,
				});
				return;
			}
			await confirmMutation({
				message: "Create this tag?",
				preview: human,
				prompter,
				runtime,
			});
		}
		if (!idempotencyKey) {
			throw new CliError("INTERNAL_ERROR", "Missing key for tag creation");
		}
		const tag = await context.operations
			.invoke("tags.create", { ...input, idempotencyKey })
			.catch((error: unknown) => {
				if (
					prompter &&
					error instanceof CliError &&
					error.code === "NETWORK_ERROR" &&
					error.details.outcome === "unknown"
				) {
					const retryKey =
						options.idempotencyKey === undefined
							? `--idempotency-key ${idempotencyKey}`
							: "the original --idempotency-key";
					throw new CliError(
						error.code,
						`The tag save outcome is uncertain. If retrying, use the same inputs with --non-interactive and ${retryKey}`,
						{ cause: error, details: error.details, retryable: error.retryable }
					);
				}
				throw error;
			});
		writeMutationSuccess({
			context,
			data: tag,
			human: `Created tag\nName: ${tag.name}\nID: ${tag.id}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};
