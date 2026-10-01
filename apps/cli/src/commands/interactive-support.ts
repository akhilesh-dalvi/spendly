import type { BackendCommandContext } from "../client/convex-client.js";
import { parseDate } from "../domain/dates.js";
import {
	type Account,
	type AccountType,
	accountSchema,
	accountTypeSchema,
	type Category,
	type Cycle,
	categorySchema,
	cycleSchema,
	type Expense,
	expensePageSchema,
	tagSchema,
} from "../domain/read-schemas.js";
import { CliError } from "../errors.js";
import {
	createAccessiblePrompter,
	shouldUseStaticPrompts,
} from "../input/accessible-prompts.js";
import { createClackPrompter } from "../input/prompts.js";
import {
	type InteractivePrompter,
	PromptCancelledError,
	type PromptOption,
} from "../input/types.js";
import type { ResolvedGlobalOptions } from "../options.js";
import { renderHumanLines } from "../output/human.js";
import type { CliRuntime } from "../runtime.js";
import { queryParsed } from "./mutation-support.js";

const PROMPT_PAGE_SIZE = 50;
const LOAD_MORE = "__spendly_load_more__";
const ENTER_ID = "__spendly_enter_id__";
const NO_VISIBLE_CATEGORIES = "__spendly_no_visible_categories__";

const validationMessage = (operation: () => unknown): string | undefined => {
	try {
		operation();
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : "Invalid value";
	}
};

export function getPrompter(
	globalOptions: ResolvedGlobalOptions,
	runtime: CliRuntime,
	required: true
): Promise<InteractivePrompter>;
export function getPrompter(
	globalOptions: ResolvedGlobalOptions,
	runtime: CliRuntime,
	required?: false
): Promise<InteractivePrompter | undefined>;
export async function getPrompter(
	globalOptions: ResolvedGlobalOptions,
	runtime: CliRuntime,
	required = false
): Promise<InteractivePrompter | undefined> {
	if (
		globalOptions.agent ||
		globalOptions.json ||
		globalOptions.nonInteractive
	) {
		if (required || globalOptions.interactive) {
			throw new CliError(
				"NON_INTERACTIVE_INPUT_REQUIRED",
				"Interactive input is unavailable in agent, JSON, or non-interactive mode"
			);
		}
		return undefined;
	}
	if (runtime.prompter) {
		return runtime.prompter;
	}
	if (
		runtime.promptInput?.isTTY !== true ||
		runtime.promptOutput?.isTTY !== true
	) {
		if (required || globalOptions.interactive) {
			throw new CliError(
				"NON_INTERACTIVE_INPUT_REQUIRED",
				"Interactive input requires a terminal"
			);
		}
		return undefined;
	}
	runtime.prompter = shouldUseStaticPrompts(
		globalOptions.accessible,
		runtime.environment.TERM
	)
		? createAccessiblePrompter({
				input: runtime.promptInput,
				output: runtime.promptOutput,
			})
		: await createClackPrompter({
				color: globalOptions.color,
				input: runtime.promptInput,
				output: runtime.promptOutput,
			});
	return runtime.prompter;
}

export const requirePrompter = (
	prompter: InteractivePrompter | undefined
): InteractivePrompter => {
	if (!prompter) {
		throw new CliError("INTERNAL_ERROR", "Interactive input is unavailable");
	}
	return prompter;
};

export const promptRequiredText = async (options: {
	current?: string;
	globalOptions: ResolvedGlobalOptions;
	message: string;
	parse: (value: string) => unknown;
	runtime: CliRuntime;
}): Promise<string> => {
	if (options.current !== undefined) {
		return options.current;
	}
	const prompter = await getPrompter(
		options.globalOptions,
		options.runtime,
		true
	);
	return await prompter.text({
		message: options.message,
		validate: (value) => validationMessage(() => options.parse(value)),
	});
};

export const promptOptionalText = async (options: {
	current?: string;
	message: string;
	prompter: InteractivePrompter;
}): Promise<string | undefined> => {
	if (options.current !== undefined) {
		return options.current;
	}
	const value = await options.prompter.text({
		message: options.message,
		placeholder: "Leave blank for none",
	});
	return value.trim().length === 0 ? undefined : value;
};

