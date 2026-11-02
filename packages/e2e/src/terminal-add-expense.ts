// biome-ignore-all lint/performance/noAwaitInLoops: Stateful E2E steps and fixture cleanup require ordered execution.
import { type RunningTerminal, terminalKeys } from "./terminal";

const patterns = {
	amountPrompt: /Expense amount/u,
	amountValue: /12\.50/u,
	automaticAccount: /› ● Use the default account automatically/u,
	descriptionPrompt: /What was this spent on\?/u,
	descriptionValue: /PTY synthetic purchase/u,
	essentialSelected: /› ◼ E2E Essential/u,
	essentialUnselected: /› ◻ E2E Essential/u,
	optionalSelected: /› ◼ E2E Optional/u,
	optionalUnselected: /› ◻ E2E Optional/u,
	savingsAccount: /› ● E2E Savings/u,
	unassignedAccount: /› ● Leave unassigned/u,
	uncategorized: /› ● Uncategorized/u,
	walletAccount: /› ● E2E Wallet/u,
};

/** Drive the real prompt renderer, one acknowledged keypress at a time. */
export const answerAddExpense = async (
	terminal: RunningTerminal,
	accountNames: string[]
) => {
	await terminal.waitForOutput(patterns.amountPrompt);
	terminal.write("12.50");
	await terminal.waitForOutput(patterns.amountValue);
	terminal.write(terminalKeys.enter);
	await terminal.waitForOutput(patterns.descriptionPrompt);
	terminal.write("PTY synthetic purchase");
	await terminal.waitForOutput(patterns.descriptionValue);
	terminal.write(terminalKeys.enter);

	// No category fixture is seeded; the disabled explanatory row is skipped.
	await terminal.waitForOutput(patterns.uncategorized);
	terminal.write(terminalKeys.enter);
	await terminal.waitForOutput(patterns.automaticAccount);
	terminal.write(terminalKeys.down);
	await terminal.waitForOutput(patterns.unassignedAccount);
	const target = accountNames.indexOf("E2E Savings");
	if (target === -1) {
		throw new Error("Interactive E2E savings fixture unavailable");
	}
	for (const name of accountNames.slice(0, target + 1)) {
		terminal.write(terminalKeys.down);
		// Names come only from these synthetic account fixtures, not user input.
		await terminal.waitForOutput(
			name === "E2E Savings" ? patterns.savingsAccount : patterns.walletAccount
		);
	}
	terminal.write(terminalKeys.enter);

	await terminal.waitForOutput(patterns.essentialUnselected);
	terminal.write(terminalKeys.space);
	await terminal.waitForOutput(patterns.essentialSelected);
	terminal.write(terminalKeys.down);
	await terminal.waitForOutput(patterns.optionalUnselected);
	terminal.write(terminalKeys.space);
	await terminal.waitForOutput(patterns.optionalSelected);
	terminal.write(terminalKeys.space);
	await terminal.waitForOutput(patterns.optionalUnselected);
	terminal.write(terminalKeys.enter);
};
