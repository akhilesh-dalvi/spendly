import type { Command } from "commander";
import type { BackendCommandContext } from "../client/convex-client.js";
import type { OperationInput } from "../core/operations.js";
import {
	cycleCreateResultSchema,
	cycleDeletePreviewSchema,
	cycleDeleteResultSchema,
	cycleDetailSchema,
	cycleProposalSchema,
	cycleUpdatePreviewSchema,
} from "../domain/cycle-schemas.js";
import { parseDate } from "../domain/dates.js";
import {
	parseRevision,
	resolveIdempotencyKey,
	validateMutationText,
} from "../domain/mutation-input.js";
import { categorySchema, cycleSchema } from "../domain/read-schemas.js";
import { CliError } from "../errors.js";
import type { InteractivePrompter } from "../input/types.js";
import { resolveGlobalOptions } from "../options.js";
import { renderCycle } from "../output/read-terminal.js";
import type { CliRuntime } from "../runtime.js";
import {
	confirmMutation,
	getPrompter,
	promptRequiredText,
	selectCycle,
} from "./interactive-support.js";
import {
	commitParsed,
	mutationParsed,
	queryParsed,
	withBackend,
	writeMutationSuccess,
} from "./mutation-support.js";

const resolveCycleOptions = (command: Command, runtime: CliRuntime) => {
	const options = resolveGlobalOptions(command, runtime.environment);
	return {
		...options,
		nonInteractive: options.nonInteractive || options.json || options.agent,
	};
};

const commitCycleParsed = async <Output>(
	options: Parameters<typeof commitParsed<Output>>[0]
): Promise<Output> => {
	try {
		return await commitParsed(options);
	} catch (error) {
		if (!(error instanceof CliError) || error.code !== "NETWORK_ERROR") {
			throw error;
		}
		const recovery = {
			operation: options.name,
			input: options.args,
			agent: options.context.globalOptions.agent,
		};
		throw new CliError(
			error.code,
			`${error.message}\nAfter checking current state and explicitly choosing recovery, repeat the original resolved inputs with --non-interactive (same agent mode):\n${JSON.stringify(recovery)}`,
			{
				cause: error,
				details: { ...error.details, recovery },
				retryable: error.retryable,
			}
		);
	}
};

const resolveCycleId = async (
	id: string | undefined,
	command: Command,
	runtime: CliRuntime,
	context: Parameters<typeof queryParsed>[0]
): Promise<string> => {
	if (id !== undefined) {
		return id;
	}
	const prompter = await getPrompter(
		resolveGlobalOptions(command, runtime.environment),
		runtime,
		true
	);
	return (
		await selectCycle({ context, message: "Choose an expense cycle", prompter })
	).id;
};

interface CycleAddOptions {
	name?: string;
	startDate?: string;
	endDateExclusive?: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	withoutCategories?: boolean;
	copyFromCycleId?: string;
	ifCopySnapshot?: string;
	copyCategoryId?: string[];
	includePlannedAmounts?: boolean;
	plannedAmount?: string[];
	clearPlannedAmount?: string[];
}

const requiredName = (name: string): string => {
	validateMutationText(name, "--name");
	return name.trim();
};

const PLANNED_AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/u;
const COPY_SNAPSHOT_PATTERN = /^[a-f0-9]{64}$/u;

const resolvePlannedOverrides = (options: CycleAddOptions) => {
	const overrides: Array<{ id: string; plannedAmount?: number }> = [];
	const seen = new Set<string>();
	for (const entry of options.plannedAmount ?? []) {
		const separator = entry.indexOf("=");
		const id = entry.slice(0, separator).trim();
		const value = entry.slice(separator + 1);
		const amount = Number(value);
		if (
			separator < 1 ||
			!id ||
			!PLANNED_AMOUNT_PATTERN.test(value) ||
			!Number.isFinite(amount)
		) {
			throw new CliError(
				"INVALID_INPUT",
				"--planned-amount must use CATEGORY_ID=NONNEGATIVE_AMOUNT"
			);
		}
		if (seen.has(id)) {
			throw new CliError(
				"INVALID_INPUT",
				"Only one planned override is allowed per category"
			);
		}
		seen.add(id);
		overrides.push({ id, plannedAmount: amount });
	}
	for (const id of options.clearPlannedAmount ?? []) {
		if (!id.trim() || seen.has(id)) {
			throw new CliError(
				"INVALID_INPUT",
				"Only one planned override is allowed per category"
			);
		}
		seen.add(id);
		overrides.push({ id });
	}
	return overrides;
};

