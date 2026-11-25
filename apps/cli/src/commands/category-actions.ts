import type { Command } from "commander";
import type { OperationOutput } from "../core/operations.js";
import {
	parsePreferredCurrencyGuard,
	preferredCurrencyCommitFields,
	resolveIdempotencyKey,
} from "../domain/mutation-input.js";
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
	ifPreferredCurrency?: string;
	name: string;
	plannedAmount?: string;
}

const decimalPlan = /^\d+(?:\.\d{1,2})?$/u;
const editSnapshotPattern = /^[a-f0-9]{64}$/u;

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

type RenderedCategory = Pick<
	OperationOutput<"categories.create">,
	"categoryType" | "cycleId" | "icon" | "name"
> & {
	cycleName?: string;
	id?: string;
	plannedAmount: OperationOutput<"categories.previewEdit">["before"]["plannedAmount"];
	preferredCurrency?: string;
};

const renderCategory = (
	category: RenderedCategory,
	showUnset = false
): string => {
	const cycle =
		category.cycleName === undefined
			? category.cycleId
			: `${terminalText(category.cycleName)} (${category.cycleId})`;
	const type = category.categoryType
		? `${terminalText(category.categoryType.name)} (${category.categoryType.id})`
		: "None";
	let plan = "None";
	if (typeof category.plannedAmount === "string") {
		plan = `Invalid (${category.plannedAmount})`;
	} else if (typeof category.plannedAmount === "number") {
		plan = category.preferredCurrency
			? `${category.plannedAmount} ${terminalText(category.preferredCurrency)}`
			: String(category.plannedAmount);
	}
	return [
		`Name: ${terminalText(category.name)}`,
		`Cycle: ${cycle}`,
		`Planned amount: ${plan}`,
		...(category.icon || showUnset
			? [`Icon: ${category.icon ? terminalText(category.icon) : "None"}`]
			: []),
		...(category.categoryType || showUnset ? [`Type: ${type}`] : []),
		...(category.id === undefined ? [] : [`ID: ${category.id}`]),
	].join("\n");
};

const throwCategoryCreateError = (
	error: unknown,
	input: {
		addCurrencyFlag: boolean;
		generatedKey?: string;
	}
): never => {
	if (
		!(error instanceof CliError) ||
		error.code !== "NETWORK_ERROR" ||
		error.details.outcome !== "unknown"
	) {
		throw error;
	}
	const keyFlag = input.generatedKey
		? ` --idempotency-key ${input.generatedKey}`
		: " and the original --idempotency-key";
	let currencyFlag = "";
	if (input.addCurrencyFlag) {
		const { expectedPreferredCurrency } = error.details;
		currencyFlag =
			typeof expectedPreferredCurrency === "string"
				? ` --if-preferred-currency ${expectedPreferredCurrency}`
				: " and --if-preferred-currency from the original preview";
	}
	throw new CliError(
		error.code,
		`The category save outcome is uncertain. Check the cycle's category list first. If replaying, keep the original inputs and use --non-interactive${keyFlag}${currencyFlag}.`,
		{ cause: error, details: error.details, retryable: error.retryable }
	);
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
	const expectedCurrency =
		options.ifPreferredCurrency === undefined
			? undefined
			: parsePreferredCurrencyGuard(options.ifPreferredCurrency);
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
		let currencyGuard = preferredCurrencyCommitFields(expectedCurrency);
		if (dryRun || prompter) {
			const proposal = await context.operations.invoke(
				"categories.previewCreate",
				input
			);
			currencyGuard = preferredCurrencyCommitFields(
				expectedCurrency,
				input.plannedAmount === undefined
					? undefined
					: proposal.preferredCurrency
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
			.invoke("categories.create", {
				...input,
				...currencyGuard,
				idempotencyKey,
			})
			.catch((error: unknown) =>
				throwCategoryCreateError(error, {
					addCurrencyFlag:
						expectedCurrency === undefined &&
						currencyGuard.expectedPreferredCurrency !== undefined,
					generatedKey:
						options.idempotencyKey === undefined ? idempotencyKey : undefined,
				})
			);
		writeMutationSuccess({
			context,
			data: category,
			human: `Created category\n${renderCategory(category)}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};

interface CategoryEditOptions
	extends Partial<Omit<CategoryAddOptions, "cycleId" | "ifPreferredCurrency">> {
	clearCategoryType?: boolean;
	clearPlannedAmount?: boolean;
	ifEditSnapshot?: string;
}

const categoryEditInput = (
	categoryId: string,
	options: CategoryEditOptions
) => {
	const {
		categoryTypeId,
		clearCategoryType,
		clearPlannedAmount,
		icon,
		name,
		plannedAmount,
	} = options;
	const type = clearCategoryType ? null : categoryTypeId;
	const amount =
		plannedAmount === undefined ? undefined : parsePlannedAmount(plannedAmount);
	const plan = clearPlannedAmount ? null : amount;
	if ([type, icon, name, plan].every((field) => field === undefined)) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide at least one category field to edit"
		);
	}
	return {
		categoryId,
		...(type === undefined ? {} : { categoryTypeId: type }),
		...(icon === undefined ? {} : { icon }),
		...(name === undefined ? {} : { name }),
		...(plan === undefined ? {} : { plannedAmount: plan }),
	};
};

const renderCategoryEdit = (
	preview: OperationOutput<"categories.previewEdit">
): string =>
	[
		"Before",
		renderCategory(
			{
				...preview.before,
				cycleName: preview.cycleName,
				preferredCurrency: preview.preferredCurrency,
			},
			true
		),
		"After",
		renderCategory(
			{
				...preview.after,
				cycleName: preview.cycleName,
				preferredCurrency: preview.preferredCurrency,
			},
			true
		),
		"Existing expenses will remain linked to this category.",
		`Edit snapshot: ${preview.editSnapshot}`,
	].join("\n");

export const runCategoryEdit = async (
	categoryId: string,
	options: CategoryEditOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const input = categoryEditInput(categoryId, options);
	const dryRun = options.dryRun === true;
	const snapshot = options.ifEditSnapshot;
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
			"Non-interactive category edits require --if-edit-snapshot from a reviewed dry run"
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
				"categories.previewEdit",
				input
			);
			if (snapshot !== undefined && snapshot !== preview.editSnapshot) {
				throw new CliError(
					"CATEGORY_EDIT_CONFLICT",
					"The category edit no longer matches the reviewed preview"
				);
			}
			expectedEditSnapshot = preview.editSnapshot;
			const human = renderCategoryEdit(preview);
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
				message: "Save these category changes?",
				preview: human,
				prompter,
				runtime,
			});
		}
		if (!(expectedEditSnapshot && idempotencyKey)) {
			throw new CliError(
				"INTERNAL_ERROR",
				"Missing snapshot or key for category edit"
			);
		}
		const category = await context.operations
			.invoke("categories.edit", {
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
							? ` --if-edit-snapshot ${expectedEditSnapshot}`
							: "";
					const keyFlag =
						options.idempotencyKey === undefined
							? ` --idempotency-key ${idempotencyKey}`
							: "";
					throw new CliError(
						error.code,
						`The category save outcome is uncertain. Check the category first. If replaying, keep the original inputs and use --non-interactive${snapshotFlag}${keyFlag}.`,
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
			data: category,
			human: `Updated category\n${renderCategory(category, true)}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};
