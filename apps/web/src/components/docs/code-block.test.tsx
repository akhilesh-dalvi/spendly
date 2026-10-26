// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocsCodeBlock } from "@/components/docs/code-block";
import { CodeBlockCopyButton } from "@/components/ui/code-block";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("documentation code blocks", () => {
	it("preserves highlighted tokens in the shared terminal frame", async () => {
		const { container } = render(
			await DocsCodeBlock({
				title: "Terminal",
				children: (
					<code>
						<span className="line">
							<span data-token="command">spendly</span> expenses list
						</span>
						{"\n"}
						<span className="line">spendly accounts list</span>
					</code>
				),
			})
		);

		expect(screen.getByText("Terminal")).toBeTruthy();
		expect(container.querySelectorAll("pre code")).toHaveLength(1);
		expect(container.querySelector("code code")).toBeNull();
		expect(container.querySelector("[data-token=command]")?.textContent).toBe(
			"spendly"
		);
		expect(container.querySelector("pre")?.tabIndex).toBe(0);
		expect(container.querySelector("pre")?.dir).toBe("ltr");
		expect(container.querySelector("[data-slot=code-block]")).toHaveClass(
			"shiki"
		);
		expect(
			container.querySelector("[data-slot=code-block-header]")
		).toHaveClass("h-11", "px-4");
		expect(container.querySelector("pre")).toHaveClass(
			"p-4",
			"text-[13px]",
			"leading-6"
		);
	});

	it("copies only code, preserving newlines and blank lines", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		render(
			await DocsCodeBlock({
				children: (
					<code>
						<span>spendly expenses list</span>
						{"\n\n"}
						<span>spendly accounts list</span>
						{"\n"}
					</code>
				),
			})
		);

		fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		await waitFor(() =>
			expect(writeText).toHaveBeenCalledWith(
				"spendly expenses list\n\nspendly accounts list\n"
			)
		);
		expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
	});

	it("does not report success when copying fails", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		render(await DocsCodeBlock({ children: <code>spendly --help</code> }));

		fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
		expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
	});

	it("respects a prevented copy action", () => {
		const writeText = vi.fn();
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		render(
			<CodeBlockCopyButton
				onClick={(event) => event.preventDefault()}
				value="spendly --help"
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		expect(writeText).not.toHaveBeenCalled();
	});
});