const resolveCopyInput = (options: CycleAddOptions) => {
	const overrides = resolvePlannedOverrides(options);
	const hasSelections = (options.copyCategoryId?.length ?? 0) > 0;
	if (
		!options.copyFromCycleId &&
		(hasSelections || options.includePlannedAmounts || overrides.length > 0)
	) {
		throw new CliError(
			"INVALID_INPUT",
			"Category copy options require --copy-from-cycle-id"
		);
	}
	return {
		...(options.copyFromCycleId === undefined
			? {}
			: { copyFromCycleId: options.copyFromCycleId }),
		...(options.withoutCategories ? { copyCategoryIds: [] } : {}),
		...(hasSelections
			? { copyCategoryIds: [...new Set(options.copyCategoryId)] }
			: {}),
		...(options.includePlannedAmounts === undefined
			? {}
			: { includePlannedAmounts: options.includePlannedAmounts }),
		...(overrides.length > 0 ? { categoryPlannedOverrides: overrides } : {}),
	};
};

type CycleCopyInput = Pick<
	OperationInput<"cycles.previewCreate">,
	| "copyFromCycleId"
	| "copyCategoryIds"
	| "includePlannedAmounts"
	| "categoryPlannedOverrides"
>;

const promptCategoryPlan = async (
	category: import("../domain/read-schemas.js").Category,
	prefill: boolean,
	prompter: InteractivePrompter
): Promise<{ id: string; plannedAmount?: number }> => {
	const plannedAmount = prefill
		? (category.plannedAmount ?? undefined)
		: undefined;
	const mode = await prompter.select({
		message: `Planned amount for ${category.name}`,
		initialValue: "keep",
		options: [
			{ label: `Keep ${plannedAmount ?? "no planned amount"}`, value: "keep" },
			{ label: "Set a planned amount", value: "set" },
			{ label: "Clear the planned amount", value: "clear" },
		],
	});
	if (mode === "keep") {
		return {
			id: category.id,
			...(plannedAmount === undefined ? {} : { plannedAmount }),
		};
	}
	if (mode === "clear") {
		return { id: category.id };
	}
	const value = await prompter.text({
		message: `Planned amount for ${category.name} (blank clears)`,
		validate: (amount) =>
			amount === "" ||
			(PLANNED_AMOUNT_PATTERN.test(amount) && Number.isFinite(Number(amount)))
				? undefined
				: "Enter a nonnegative decimal amount, or leave blank",
	});
	if (
		value !== "" &&
		!(PLANNED_AMOUNT_PATTERN.test(value) && Number.isFinite(Number(value)))
	) {
		throw new CliError(
			"INVALID_INPUT",
			"Planned amounts must be nonnegative decimals"
		);
	}
	return {
		id: category.id,
		...(value === "" ? {} : { plannedAmount: Number(value) }),
	};
};

const promptCopyCategoryIds = async (
	categories: import("../domain/read-schemas.js").Category[],
	prompter: InteractivePrompter
): Promise<string[]> => {
	if (categories.length === 0) {
		return [];
	}
	const mode = await prompter.select({
		message: "Categories to copy",
		initialValue: "all",
		options: [
			{ label: "Copy all categories", value: "all" },
			{ label: "Choose a subset", value: "subset" },
			{ label: "Copy no categories", value: "none" },
		],
	});
	if (mode === "all") {
		return categories.map((category) => category.id);
	}
	if (mode === "none") {
		return [];
	}
	return await prompter.multiselect({
		message: "Categories to copy (none is allowed)",
		initialValues: [],
		options: categories.map((category) => ({
			label: category.name,
			hint: category.isHidden ? "Hidden" : undefined,
			value: category.id,
		})),
		required: false,
	});
};

