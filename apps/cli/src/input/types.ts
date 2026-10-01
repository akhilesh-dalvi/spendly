export interface PromptOption<Value extends string = string> {
	disabled?: boolean;
	hint?: string;
	label: string;
	value: Value;
}

export interface TextPromptOptions {
	initialValue?: string;
	message: string;
	placeholder?: string;
	validate?: (value: string) => string | undefined;
}

export interface SelectPromptOptions<Value extends string = string> {
	initialValue?: Value;
	message: string;
	options: PromptOption<Value>[];
	searchable?: boolean;
}

export interface MultiSelectPromptOptions<Value extends string = string> {
	initialValues?: Value[];
	message: string;
	options: PromptOption<Value>[];
	required?: boolean;
	searchable?: boolean;
}

export interface InteractivePrompter {
	confirm(options: {
		initialValue?: boolean;
		message: string;
	}): Promise<boolean>;
	date(options: { initialValue?: string; message: string }): Promise<string>;
	multiselect<Value extends string>(
		options: MultiSelectPromptOptions<Value>
	): Promise<Value[]>;
	select<Value extends string>(
		options: SelectPromptOptions<Value>
	): Promise<Value>;
	text(options: TextPromptOptions): Promise<string>;
}

export class PromptCancelledError extends Error {
	constructor() {
		super("Cancelled; no changes made");
		this.name = "PromptCancelledError";
	}
}
