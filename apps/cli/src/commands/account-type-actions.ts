import type { Command } from "commander";
import type { OperationOutput } from "../core/operations.js";
import { resolveIdempotencyKey } from "../domain/mutation-input.js";
import type { AccountType } from "../domain/read-schemas.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import { escapeTerminalText } from "../output/human.js";
import type { CliRuntime } from "../runtime.js";
import { confirmMutation, getPrompter } from "./interactive-support.js";
import { withBackend, writeMutationSuccess } from "./mutation-support.js";

interface AccountTypeAddOptions {
	balanceNature: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	name: string;
}

type AccountTypeDraft = Pick<AccountType, "balanceNature" | "name">;

const parseNature = (value: string): AccountType["balanceNature"] => {
	if (value !== "asset" && value !== "liability") {
		throw new CliError(
			"INVALID_INPUT",
			"--balance-nature must be asset or liability"
		);
	}
	return value;
};

const renderType = ({ balanceNature, name }: AccountTypeDraft): string => {
	const nature =
		balanceNature === "asset"
			? "Asset (money available)"
			: "Liability (money owed)";
	return `Name: ${escapeTerminalText(name)}\nBalance nature: ${nature}`;
};

export const runAccountTypeAdd = async (
	options: AccountTypeAddOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const input: AccountTypeDraft = {
		balanceNature: parseNature(options.balanceNature),
		name: options.name,
	};
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
				"accountTypes.previewCreate",
				input
			);
			const human = renderType(preview);
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
				message: "Create this account type?",
				preview: human,
				prompter,
				runtime,
			});
		}
		if (!idempotencyKey) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Missing key for account type creation"
			);
		}
		const type = await context.operations
			.invoke("accountTypes.create", { ...input, idempotencyKey })
			.catch((error: unknown) => {
				if (
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
						`The account type save outcome is uncertain. If retrying, use the same inputs with --non-interactive and ${retryKey}`,
						{ cause: error, details: error.details, retryable: error.retryable }
					);
				}
				throw error;
			});
		writeMutationSuccess({
			context,
			data: type,
			human: `Created account type\n${renderType(type)}\nID: ${type.id}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};

interface AccountTypeEditOptions extends Partial<AccountTypeAddOptions> {
	color?: string;
	icon?: string;
	ifEditSnapshot?: string;
}

type AccountTypeEditView =
	OperationOutput<"accountTypes.previewEdit">["before"];
const editSnapshotPattern = /^[a-f0-9]{64}$/u;

const renderEditType = (type: AccountTypeEditView): string =>
	[
		renderType(type),
		`Icon: ${type.icon === null ? "(default)" : escapeTerminalText(type.icon)}`,
		`Color: ${type.color === null ? "(default)" : escapeTerminalText(type.color)}`,
		`State: ${type.isArchived ? "Archived" : "Active"}`,
		`ID: ${type.id}`,
	].join("\n");

export const runAccountTypeEdit = async (
	accountTypeId: string,
	options: AccountTypeEditOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const { color, icon, name, ifEditSnapshot: snapshot } = options;
	const balanceNature =
		options.balanceNature === undefined
			? undefined
			: parseNature(options.balanceNature);
	if (
		[balanceNature, color, icon, name].every((field) => field === undefined)
	) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide at least one account type field to edit"
		);
	}
	const input = {
		accountTypeId,
		...(balanceNature === undefined ? {} : { balanceNature }),
		...(color === undefined ? {} : { color }),
		...(icon === undefined ? {} : { icon }),
		...(name === undefined ? {} : { name }),
	};
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
			"Non-interactive account type edits require --if-edit-snapshot from a reviewed dry run"
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
				"accountTypes.previewEdit",
				input
			);
			if (snapshot !== undefined && snapshot !== preview.editSnapshot) {
				throw new CliError(
					"ACCOUNT_TYPE_EDIT_CONFLICT",
					"The account type edit no longer matches the reviewed preview"
				);
			}
			expectedEditSnapshot = preview.editSnapshot;
			const human = [
				"Before",
				renderEditType(preview.before),
				"After",
				renderEditType(preview.after),
				"Existing account assignments and balances will not change.",
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
				message: "Save these account type changes?",
				preview: human,
				prompter,
				runtime,
			});
		}
		if (!(expectedEditSnapshot && idempotencyKey)) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Missing snapshot or key for account type edit"
			);
		}
		const type = await context.operations
			.invoke("accountTypes.edit", {
				...input,
				expectedEditSnapshot,
				idempotencyKey,
			})
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
						`The account type save outcome is uncertain. Check the account type first. To replay within 30 days, keep the original inputs (including --agent if used) and use --non-interactive with ${snapshotFlag} and ${keyFlag}.`,
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
			data: type,
			human: `Updated account type\n${renderEditType(type)}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};