const promptCopyInput = async (
	context: BackendCommandContext,
	input: CycleCopyInput,
	prompter: InteractivePrompter
): Promise<CycleCopyInput> => {
	const copyInput = { ...input };
	if (!copyInput.copyFromCycleId) {
		const cycles = await queryParsed(
			context,
			"resources.listCycles",
			{},
			cycleSchema.array()
		);
		const source = await prompter.select({
			message: "Copy categories from a cycle?",
			initialValue: "none",
			options: [
				{ label: "Do not copy categories", value: "none" },
				...cycles.map((cycle) => ({
					label: cycle.name,
					hint: `${cycle.startDate} to ${cycle.endDateExclusive} (exclusive)`,
					value: cycle.id,
				})),
			],
		});
		if (source === "none") {
			return copyInput;
		}
		copyInput.copyFromCycleId = source;
	}
	const categories = await queryParsed(
		context,
		"resources.listCategories",
		{ cycleId: copyInput.copyFromCycleId },
		categorySchema.array()
	);
	if (copyInput.copyCategoryIds === undefined) {
		copyInput.copyCategoryIds = await promptCopyCategoryIds(
			categories,
			prompter
		);
	}
	if (copyInput.copyCategoryIds.length === 0) {
		return copyInput;
	}
	copyInput.includePlannedAmounts ??= await prompter.confirm({
		message: "Prefill source planned amounts?",
		initialValue: false,
	});
	const overrides = [...(copyInput.categoryPlannedOverrides ?? [])];
	const existingOverrideIds = new Set(overrides.map((override) => override.id));
	for (const category of categories) {
		if (
			!copyInput.copyCategoryIds.includes(category.id) ||
			existingOverrideIds.has(category.id)
		) {
			continue;
		}
		overrides.push(
			await promptCategoryPlan(
				category,
				copyInput.includePlannedAmounts,
				prompter
			)
		);
	}
	copyInput.categoryPlannedOverrides = overrides;
	return copyInput;
};

// Keep guided payloads flag-representable and stable for idempotent recovery.
const normalizeCopyInput = (input: CycleCopyInput): CycleCopyInput => {
	const { includePlannedAmounts, categoryPlannedOverrides, ...selection } =
		input;
	const copiesNone = input.copyCategoryIds?.length === 0;
	return {
		...selection,
		...(selection.copyCategoryIds === undefined
			? {}
			: { copyCategoryIds: [...selection.copyCategoryIds].sort() }),
		...(!copiesNone && includePlannedAmounts
			? { includePlannedAmounts: true }
			: {}),
		...(!copiesNone &&
		categoryPlannedOverrides &&
		categoryPlannedOverrides.length > 0
			? {
					categoryPlannedOverrides: [...categoryPlannedOverrides].sort(
						(left, right) => left.id.localeCompare(right.id)
					),
				}
			: {}),
	};
};

const renderCycleProposal = (
	proposal: import("zod").z.infer<typeof cycleProposalSchema>
): string =>
	[
		`Name: ${proposal.name}`,
		`Dates: ${proposal.startDate} to ${proposal.endDateExclusive} (exclusive)`,
		`Categories to copy: ${proposal.copiedCategories.length}`,
		...(proposal.copySnapshot
			? [`Copy snapshot: ${proposal.copySnapshot}`]
			: []),
		...proposal.copiedCategories.map(
			(category) =>
				`  ${category.name}: ${category.plannedAmount ?? "No planned amount"}`
		),
	].join("\n");

const resolveReviewedCopySnapshot = (
	copyFromCycleId: string | undefined,
	expectedCopySnapshot: string | undefined,
	proposal: import("zod").z.infer<typeof cycleProposalSchema>
): string | undefined => {
	if (!copyFromCycleId) {
		return undefined;
	}
	if (!proposal.copySnapshot) {
		throw new CliError(
			"INTERNAL_ERROR",
			"The backend did not return a category-copy snapshot"
		);
	}
	if (
		expectedCopySnapshot !== undefined &&
		expectedCopySnapshot !== proposal.copySnapshot
	) {
		throw new CliError(
			"CYCLE_COPY_CONFLICT",
			"The category copy changed after preview; review a fresh preview"
		);
	}
	return expectedCopySnapshot ?? proposal.copySnapshot;
};

