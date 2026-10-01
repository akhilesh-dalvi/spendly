import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type {
	InteractivePrompter,
	MultiSelectPromptOptions,
	PromptOption,
	SelectPromptOptions,
	TextPromptOptions,
} from "./types.js";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TERMINAL_PUNCTUATION_PATTERN = /[?!:]$/u;
const SELECTION_SEPARATOR = /[\s,]+/u;

export const shouldUseStaticPrompts = (
	accessible: boolean,
	term: string | undefined
): boolean => accessible || term?.toLocaleLowerCase() === "dumb";

const isValidDate = (value: string): boolean => {
	const match = DATE_PATTERN.exec(value);
	if (!match) {
		return false;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
};

const renderOptions = <Value extends string>(
	output: Writable,
	options: readonly PromptOption<Value>[],
	selected: readonly Value[] = [],
	multiple = false
): void => {
	for (const [index, option] of options.entries()) {
		const marker = multiple
			? `${selected.includes(option.value) ? "[x]" : "[ ]"} `
			: "";
		const hint = option.hint ? ` - ${option.hint}` : "";
		const disabled = option.disabled ? " (unavailable)" : "";
		output.write(`${index + 1}) ${marker}${option.label}${disabled}${hint}\n`);
	}
};

const writeSelected = <Value extends string>(
	output: Writable,
	options: readonly PromptOption<Value>[],
	values: readonly Value[]
): void => {
	const labels = options
		.filter((option) => values.includes(option.value))
		.map((option) => option.label);
	output.write(`Selected: ${labels.length > 0 ? labels.join(", ") : "None"}\n`);
};

const ask = async (options: {
	input: Readable;
	message: string;
	output: Writable;
}): Promise<string> => {
	const readline = createInterface({
		input: options.input,
		output: options.output,
		terminal: false,
	});
	try {
		return (await readline.question(options.message)).trim();
	} finally {
		readline.close();
	}
};

const chooseOne = async <Value extends string>(options: {
	input: Readable;
	output: Writable;
	prompt: SelectPromptOptions<Value>;
}): Promise<Value> => {
	options.output.write(`\n${options.prompt.message}\n`);
	renderOptions(options.output, options.prompt.options);
	while (true) {
		const answer = await ask({
			input: options.input,
			message: `Choose 1-${options.prompt.options.length}: `,
			output: options.output,
		});
		const index = Number(answer) - 1;
		const choice = options.prompt.options[index];
		if (choice && !choice.disabled) {
			writeSelected(options.output, options.prompt.options, [choice.value]);
			return choice.value;
		}
		options.output.write("Enter the number of an available option.\n");
	}
};

const chooseMany = async <Value extends string>(options: {
	input: Readable;
	output: Writable;
	prompt: MultiSelectPromptOptions<Value>;
}): Promise<Value[]> => {
	options.output.write(`\n${options.prompt.message}\n`);
	renderOptions(
		options.output,
		options.prompt.options,
		options.prompt.initialValues,
		true
	);
	while (true) {
		const answer = await ask({
			input: options.input,
			message:
				"Enter option numbers separated by commas; press Enter for none: ",
			output: options.output,
		});
		if (!answer) {
			const initial = options.prompt.initialValues ?? [];
			if (!(options.prompt.required && initial.length === 0)) {
				writeSelected(options.output, options.prompt.options, initial);
				return initial;
			}
			options.output.write("Select at least one option.\n");
			continue;
		}
		const indexes = [
			...new Set(
				answer.split(SELECTION_SEPARATOR).map((value) => Number(value) - 1)
			),
		];
		const choices = indexes.map((index) => options.prompt.options[index]);
		if (choices.every((choice) => choice && !choice.disabled)) {
			const values = choices
				.map((choice) => choice?.value)
				.filter(Boolean) as Value[];
			writeSelected(options.output, options.prompt.options, values);
			return values;
		}
		options.output.write("Enter only numbers for available options.\n");
	}
};

const askText = async (options: {
	input: Readable;
	output: Writable;
	prompt: TextPromptOptions;
}): Promise<string> => {
	while (true) {
		const suffix = options.prompt.initialValue
			? ` [${options.prompt.initialValue}]`
			: "";
		const answer = await ask({
			input: options.input,
			message: `${options.prompt.message}${suffix}${TERMINAL_PUNCTUATION_PATTERN.test(options.prompt.message) ? " " : ": "}`,
			output: options.output,
		});
		const value = answer || options.prompt.initialValue || "";
		const error = options.prompt.validate?.(value);
		if (!error) {
			return value;
		}
		options.output.write(`${error}\n`);
	}
};

export const createAccessiblePrompter = (options: {
	input: Readable;
	output: Writable;
}): InteractivePrompter => ({
	confirm: async ({ initialValue = false, message }) => {
		while (true) {
			const answer = (
				await ask({
					input: options.input,
					message: `${message} ${initialValue ? "[Y/n]" : "[y/N]"}: `,
					output: options.output,
				})
			).toLocaleLowerCase();
			if (!answer) {
				return initialValue;
			}
			if (answer === "y" || answer === "yes") {
				return true;
			}
			if (answer === "n" || answer === "no") {
				return false;
			}
			options.output.write("Enter yes or no.\n");
		}
	},
	date: async ({ initialValue, message }) =>
		await askText({
			input: options.input,
			output: options.output,
			prompt: {
				initialValue,
				message,
				validate: (value) =>
					isValidDate(value) ? undefined : "Enter a date as YYYY-MM-DD.",
			},
		}),
	multiselect: async <Value extends string>(
		prompt: MultiSelectPromptOptions<Value>
	) => await chooseMany({ ...options, prompt }),
	select: async <Value extends string>(prompt: SelectPromptOptions<Value>) =>
		await chooseOne({ ...options, prompt }),
	text: async (prompt) => await askText({ ...options, prompt }),
});