export const promptDate = async (options: {
	current?: string;
	defaultDate: string;
	message: string;
	prompter: InteractivePrompter;
}): Promise<string> => {
	if (options.current !== undefined) {
		return options.current;
	}
	const value = await options.prompter.date({
		initialValue: options.defaultDate,
		message: options.message,
	});
	parseDate(value);
	return value;
};

const requireOptions = <Value extends string>(
	options: PromptOption<Value>[],
	message: string
): PromptOption<Value>[] => {
	if (options.length === 0) {
		throw new CliError("RESOURCE_NOT_FOUND", message);
	}
	return options;
};

export const selectAccount = async (options: {
	accounts?: readonly Account[];
	context: BackendCommandContext;
	include: (account: Account) => boolean;
	message: string;
	prompter: InteractivePrompter;
}): Promise<Account> => {
	const accounts =
		options.accounts ??
		(await queryParsed(
			options.context,
			"accounts.list",
			{ includeArchived: true },
			accountSchema.array()
		));
	const eligible = accounts.filter(options.include);
	const choices = requireOptions(
		eligible.map((account) => ({
			hint: `${account.accountType.name} · ${account.currency} ${account.currentBalance.toFixed(2)}`,
			label: account.name,
			value: account.id,
		})),
		"No eligible accounts are available"
	);
	const id = await options.prompter.select({
		message: options.message,
		options: choices,
		searchable: choices.length > 8,
	});
	const account = eligible.find((candidate) => candidate.id === id);
	if (!account) {
		throw new CliError("INTERNAL_ERROR", "Selected account was not found");
	}
	return account;
};

export const selectAccountType = async (options: {
	context: BackendCommandContext;
	message: string;
	prompter: InteractivePrompter;
}): Promise<AccountType> => {
	const accountTypes = await queryParsed(
		options.context,
		"accountTypes.list",
		{ includeArchived: false },
		accountTypeSchema.array()
	);
	const choices = requireOptions(
		accountTypes
			.filter((accountType) => !accountType.isArchived)
			.map((accountType) => ({
				hint: accountType.balanceNature,
				label: accountType.name,
				value: accountType.id,
			})),
		"No active account types are available"
	);
	const id = await options.prompter.select({
		message: options.message,
		options: choices,
	});
	const accountType = accountTypes.find((candidate) => candidate.id === id);
	if (!accountType) {
		throw new CliError("INTERNAL_ERROR", "Selected account type was not found");
	}
	return accountType;
};

export const selectCycle = async (options: {
	context: BackendCommandContext;
	message: string;
	prompter: InteractivePrompter;
}): Promise<Cycle> => {
	const cycles = await queryParsed(
		options.context,
		"resources.listCycles",
		{},
		cycleSchema.array()
	);
	const choices = requireOptions(
		cycles.map((cycle) => ({
			hint: `${cycle.startDate} to ${cycle.endDateExclusive}`,
			label: cycle.name,
			value: cycle.id,
		})),
		"No expense cycles are available"
	);
	const id = await options.prompter.select({
		message: options.message,
		options: choices,
		searchable: choices.length > 8,
	});
	const cycle = cycles.find((candidate) => candidate.id === id);
	if (!cycle) {
		throw new CliError("INTERNAL_ERROR", "Selected cycle was not found");
	}
	return cycle;
};

export const listVisibleCategories = async (
	context: BackendCommandContext,
	date: string
): Promise<Category[]> => {
	const cycle = await queryParsed(
		context,
		"resources.getCurrentCycle",
		{ date },
		cycleSchema.nullable()
	);
	if (!cycle) {
		return [];
	}
	const categories = await queryParsed(
		context,
		"resources.listCategories",
		{ cycleId: cycle.id },
		categorySchema.array()
	);
	return categories.filter((category) => !category.isHidden);
};

export const selectTags = async (options: {
	context: BackendCommandContext;
	initialIds?: string[];
	message: string;
	prompter: InteractivePrompter;
}): Promise<string[]> => {
	const tags = await queryParsed(
		options.context,
		"resources.listTags",
		{},
		tagSchema.array()
	);
	if (tags.length === 0) {
		return [];
	}
	return await options.prompter.multiselect({
		initialValues: options.initialIds,
		message: options.message,
		options: tags.map((tag) => ({ label: tag.name, value: tag.id })),
		required: false,
		searchable: tags.length > 8,
	});
};

const expenseLabel = (expense: Expense): PromptOption<string> => ({
	hint: `${expense.currency} ${expense.amount.toFixed(2)} · ${expense.account?.name ?? "Unassigned"}`,
	label: `${expense.date} · ${expense.spentOn ?? "No description"}`,
	value: expense.id,
});

