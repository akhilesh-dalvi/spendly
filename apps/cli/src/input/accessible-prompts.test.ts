import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
	createAccessiblePrompter,
	shouldUseStaticPrompts,
} from "./accessible-prompts.js";

const createStreams = () => {
	const input = new PassThrough();
	const output = new PassThrough();
	let rendered = "";
	output.on("data", (chunk: Buffer) => {
		rendered += chunk.toString("utf8");
	});
	return { getRendered: () => rendered, input, output };
};

const reply = async (input: PassThrough, value: string): Promise<void> => {
	input.write(`${value}\n`);
	await new Promise<void>((resolve) => setImmediate(resolve));
};

describe("accessible prompts", () => {
	it("handles absent TERM and case-insensitive dumb terminals", () => {
		expect(shouldUseStaticPrompts(false, undefined)).toBe(false);
		expect(shouldUseStaticPrompts(false, "DUMB")).toBe(true);
	});

	it("rejects unavailable and out-of-range single selections", async () => {
		const streams = createStreams();
		const answer = createAccessiblePrompter(streams).select({
			message: "Account",
			options: [
				{ disabled: true, hint: "Read only", label: "Archived", value: "old" },
				{ label: "Wallet", value: "wallet" },
			],
		});
		await reply(streams.input, "9");
		await reply(streams.input, "1");
		await reply(streams.input, "2");
		await expect(answer).resolves.toBe("wallet");
		expect(streams.getRendered()).toContain(
			"Archived (unavailable) - Read only"
		);
		expect(streams.getRendered().split("Enter the number")).toHaveLength(3);
	});

	it("requires a selection, rejects unavailable numbers, and deduplicates choices", async () => {
		const streams = createStreams();
		const answer = createAccessiblePrompter(streams).multiselect({
			message: "Fields",
			options: [
				{ label: "Amount", value: "amount" },
				{ disabled: true, label: "Locked", value: "locked" },
				{ label: "Date", value: "date" },
			],
			required: true,
		});
		await reply(streams.input, "");
		await reply(streams.input, "2");
		await reply(streams.input, "99");
		await reply(streams.input, "1,1 3");
		await expect(answer).resolves.toEqual(["amount", "date"]);
		expect(streams.getRendered()).toContain("Select at least one option.");
		expect(streams.getRendered()).toContain(
			"Enter only numbers for available options."
		);
	});

	it.each([
		{
			expected: [],
			initialValues: undefined,
			required: false,
			summary: "None",
		},
		{
			expected: ["amount"],
			initialValues: ["amount"],
			required: true,
			summary: "Amount",
		},
	])(
		"accepts an empty answer with initial values $initialValues",
		async ({ initialValues, required, expected, summary }) => {
			const streams = createStreams();
			const answer = createAccessiblePrompter(streams).multiselect({
				initialValues,
				message: "Fields",
				options: [{ label: "Amount", value: "amount" }],
				required,
			});
			await reply(streams.input, "");
			await expect(answer).resolves.toEqual(expected);
			expect(streams.getRendered()).toContain(`Selected: ${summary}`);
			if (initialValues) {
				expect(streams.getRendered()).toContain("[x] Amount");
			}
		}
	);

	it.each([
		{ answer: "", expected: false, initialValue: undefined },
		{ answer: "", expected: true, initialValue: true },
		{ answer: "Y", expected: true, initialValue: false },
		{ answer: "yes", expected: true, initialValue: false },
		{ answer: "n", expected: false, initialValue: true },
		{ answer: "NO", expected: false, initialValue: true },
	])(
		"confirms $answer with default $initialValue",
		async ({ answer, initialValue, expected }) => {
			const streams = createStreams();
			const result = createAccessiblePrompter(streams).confirm({
				initialValue,
				message: "Continue?",
			});
			await reply(streams.input, "maybe");
			await reply(streams.input, answer);
			await expect(result).resolves.toBe(expected);
			expect(streams.getRendered()).toContain("Enter yes or no.");
			expect(streams.getRendered()).toContain(initialValue ? "[Y/n]" : "[y/N]");
		}
	);

	it("validates text before returning and accepts the initial value", async () => {
		const streams = createStreams();
		const answer = createAccessiblePrompter(streams).text({
			initialValue: "Lunch",
			message: "Description",
			validate: (value) => (value.length < 3 ? "Too short" : undefined),
		});
		await reply(streams.input, "x");
		await reply(streams.input, "");
		await expect(answer).resolves.toBe("Lunch");
		expect(streams.getRendered()).toContain("Description [Lunch]: ");
		expect(streams.getRendered()).toContain("Too short");
	});

	it.each(["not-a-date", "2026-02-29", "2026-13-01", "0099-01-01"])(
		"rejects invalid date %s before accepting a leap day",
		async (invalid) => {
			const streams = createStreams();
			const answer = createAccessiblePrompter(streams).date({
				message: "Date",
			});
			await reply(streams.input, invalid);
			await reply(streams.input, "2024-02-29");
			await expect(answer).resolves.toBe("2024-02-29");
			expect(streams.getRendered()).toContain("Enter a date as YYYY-MM-DD.");
		}
	);
	it("uses static prompts when explicitly requested or TERM is dumb", () => {
		expect(shouldUseStaticPrompts(true, "xterm-256color")).toBe(true);
		expect(shouldUseStaticPrompts(false, "dumb")).toBe(true);
		expect(shouldUseStaticPrompts(false, "xterm-256color")).toBe(false);
	});

	it("uses static numbered select output", async () => {
		const streams = createStreams();
		const prompter = createAccessiblePrompter(streams);
		const answer = prompter.select({
			message: "Choose an account",
			options: [
				{ label: "Wallet", value: "wallet" },
				{ label: "Savings", value: "savings" },
			],
		});

		streams.input.write("2\n");

		await expect(answer).resolves.toBe("savings");
		expect(streams.getRendered()).toContain("1) Wallet");
		expect(streams.getRendered()).not.toContain("[ ]");
		expect(streams.getRendered()).toContain("Choose 1-2:");
		expect(streams.getRendered()).toContain("Selected: Savings");
		expect(streams.getRendered()).not.toContain("\u001b[");
	});

	it("uses comma-separated checkbox selection without redrawing", async () => {
		const streams = createStreams();
		const prompter = createAccessiblePrompter(streams);
		const answer = prompter.multiselect({
			message: "Choose fields",
			options: [
				{ label: "Amount", value: "amount" },
				{ label: "Date", value: "date" },
				{ label: "Tags", value: "tags" },
			],
			required: true,
		});

		streams.input.write("1,3\n");

		await expect(answer).resolves.toEqual(["amount", "tags"]);
		expect(streams.getRendered()).toContain(
			"Enter option numbers separated by commas"
		);
		expect(streams.getRendered()).toContain("Selected: Amount, Tags");
	});

	it("does not duplicate terminal punctuation in text prompts", async () => {
		const streams = createStreams();
		const prompter = createAccessiblePrompter(streams);
		const answer = prompter.text({ message: "What was this spent on?" });

		streams.input.write("Lunch\n");

		await expect(answer).resolves.toBe("Lunch");
		expect(streams.getRendered()).toContain("What was this spent on? ");
		expect(streams.getRendered()).not.toContain("?:");
	});
});
