import type { Command } from "commander";
import { resolveIdempotencyKey } from "../domain/mutation-input.js";
import type { AccountType } from "../domain/read-schemas.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
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

const renderType = ({ balanceNature, name }: AccountTypeDraft): string => {
	const nature =
		balanceNature === "asset"
			? "Asset (money available)"
			: "Liability (money owed)";
	return `Name: ${name}\nBalance nature: ${nature}`;
};

export const runAccountTypeAdd = async (
	options: AccountTypeAddOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const { balanceNature, name } = options;
	if (balanceNature !== "asset" && balanceNature !== "liability") {
		throw new CliError(
			"INVALID_INPUT",
			"--balance-nature must be asset or liability"
		);
	}
	const input: AccountTypeDraft = { balanceNature, name };
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
