import type { Command } from "commander";
import { resolveIdempotencyKey } from "../domain/mutation-input.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import { escapeTerminalText } from "../output/human.js";
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

interface TagRenameOptions extends TagAddOptions {
	ifEditSnapshot?: string;
}

const editSnapshotPattern = /^[a-f0-9]{64}$/u;

const renderTagName = (name: string): string =>
	escapeTerminalText(JSON.stringify(name));

export const runTagRename = async (
	tagId: string,
	options: TagRenameOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const input = { name: options.name, tagId };
	const snapshot = options.ifEditSnapshot;
	const dryRun = options.dryRun === true;
	if (
		snapshot !== undefined &&
		(dryRun || !editSnapshotPattern.test(snapshot))
	) {
		throw new CliError(
			"INVALID_INPUT",
			"--if-edit-snapshot must be a snapshot from --dry-run and cannot be combined with --dry-run"
		);
	}

	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = await getPrompter(globalOptions, runtime);
	if (!(dryRun || prompter || snapshot)) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive tag renames require --if-edit-snapshot from a reviewed dry run"
		);
	}
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: !prompter,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		let expectedEditSnapshot = snapshot;
		if (dryRun || prompter) {
			const preview = await context.operations.invoke(
				"tags.previewRename",
				input
			);
			if (snapshot !== undefined && snapshot !== preview.editSnapshot) {
				throw new CliError(
					"TAG_RENAME_CONFLICT",
					"The tag no longer matches the reviewed preview"
				);
			}
			expectedEditSnapshot = preview.editSnapshot;
			const human = [
				`ID: ${preview.id}`,
				`Before: ${renderTagName(preview.beforeName)}`,
				`After: ${renderTagName(preview.name)}`,
				"Expense links and balances will not change.",
				`Edit snapshot: ${preview.editSnapshot}`,
			].join("\n");
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
				message: "Rename this tag?",
				preview: human,
				prompter,
				runtime,
			});
		}
		if (!(expectedEditSnapshot && idempotencyKey)) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Missing snapshot or key for tag rename"
			);
		}
		const tag = await context.operations
			.invoke("tags.rename", { ...input, expectedEditSnapshot, idempotencyKey })
			.catch((error: unknown) => {
				if (
					error instanceof CliError &&
					error.code === "NETWORK_ERROR" &&
					error.details.outcome === "unknown"
				) {
					const snapshotFlag =
						snapshot === undefined
							? `--if-edit-snapshot ${expectedEditSnapshot}`
							: "the original --if-edit-snapshot";
					const keyFlag =
						options.idempotencyKey === undefined
							? `--idempotency-key ${idempotencyKey}`
							: "the original --idempotency-key";
					throw new CliError(
						error.code,
						`The tag rename outcome is uncertain. Check spendly tags list first. To replay within 30 days, keep the original inputs (including --agent if used) and use --non-interactive with ${snapshotFlag} and ${keyFlag}.`,
						{
							cause: error,
							details: { ...error.details, editSnapshot: expectedEditSnapshot },
							retryable: error.retryable,
						}
					);
				}
				throw error;
			});
		writeMutationSuccess({
			context,
			data: tag,
			human: `Renamed tag\nName: ${renderTagName(tag.name)}\nID: ${tag.id}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};