export const runCycleAdd = async (
	options: CycleAddOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	if (
		options.ifCopySnapshot !== undefined &&
		(!options.copyFromCycleId ||
			options.dryRun ||
			!COPY_SNAPSHOT_PATTERN.test(options.ifCopySnapshot))
	) {
		throw new CliError(
			"INVALID_INPUT",
			"--if-copy-snapshot requires a copy source and a snapshot from --dry-run; do not combine it with --dry-run"
		);
	}
	const globalOptions = resolveCycleOptions(command, runtime);
	const prompt = async (
		current: string | undefined,
		message: string,
		parse: (value: string) => unknown
	): Promise<string> =>
		await promptRequiredText({
			current,
			globalOptions,
			message,
			parse,
			runtime,
		});
	const name = requiredName(
		await prompt(options.name, "Cycle name", requiredName)
	);
	const startDate = parseDate(
		await prompt(
			options.startDate,
			"Start date (inclusive, YYYY-MM-DD)",
			parseDate
		)
	);
	const endDateExclusive = parseDate(
		await prompt(
			options.endDateExclusive,
			"End date (exclusive, YYYY-MM-DD)",
			parseDate
		)
	);
	if (startDate >= endDateExclusive) {
		throw new CliError(
			"INVALID_INPUT",
			"The start date must precede the exclusive end date"
		);
	}
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	const prompter = await getPrompter(globalOptions, runtime);
	const copyInput = resolveCopyInput(options);
	const guided =
		globalOptions.interactive ||
		options.name === undefined ||
		options.startDate === undefined ||
		options.endDateExclusive === undefined;
	await withBackend(command, runtime, async (context) => {
		const resolvedCopy =
			guided && prompter && !options.withoutCategories
				? await promptCopyInput(context, copyInput, prompter)
				: copyInput;
		const input = {
			name,
			startDate,
			endDateExclusive,
			...normalizeCopyInput(resolvedCopy),
		};
		let expectedCopySnapshot = options.ifCopySnapshot;
		if (
			dryRun ||
			prompter ||
			(input.copyFromCycleId && expectedCopySnapshot === undefined)
		) {
			const proposal = await queryParsed(
				context,
				"cycles.previewCreate",
				input,
				cycleProposalSchema
			);
			expectedCopySnapshot = resolveReviewedCopySnapshot(
				input.copyFromCycleId,
				expectedCopySnapshot,
				proposal
			);
			const human = renderCycleProposal(proposal);
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
			if (prompter) {
				await confirmMutation({
					message: "Create this cycle?",
					preview: human,
					prompter,
					runtime,
				});
			}
		}
		const result = await commitCycleParsed({
			context,
			args: {
				...input,
				...(expectedCopySnapshot === undefined ? {} : { expectedCopySnapshot }),
				idempotencyKey,
			},
			name: "cycles.create",
			schema: cycleCreateResultSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: `Created cycle\n${renderCycle(result.cycle)}\nCategories copied: ${result.copiedCategories.length}`,
			meta: { dryRun: false, idempotencyKey },
			runtime,
		});
	});
};

interface CycleEditOptions {
	name?: string;
	startDate?: string;
	endDateExclusive?: string;
	ifRevision?: string;
	idempotencyKey?: string;
	dryRun?: boolean;
}

export const runCycleEdit = async (
	cycleId: string | undefined,
	options: CycleEditOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const fields = {
		...(options.name === undefined ? {} : { name: requiredName(options.name) }),
		...(options.startDate === undefined
			? {}
			: { startDate: parseDate(options.startDate) }),
		...(options.endDateExclusive === undefined
			? {}
			: { endDateExclusive: parseDate(options.endDateExclusive) }),
	};
	const globalOptions = resolveCycleOptions(command, runtime);
	const dryRun = options.dryRun === true;
	const hasFields = Object.keys(fields).length > 0;
	const prompter = hasFields
		? await getPrompter(globalOptions, runtime)
		: await getPrompter(globalOptions, runtime, true);
	let expectedRevision =
		options.ifRevision === undefined
			? undefined
			: parseRevision(options.ifRevision);
	if (
		globalOptions.nonInteractive &&
		!dryRun &&
		expectedRevision === undefined
	) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive editing requires --if-revision"
		);
	}
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	await withBackend(command, runtime, async (context) => {
		const id = await resolveCycleId(cycleId, command, runtime, context);
		if (!hasFields || (!dryRun && expectedRevision === undefined)) {
			const before = await queryParsed(
				context,
				"cycles.get",
				{ cycleId: id },
				cycleDetailSchema
			);
			expectedRevision ??= before.revision;
			if (!hasFields && prompter) {
				fields.name = requiredName(
					await prompter.text({
						message: "Cycle name",
						initialValue: before.name,
					})
				);
				fields.startDate = parseDate(
					await prompter.date({
						message: "Start date (inclusive)",
						initialValue: before.startDate,
					})
				);
				fields.endDateExclusive = parseDate(
					await prompter.date({
						message: "End date (exclusive)",
						initialValue: before.endDateExclusive,
					})
				);
			}
		}
		const input = { ...fields, cycleId: id, expectedRevision };
		if (dryRun || prompter) {
			const preview = await queryParsed(
				context,
				"cycles.previewUpdate",
				input,
				cycleUpdatePreviewSchema
			);
			const human = `Before\n${renderCycle(preview.before)}\nAfter\n${renderCycle(preview.after)}\nExisting expenses will not be reassigned.`;
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: preview,
					human,
					meta: { dryRun: true, expectedRevision: preview.before.revision },
					runtime,
				});
				return;
			}
			await confirmMutation({
				message: "Save these cycle changes?",
				preview: human,
				prompter,
				runtime,
			});
		}
		const result = await commitCycleParsed({
			context,
			args: { ...input, idempotencyKey },
			name: "cycles.update",
			schema: cycleDetailSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: `Updated cycle\n${renderCycle(result)}\nRevision: ${result.revision}\nExisting expenses were not reassigned.`,
			meta: { dryRun: false, expectedRevision, idempotencyKey },
			runtime,
		});
	});
};

