import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { type RunningTerminal, startTerminal, terminalKeys } from "./terminal";
import { answerAddExpense } from "./terminal-add-expense";

const PROMPTER_URL = new URL(
	"../../../apps/cli/src/input/prompts.ts",
	import.meta.url
).href;
const TSX_LOADER = fileURLToPath(import.meta.resolve("tsx/esm"));
const CONFIRMATION = /Add this expense\?/u;
const AMOUNT = /Expense amount/u;
const CANCELLED = /Cancelled; no changes made/u;
const CONFIRMED =
	/ANSWERS:12\.50\|PTY synthetic purchase\|clear\|savings\|essential\|true/u;

// Only the real terminal renderer runs here, not CLI commands or backend mocks.
// Live specs independently prove financial persistence/non-persistence.
const SCRIPT = `
import { createClackPrompter } from ${JSON.stringify(PROMPTER_URL)};
const prompts = await createClackPrompter({ color: false, input: process.stdin, output: process.stderr });
try {
	const amount = await prompts.text({ message: 'Expense amount (USD)' });
	const description = await prompts.text({ message: 'What was this spent on?' });
	const category = await prompts.select({ message: 'Choose a category', options: [
		{ label: 'No visible categories for this date', value: 'disabled', disabled: true },
		{ label: 'Uncategorized', value: 'clear' },
	] });
	const account = await prompts.select({ message: 'Choose an account', options: [
		{ label: 'Use the default account automatically', value: 'automatic' },
		{ label: 'Leave unassigned', value: 'clear' },
		{ label: 'E2E Wallet', value: 'wallet' },
		{ label: 'E2E Savings', value: 'savings' },
	] });
	const tags = await prompts.multiselect({ message: 'Choose tags', required: false, options: [
		{ label: 'E2E Essential', value: 'essential' },
		{ label: 'E2E Optional', value: 'optional' },
	] });
	const confirmed = await prompts.confirm({ message: 'Add this expense?', initialValue: false });
	if (!confirmed) throw new Error('Cancelled; no changes made');
	process.stdout.write('ANSWERS:' + [amount, description, category, account, tags.join(','), confirmed].join('|'));
} catch (error) {
	if (error instanceof Error && error.message === 'Cancelled; no changes made') {
		process.stdout.write(error.message);
	} else {
		process.exitCode = 1;
	}
}
`;
let terminal: RunningTerminal | undefined;
const start = () => {
	terminal = startTerminal({
		args: ["--import", TSX_LOADER, "--input-type=module", "-e", SCRIPT],
		command: process.execPath,
		env: {
			NO_COLOR: "1",
			PATH: process.env.PATH ?? "",
			TERM: "xterm-256color",
		},
		timeoutMs: 5000,
	});
	return terminal;
};

afterEach(async () => {
	await terminal?.stop();
	terminal = undefined;
});

describe("real Clack prompt protocol over a PTY (offline)", () => {
	it("drives the same text, disabled-row, account, multiselect and confirm keys used live", async () => {
		const child = start();
		await answerAddExpense(child, ["E2E Wallet", "E2E Savings"]);
		await child.waitForOutput(CONFIRMATION);
		child.write("y");
		await child.waitForOutput(CONFIRMED);
		expect(await child.result).toEqual({ exitCode: 0, signal: null });
	});

	it("declines through the real confirmation's n shortcut", async () => {
		const child = start();
		await answerAddExpense(child, ["E2E Wallet", "E2E Savings"]);
		await child.waitForOutput(CONFIRMATION);
		child.write("n");
		await child.waitForOutput(CANCELLED);
		expect(await child.result).toEqual({ exitCode: 0, signal: null });
	});

	it.each(["amount", "confirmation"] as const)(
		"cancels through a raw Ctrl+C byte at %s",
		async (stage) => {
			const child = start();
			if (stage === "amount") {
				await child.waitForOutput(AMOUNT);
			} else {
				await answerAddExpense(child, ["E2E Wallet", "E2E Savings"]);
				await child.waitForOutput(CONFIRMATION);
			}
			child.write(terminalKeys.ctrlC);
			await child.waitForOutput(CANCELLED);
			expect(await child.result).toEqual({ exitCode: 0, signal: null });
		}
	);
});
