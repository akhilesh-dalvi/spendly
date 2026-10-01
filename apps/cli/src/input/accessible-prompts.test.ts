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

describe("accessible prompts", () => {
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