export const selectExpenseId = async (options: {
	context: BackendCommandContext;
	message: string;
	prompter: InteractivePrompter;
}): Promise<string> => {
	let cursor: string | undefined;
	for (;;) {
		const page = await queryParsed(
			options.context,
			"expenses.list",
			{ cursor, limit: PROMPT_PAGE_SIZE },
			expensePageSchema
		);
		if (page.items.length === 0 && cursor === undefined) {
			throw new CliError("RESOURCE_NOT_FOUND", "No expenses are available");
		}
		const choices: PromptOption<string>[] = page.items.map(expenseLabel);
		if (page.hasMore && page.nextCursor) {
			choices.push({ label: "Load more expenses", value: LOAD_MORE });
		}
		choices.push({ label: "Enter an expense ID", value: ENTER_ID });
		const selected = await options.prompter.select({
			message: options.message,
			options: choices,
			searchable: page.items.length > 8,
		});
		if (selected === LOAD_MORE && page.nextCursor) {
			cursor = page.nextCursor;
			continue;
		}
		if (selected === ENTER_ID) {
			return await options.prompter.text({
				message: "Expense ID",
				validate: (value) =>
					value.trim().length > 0 ? undefined : "Expense ID is required",
			});
		}
		return selected;
	}
};

export const confirmMutation = async (options: {
	allowEdit?: boolean;
	message: string;
	preview: string;
	prompter: InteractivePrompter | undefined;
	runtime: CliRuntime;
}): Promise<"confirm" | "edit"> => {
	if (!options.prompter) {
		throw new CliError(
			"INTERNAL_ERROR",
			"Interactive confirmation is unavailable"
		);
	}
	options.runtime.stderr.write(
		`${renderHumanLines(options.preview.split("\n"), {
			columns: options.runtime.promptOutput?.columns,
		})}\n`
	);
	if (options.allowEdit) {
		const action = await options.prompter.select({
			initialValue: "confirm",
			message: options.message,
			options: [
				{ label: "Apply changes", value: "confirm" },
				{ label: "Edit answers", value: "edit" },
				{ label: "Cancel", value: "cancel" },
			],
		});
		if (action === "cancel") {
			throw new PromptCancelledError();
		}
		return action;
	}
	const confirmed = await options.prompter.confirm({
		initialValue: false,
		message: options.message,
	});
	if (!confirmed) {
		throw new PromptCancelledError();
	}
	return "confirm";
};

export const selectCategoryMode = async (options: {
	categories: readonly Category[];
	message: string;
	prompter: InteractivePrompter;
	withKeep?: boolean;
}): Promise<string> => {
	const choices: PromptOption<string>[] = [];
	if (options.withKeep) {
		choices.push({ label: "Keep current category", value: "keep" });
	}
	choices.push(
		...options.categories.map((category) => ({
			hint: category.categoryType?.name ?? "No type",
			label: category.name,
			value: category.id,
		}))
	);
	if (options.categories.length === 0) {
		choices.push({
			disabled: true,
			hint: "The selected date has no cycle with visible categories",
			label: "No visible categories for this date",
			value: NO_VISIBLE_CATEGORIES,
		});
	}
	choices.push({ label: "Uncategorized", value: "clear" });
	return await options.prompter.select({
		message: options.message,
		options: choices,
		searchable: choices.length > 10,
	});
};

export const selectAccountMode = async (options: {
	accounts: readonly Account[];
	message: string;
	prompter: InteractivePrompter;
	withAutomatic?: boolean;
	withKeep?: boolean;
}): Promise<string> => {
	const choices: PromptOption<string>[] = [];
	if (options.withKeep) {
		choices.push({ label: "Keep current account", value: "keep" });
	}
	if (options.withAutomatic) {
		choices.push({
			label: "Use the default account automatically",
			value: "automatic",
		});
	}
	choices.push({ label: "Leave unassigned", value: "clear" });
	choices.push(
		...options.accounts
			.filter((account) => !account.isArchived)
			.map((account) => ({
				hint: `${account.currency} ${account.currentBalance.toFixed(2)}`,
				label: account.name,
				value: account.id,
			}))
	);
	return await options.prompter.select({
		message: options.message,
		options: choices,
		searchable: choices.length > 10,
	});
};
