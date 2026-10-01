import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createClackPrompter } from "./prompts.js";

describe("interactive prompt rendering", () => {
	it("shows structural focus for date segments", async () => {
		const input = Object.assign(new PassThrough(), {
			isTTY: true,
			setRawMode: () => undefined,
		});
		const output = Object.assign(new PassThrough(), {
			columns: 80,
			isTTY: true,
			rows: 24,
		});
		let rendered = "";
		output.on("data", (chunk: Buffer) => {
			rendered += chunk.toString("utf8");
		});
		const prompter = await createClackPrompter({
			color: false,
			input,
			output,
		});
		const answer = prompter.date({
			initialValue: "2026-09-15",
			message: "Expense date",
		});

		expect(rendered).toContain("[2026]-09-15");
		input.write("\u001b[C");
		expect(rendered).toContain("2026-[09]-15");
		input.write("\r");

		await expect(answer).resolves.toBe("2026-09-15");
	});

	it("shows one explicit focus marker while navigating a select", async () => {
		const input = Object.assign(new PassThrough(), {
			isTTY: true,
			setRawMode: () => undefined,
		});
		const output = Object.assign(new PassThrough(), {
			columns: 80,
			isTTY: true,
			rows: 24,
		});
		let rendered = "";
		output.on("data", (chunk: Buffer) => {
			rendered += chunk.toString("utf8");
		});
		const prompter = await createClackPrompter({
			color: false,
			input,
			output,
		});
		const answer = prompter.select({
			message: "Choose a category",
			options: [
				{ label: "Food", value: "food" },
				{ label: "Uncategorized", value: "uncategorized" },
			],
		});

		expect(rendered).toContain("› ● Food");
		input.write("\u001b[B");
		expect(rendered).toContain("› ● Uncategorized");
		input.write("\r");

		await expect(answer).resolves.toBe("uncategorized");
	});

	it("shows keyboard focus independently from checkbox selection", async () => {
		const rawModeChanges: boolean[] = [];
		const input = Object.assign(new PassThrough(), {
			isTTY: true,
			setRawMode: (enabled: boolean) => {
				rawModeChanges.push(enabled);
			},
		});
		const output = Object.assign(new PassThrough(), {
			columns: 80,
			isTTY: true,
			rows: 24,
		});
		let rendered = "";
		output.on("data", (chunk: Buffer) => {
			rendered += chunk.toString("utf8");
		});
		const prompter = await createClackPrompter({
			color: false,
			input,
			output,
		});

		const answer = prompter.multiselect({
			message: "What would you like to change?",
			options: [
				{ label: "Amount", value: "amount" },
				{ label: "Date", value: "date" },
			],
			required: true,
		});

		expect(rendered).toContain("› ◻ Amount");
		expect(rendered).toContain("2 shown • 0 selected");
		input.write("\u001b[B");
		expect(rendered).toContain("› ◻ Date");
		input.write(" ");
		expect(rendered).toContain("› ◼ Date");
		expect(rendered).toContain("2 shown • 1 selected");
		expect(rendered).toContain("Esc cancel");
		input.write("\r");

		await expect(answer).resolves.toEqual(["date"]);
		expect(rawModeChanges[0]).toBe(true);
		expect(rawModeChanges.at(-1)).toBe(false);
	});
});