interface CycleDeleteOptions {
	confirmationToken?: string;
	ifRevision?: string;
	idempotencyKey?: string;
	dryRun?: boolean;
}

const renderDeletionPreview = (
	preview: import("zod").z.infer<typeof cycleDeletePreviewSchema>
): string =>
	`${renderCycle(preview.cycle)}\nRevision: ${preview.cycle.revision}\nPermanently deletes ${preview.categoryCount} categories.\nCycles with expenses cannot be deleted.\nConfirmation token: ${preview.confirmationToken}\nExpires: ${preview.expiresAt}`;

export const runCycleDelete = async (
	cycleId: string | undefined,
	options: CycleDeleteOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	if (
		options.dryRun &&
		(options.confirmationToken !== undefined ||
			options.ifRevision !== undefined)
	) {
		throw new CliError(
			"INVALID_INPUT",
			"--dry-run creates a new confirmation; do not provide a token or revision"
		);
	}
	const globalOptions = resolveCycleOptions(command, runtime);
	const dryRun = options.dryRun === true;
	let expectedRevision =
		options.ifRevision === undefined
			? undefined
			: parseRevision(options.ifRevision);
	let confirmationToken = options.confirmationToken;
	if ((confirmationToken !== undefined) !== (expectedRevision !== undefined)) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide both --confirmation-token and --if-revision"
		);
	}
	if (
		globalOptions.nonInteractive &&
		!dryRun &&
		!(confirmationToken && expectedRevision)
	) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive deletion requires --confirmation-token, --if-revision, and --idempotency-key"
		);
	}
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	const prompter =
		dryRun || globalOptions.nonInteractive
			? undefined
			: await getPrompter(globalOptions, runtime, true);
	await withBackend(command, runtime, async (context) => {
		const id = await resolveCycleId(cycleId, command, runtime, context);
		if (dryRun || !(confirmationToken || expectedRevision)) {
			const preview = await mutationParsed({
				context,
				name: "cycles.previewDelete",
				args: { cycleId: id },
				schema: cycleDeletePreviewSchema,
			});
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: preview,
					human: renderDeletionPreview(preview),
					meta: { dryRun: true },
					runtime,
				});
				return;
			}
			confirmationToken = preview.confirmationToken;
			expectedRevision = preview.cycle.revision;
			await confirmMutation({
				message: "Permanently delete this cycle and its categories?",
				preview: renderDeletionPreview(preview),
				prompter,
				runtime,
			});
		} else if (prompter) {
			const cycle = await queryParsed(
				context,
				"cycles.get",
				{ cycleId: id },
				cycleDetailSchema
			);
			await confirmMutation({
				message: "Permanently delete this cycle and all its categories?",
				preview: renderCycle(cycle),
				prompter,
				runtime,
			});
		}
		const result = await commitCycleParsed({
			context,
			name: "cycles.remove",
			args: {
				cycleId: id,
				expectedRevision,
				confirmationToken,
				idempotencyKey,
			},
			schema: cycleDeleteResultSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: `Deleted cycle: ${result.cycle.name}\nCategories deleted: ${result.deletedCategoryCount}`,
			meta: { dryRun: false, expectedRevision, idempotencyKey },
			runtime,
		});
	});
};

export const runCycleGet = async (
	cycleId: string | undefined,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	await withBackend(command, runtime, async (context) => {
		const id = await resolveCycleId(cycleId, command, runtime, context);
		const cycle = await queryParsed(
			context,
			"cycles.get",
			{ cycleId: id },
			cycleDetailSchema
		);
		writeMutationSuccess({
			context,
			data: cycle,
			human: `${renderCycle(cycle)}\nRevision: ${cycle.revision}`,
			meta: {},
			runtime,
		});
	});
};
