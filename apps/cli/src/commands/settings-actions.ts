import type { Command } from "commander";
import {
	type OperationOutput,
	preferredCurrencySchema,
} from "../core/operations.js";
import { resolveIdempotencyKey } from "../domain/mutation-input.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import type { CliRuntime } from "../runtime.js";
import { confirmMutation, getPrompter } from "./interactive-support.js";
import { withBackend, writeMutationSuccess } from "./mutation-support.js";

interface SetCurrencyOptions {
	dryRun?: boolean;
	idempotencyKey?: string;
	ifEditSnapshot?: string;
}

const editSnapshotPattern = /^[a-f0-9]{64}$/u;
const currencyChangeWarning =
	"Amounts will not be converted. Historical expense and plan labels and inheriting account and ledger displays may change. This can change which accounts allow transfers.";

const renderPreview = (
	preview: OperationOutput<"settings.previewCurrency">
) => {
	const before =
		preview.beforeCurrency ??
		(preview.beforeStatus === "unset"
			? "not set (defaults to USD)"
			: "unsupported saved value");
	return [
		`Before: ${before}`,
		`After: ${preview.currency}${preview.changed ? "" : " (already set)"}`,
		...(preview.changed ? [currencyChangeWarning] : []),
		`Edit snapshot: ${preview.editSnapshot}`,
	].join("\n");
};

const assertMatchingSnapshot = (
	provided: string | undefined,
	reviewed: string
): void => {
	if (provided !== undefined && provided !== reviewed) {
		throw new CliError(
			"PREFERRED_CURRENCY_CONFLICT",
			"The preferred currency no longer matches the reviewed request; review a fresh preview"
		);
	}
};

const renderReceipt = (
	result: OperationOutput<"settings.setCurrency">
): string =>
	result.changed
		? `Currency change recorded: ${result.currency}. No amounts converted.\nCheck spendly auth status for the current preference.`
		: `Currency was already set to ${result.currency} for this save.`;

const throwCurrencySaveError = (
	error: unknown,
	options: SetCurrencyOptions,
	expectedEditSnapshot: string,
	idempotencyKey: string
): never => {
	if (
		!(
			error instanceof CliError &&
			error.code === "NETWORK_ERROR" &&
			error.details.outcome === "unknown"
		)
	) {
		throw error;
	}
	const snapshotFlag =
		options.ifEditSnapshot === undefined
			? `--if-edit-snapshot ${expectedEditSnapshot}`
			: "the original --if-edit-snapshot";
	const keyFlag =
		options.idempotencyKey === undefined
			? `--idempotency-key ${idempotencyKey}`
			: "the original --idempotency-key";
	throw new CliError(
		error.code,
		`The currency save outcome is uncertain. Check spendly auth status first. To replay within 30 days, keep the original inputs (including --agent if used) and use --non-interactive with ${snapshotFlag} and ${keyFlag}.`,
		{
			cause: error,
			details: { ...error.details, editSnapshot: expectedEditSnapshot },
			retryable: error.retryable,
		}
	);
};

export const runSetCurrency = async (
	code: string,
	options: SetCurrencyOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const parsed = preferredCurrencySchema.safeParse(code.trim().toUpperCase());
	if (!parsed.success) {
		throw new CliError(
			"INVALID_INPUT",
			`Use a supported currency code: ${preferredCurrencySchema.options.join(", ")}`
		);
	}
	const input = { currency: parsed.data };
	const snapshot = options.ifEditSnapshot;
	const dryRun = options.dryRun === true;
	if (
		snapshot !== undefined &&
		(dryRun || !editSnapshotPattern.test(snapshot))
	) {
		throw new CliError(
			"INVALID_INPUT",
			"--if-edit-snapshot must come from --dry-run and cannot be combined with it"
		);
	}
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter = await getPrompter(globalOptions, runtime);
	if (!(dryRun || prompter || snapshot)) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive currency changes require --if-edit-snapshot from a reviewed dry run"
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
				"settings.previewCurrency",
				input
			);
			assertMatchingSnapshot(snapshot, preview.editSnapshot);
			expectedEditSnapshot = preview.editSnapshot;
			const human = renderPreview(preview);
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: {
						...preview,
						warnings: preview.changed ? [currencyChangeWarning] : [],
					},
					human,
					meta: { dryRun: true },
					runtime,
				});
				return;
			}
			if (preview.changed) {
				await confirmMutation({
					message: "Change preferred currency?",
					preview: human,
					prompter,
					runtime,
				});
			}
		}
		if (!(expectedEditSnapshot && idempotencyKey)) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Missing snapshot or key for currency save"
			);
		}
		const result = await context.operations
			.invoke("settings.setCurrency", {
				...input,
				expectedEditSnapshot,
				idempotencyKey,
			})
			.catch((error: unknown) =>
				throwCurrencySaveError(
					error,
					options,
					expectedEditSnapshot,
					idempotencyKey
				)
			);
		writeMutationSuccess({
			context,
			data: result,
			human: renderReceipt(result),
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};
