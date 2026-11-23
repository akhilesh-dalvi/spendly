import type { Command } from "commander";
import type { OperationOutput } from "../core/operations.js";
import { resolveIdempotencyKey } from "../domain/mutation-input.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import type { CliRuntime } from "../runtime.js";
import { confirmMutation, getPrompter } from "./interactive-support.js";
import { withBackend, writeMutationSuccess } from "./mutation-support.js";

interface CategoryAddOptions {
	categoryTypeId?: string;
	cycleId: string;
	dryRun?: boolean;
	icon?: string;
	idempotencyKey?: string;
	name: string;
	plannedAmount?: string;
}

const decimalPlan = /^\d+(?:\.\d{1,2})?$/u;

const parsePlannedAmount = (value: string): number => {
	const amount = Number(value);
	if (
		!(decimalPlan.test(value) && Number.isFinite(amount)) ||
		amount >= 2 ** 46
	) {
		throw new CliError(
			"INVALID_INPUT",
			"--planned-amount must be a nonnegative decimal with up to two decimal places within the supported range"
		);
	}
	return amount;
};

const terminalText = (value: string): string =>
	value.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ");

const renderCategory = (
	category:
		| OperationOutput<"categories.create">
		| OperationOutput<"categories.previewCreate">
): string => {
	const cycle =
		"cycleName" in category
			? `${terminalText(category.cycleName)} (${category.cycleId})`
			: category.cycleId;
	return [
		`Name: ${category.name}`,
		`Cycle: ${cycle}`,
		`Planned amount: ${category.plannedAmount ?? "None"}`,
		...(category.icon ? [`Icon: ${category.icon}`] : []),
		...(category.categoryType
			? [
					`Type: ${terminalText(category.categoryType.name)} (${category.categoryType.id})`,
				]
			: []),
		...("id" in category ? [`ID: ${category.id}`] : []),
	].join("\n");
};

export const runCategoryAdd = async (
	options: CategoryAddOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const input = {
		...(options.categoryTypeId === undefined
			? {}
			: { categoryTypeId: options.categoryTypeId }),
		cycleId: options.cycleId,
		...(options.icon === undefined ? {} : { icon: options.icon }),
		name: options.name,
		...(options.plannedAmount === undefined
			? {}
			: { plannedAmount: parsePlannedAmount(options.plannedAmount) }),
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
			const proposal = await context.operations.invoke(
				"categories.previewCreate",
				input
			);
			const human = renderCategory(proposal);
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: proposal,
					human,
					meta: { dryRun: true },
					runtime,
				});
				return;
			}
			await confirmMutation({
				message: "Create this category?",
				preview: human,
				prompter,
				runtime,
			});
		}
		if (!idempotencyKey) {
			throw new CliError("INTERNAL_ERROR", "Missing key for category creation");
		}
		const category = await context.operations
			.invoke("categories.create", { ...input, idempotencyKey })
			.catch((error: unknown) => {
				if (
					options.idempotencyKey === undefined &&
					error instanceof CliError &&
					error.code === "NETWORK_ERROR" &&
					error.details.outcome === "unknown"
				) {
					throw new CliError(
						error.code,
						`The category save outcome is uncertain. If retrying, use the same inputs with --non-interactive --idempotency-key ${idempotencyKey}`,
						{ cause: error, details: error.details, retryable: error.retryable }
					);
				}
				throw error;
			});
		writeMutationSuccess({
			context,
			data: category,
			human: `Created category\n${renderCategory(category)}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};
