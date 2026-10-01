import type { Readable, Writable } from "node:stream";
import type {
	InteractivePrompter,
	MultiSelectPromptOptions,
	PromptOption,
	SelectPromptOptions,
	TextPromptOptions,
} from "./types.js";
import { PromptCancelledError } from "./types.js";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

type PromptState =
	| "active"
	| "cancel"
	| "error"
	| "initial"
	| "submit"
	| "validating";

const toLocalDate = (value: string): Date | undefined => {
	const match = DATE_PATTERN.exec(value);
	if (!match) {
		return undefined;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return undefined;
	}
	return date;
};

const fromLocalDate = (date: Date): string => {
	const year = String(date.getUTCFullYear()).padStart(4, "0");
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const renderMultiSelectSummary = <Value extends string>(
	choices: PromptOption<Value>[],
	values: readonly Value[]
): string => {
	const labels = choices
		.filter((choice) => values.includes(choice.value))
		.map((choice) => choice.label);
	return labels.length > 0 ? labels.join(", ") : "None";
};

const renderMultiSelectChoices = <Value extends string>(options: {
	choices: PromptOption<Value>[];
	focusedValue?: Value;
	selectedValues: readonly Value[];
}): string =>
	options.choices
		.map((choice) => {
			const focused = choice.value === options.focusedValue;
			const cursor = focused ? "›" : " ";
			const checkbox = options.selectedValues.includes(choice.value)
				? "◼"
				: "◻";
			const hint = focused && choice.hint ? ` (${choice.hint})` : "";
			return `│  ${cursor} ${checkbox} ${choice.label}${hint}`;
		})
		.join("\n");

const renderMultiSelectFrame = <Value extends string>(options: {
	choices: PromptOption<Value>[];
	error?: string;
	focusedValue?: Value;
	message: string;
	search?: string;
	selectedValues: readonly Value[];
	state: PromptState;
}): string => {
	if (options.state === "cancel") {
		return `■  ${options.message}`;
	}
	if (options.state === "submit") {
		return `◇  ${options.message}\n│  ${renderMultiSelectSummary(options.choices, options.selectedValues)}`;
	}
	const search =
		options.search === undefined ? "" : `\n│  Search: ${options.search || "_"}`;
	const counts = `\n│  ${options.choices.length} shown • ${options.selectedValues.length} selected`;
	const validation = options.error ? `\n│  ${options.error}` : "";
	return `│\n◆  ${options.message}${search}\n${renderMultiSelectChoices(options)}${counts}${validation}\n│  ↑/↓ navigate • Space select • Enter confirm • Esc cancel\n└`;
};

const renderSelectSummary = <Value extends string>(
	choices: readonly PromptOption<Value>[],
	value: Value | undefined
): string => choices.find((choice) => choice.value === value)?.label ?? "None";

const renderSelectFrame = <Value extends string>(options: {
	choices: readonly PromptOption<Value>[];
	focusedValue?: Value;
	message: string;
	search?: string;
	state: PromptState;
}): string => {
	if (options.state === "cancel") {
		return `■  ${options.message}`;
	}
	if (options.state === "submit") {
		return `◇  ${options.message}\n│  ${renderSelectSummary(options.choices, options.focusedValue)}`;
	}
	const search =
		options.search === undefined ? "" : `\n│  Search: ${options.search || "_"}`;
	const choices = options.choices
		.map((choice) => {
			const focused = choice.value === options.focusedValue;
			const cursor = focused ? "›" : " ";
			const radio = focused ? "●" : "○";
			const hint = choice.hint ? ` (${choice.hint})` : "";
			const unavailable = choice.disabled ? " (unavailable)" : "";
			return `│  ${cursor} ${radio} ${choice.label}${unavailable}${hint}`;
		})
		.join("\n");
	return `│\n◆  ${options.message}${search}\n${choices}\n│  ↑/↓ navigate • Enter confirm • Esc cancel\n└`;
};

const renderDateFrame = (options: {
	message: string;
	segmentIndex: number;
	state: PromptState;
	values: { day: string; month: string; year: string };
}): string => {
	const segments = [
		options.values.year || "YYYY",
		options.values.month || "MM",
		options.values.day || "DD",
	].map((value, index) =>
		index === options.segmentIndex &&
		!(["cancel", "submit"] as PromptState[]).includes(options.state)
			? `[${value}]`
			: value
	);
	const value = segments.join("-");
	if (options.state === "cancel") {
		return `■  ${options.message}\n│  ${value}`;
	}
	if (options.state === "submit") {
		return `◇  ${options.message}\n│  ${value}`;
	}
	return `│\n◆  ${options.message}\n│  ${value}\n│  ←/→ field • ↑/↓ change • Enter confirm • Esc cancel\n└`;
};

export const createClackPrompter = async (options: {
	color: boolean;
	input: Readable;
	output: Writable;
}): Promise<InteractivePrompter> => {
	if (!options.color) {
		process.env.NO_COLOR ??= "1";
	}
	const clack = await import("@clack/prompts");
	const clackCore = await import("@clack/core");
	const unwrap = <Value>(value: Value | typeof clack.CANCEL_SYMBOL): Value => {
		if (clack.isCancel(value)) {
			throw new PromptCancelledError();
		}
		return value as Value;
	};
	const streams = { input: options.input, output: options.output };
	const mapOptions = <Value extends string>(choices: PromptOption<Value>[]) =>
		choices.map((choice) => ({ ...choice }));
	const multiselect = async <Value extends string>(
		promptOptions: MultiSelectPromptOptions<Value>
	): Promise<Value[]> => {
		if (promptOptions.searchable) {
			const prompt = new clackCore.AutocompletePrompt<PromptOption<Value>>({
				filter: (search, choice) =>
					choice.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
				initialValue: promptOptions.initialValues,
				input: options.input,
				multiple: true,
				options: mapOptions(promptOptions.options),
				output: options.output,
				render() {
					return renderMultiSelectFrame({
						choices: this.filteredOptions,
						error: this.error,
						focusedValue: this.focusedValue,
						message: promptOptions.message,
						search: this.userInput,
						selectedValues: this.selectedValues,
						state: this.state,
					});
				},
				validate: (values) =>
					promptOptions.required &&
					(!Array.isArray(values) || values.length === 0)
						? "Select at least one option"
						: undefined,
			});
			const result = unwrap(await prompt.prompt());
			return Array.isArray(result) ? result : [];
		}
		const prompt = new clackCore.MultiSelectPrompt<PromptOption<Value>>({
			initialValues: promptOptions.initialValues,
			input: options.input,
			options: mapOptions(promptOptions.options),
			output: options.output,
			render() {
				return renderMultiSelectFrame({
					choices: this.options,
					error: this.error,
					focusedValue: this.options[this.cursor]?.value,
					message: promptOptions.message,
					selectedValues: this.value ?? [],
					state: this.state,
				});
			},
			validate: (values) =>
				promptOptions.required && (!values || values.length === 0)
					? "Select at least one option"
					: undefined,
		});
		return unwrap(await prompt.prompt()) ?? [];
	};

	return {
		confirm: async ({ initialValue, message }) =>
			unwrap(
				await clack.confirm({
					...streams,
					initialValue,
					message,
				})
			),
		date: async ({ initialValue, message }) => {
			const prompt = new clackCore.DatePrompt({
				...streams,
				format: "YMD",
				initialValue: initialValue ? toLocalDate(initialValue) : undefined,
				render() {
					return renderDateFrame({
						message,
						segmentIndex: this.segmentCursor.segmentIndex,
						state: this.state,
						values: this.segmentValues,
					});
				},
				separator: "-",
			});
			const value = unwrap(await prompt.prompt());
			if (!(value instanceof Date)) {
				throw new PromptCancelledError();
			}
			return fromLocalDate(value);
		},
		multiselect,
		select: async <Value extends string>(
			promptOptions: SelectPromptOptions<Value>
		) => {
			const choices = mapOptions(promptOptions.options);
			if (promptOptions.searchable) {
				const prompt = new clackCore.AutocompletePrompt<PromptOption<Value>>({
					filter: (search, choice) =>
						choice.label
							.toLocaleLowerCase()
							.includes(search.toLocaleLowerCase()),
					initialValue: promptOptions.initialValue
						? [promptOptions.initialValue]
						: undefined,
					input: options.input,
					multiple: false,
					options: choices,
					output: options.output,
					render() {
						return renderSelectFrame({
							choices: this.filteredOptions,
							focusedValue: this.focusedValue,
							message: promptOptions.message,
							search: this.userInput,
							state: this.state,
						});
					},
				});
				return unwrap(await prompt.prompt()) as Value;
			}
			const prompt = new clackCore.SelectPrompt<PromptOption<Value>>({
				initialValue: promptOptions.initialValue,
				input: options.input,
				options: choices,
				output: options.output,
				render() {
					return renderSelectFrame({
						choices: this.options,
						focusedValue: this.options[this.cursor]?.value,
						message: promptOptions.message,
						state: this.state,
					});
				},
			});
			return unwrap(await prompt.prompt()) as Value;
		},
		text: async (promptOptions: TextPromptOptions) =>
			unwrap(
				await clack.text({
					...streams,
					...promptOptions,
					validate: promptOptions.validate
						? (value) =>
								value === undefined
									? "A value is required"
									: promptOptions.validate?.(value)
						: undefined,
				})
			),
	};
};
