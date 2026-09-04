import { createInterface } from "node:readline/promises";
import { CliError } from "../errors.js";

const CONFIRMED_PATTERN = /^(?:y|yes)$/iu;

export const confirmDestructiveAction = async (
	message: string
): Promise<boolean> => {
	if (!process.stdin.isTTY) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Interactive confirmation requires a terminal"
		);
	}
	const prompt = createInterface({
		input: process.stdin,
		output: process.stderr,
	});
	try {
		const answer = await prompt.question(`${message} [y/N] `);
		return CONFIRMED_PATTERN.test(answer.trim());
	} finally {
		prompt.close();
	}
};
