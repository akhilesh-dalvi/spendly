import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createClackPrompter } from "./prompts.js";
import { PromptCancelledError } from "./types.js";

const createStreams = () => {
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
	return { input, output, rendered: () => rendered };
};

describe("interactive prompt rendering", () => {
	it("filters searchable single choices case-insensitively and renders disabled hints", async () => {
		const streams = createStreams();
		const prompter = await createClackPrompter({ ...streams, color: true });
		const answer = prompter.select({
			message: "Account",
			searchable: true,
			initialValue: "wallet",
			options: [
				{ label: "Wallet", value: "wallet", hint: "INR 20" },
				{ label: "Savings", value: "savings" },
				{ label: "Archived", value: "old", disabled: true },
			],
		});
		expect(streams.rendered()).toContain("Search: _");
		expect(streams.rendered()).toContain("(unavailable)");
		streams.input.write("SAV");
		expect(streams.rendered()).toContain("Search: SAV");
		streams.input.write("\r");
		await expect(answer).resolves.toBe("savings");
		expect(streams.rendered()).toContain("◇  Account");
	});

	it("validates required searchable multi-selection and summarizes the selected label", async () => {
		const streams = createStreams();
		const prompter = await createClackPrompter({ ...streams, color: false });
		const answer = prompter.multiselect({
			message: "Fields",
			searchable: true,
			required: true,
			options: [
				{ label: "Amount", value: "amount", hint: "Decimal" },
				{ label: "Date", value: "date" },
			],
		});
		streams.input.write("\r");
		expect(streams.rendered()).toContain("Select at least one option");
		expect(streams.rendered()).toContain("Decimal");
		streams.input.write("DAT");
		expect(streams.rendered()).toContain("Search: DAT");
		streams.input.write("\t");
		streams.input.write("\r");
		await expect(answer).resolves.toEqual(["date"]);
	});

	it.each([
		false,
		true,
	])("allows an optional empty multiselect searchable=%s", async (searchable) => {
		const streams = createStreams();
		const prompter = await createClackPrompter({ ...streams, color: false });
		const answer = prompter.multiselect({
			message: "Tags",
			searchable,
			required: false,
			options: [{ label: "Work", value: "work" }],
		});
		streams.input.write("\r");
		await expect(answer).resolves.toEqual([]);
		expect(streams.rendered()).toContain("│  None");
	});

	it.each([
		"select",
		"multiselect",
		"date",
	] as const)("converts %s cancellation into a prompt cancellation error", async (kind) => {
		const streams = createStreams();
		const prompter = await createClackPrompter({ ...streams, color: false });
		const answer =
			kind === "date"
				? prompter.date({ message: "Date" })
				: prompter[kind]({
						message: "Choose",
						options: [{ label: "One", value: "one" }],
					});
		const rejected =
			expect(answer).rejects.toBeInstanceOf(PromptCancelledError);
		streams.input.write("\u0003");
		await rejected;
		expect(streams.rendered()).toContain("■");
	});

	it.each([
		"wrong",
		"2026-02-29",
		"2026-13-01",
	])("rejects submission without a valid initial date %s", async (initialValue) => {
		const streams = createStreams();
		const prompter = await createClackPrompter({ ...streams, color: false });
		const answer = prompter.date({ message: "Date", initialValue });
		streams.input.write("\r");
		await expect(answer).rejects.toBeInstanceOf(PromptCancelledError);
	});

	it("delegates confirm and text validation to clack", async () => {
		const streams = createStreams();
		const prompter = await createClackPrompter({ ...streams, color: false });
		const text = prompter.text({
			message: "Description",
			validate: (value) => (value.length < 3 ? "Too short" : undefined),
		});
		streams.input.write("x");
		streams.input.write("\r");
		expect(streams.rendered()).toContain("Too short");
		streams.input.write("yz");
		streams.input.write("\r");
		await expect(text).resolves.toBe("xyz");
		const confirm = prompter.confirm({ message: "Apply?", initialValue: true });
		streams.input.write("\r");
		await expect(confirm).resolves.toBe(true);
	});
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
