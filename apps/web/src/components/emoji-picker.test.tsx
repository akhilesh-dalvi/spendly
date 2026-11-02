// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EmojiPicker } from "./emoji-picker";

function ControlledPicker({ onChange }: { onChange: (emoji: string) => void }) {
	const [value, setValue] = useState("🏠");
	const changeEmoji = useCallback(
		(emoji: string) => {
			setValue(emoji);
			onChange(emoji);
		},
		[onChange]
	);
	return (
		<EmojiPicker
			ariaLabel="Budget icon"
			id="budget-icon"
			onChange={changeEmoji}
			value={value}
		/>
	);
}

describe("EmojiPicker", () => {
	it("opens an accessible searchable picker, selects a keyword match and clears search on reopening", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ControlledPicker onChange={onChange} />);
		const trigger = screen.getByRole("combobox", { name: "Budget icon" });
		expect(trigger).toHaveAttribute("id", "budget-icon");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(trigger).toHaveTextContent("🏠");
		await user.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		const search = screen.getByPlaceholderText("Search emojis...");
		expect(search).toHaveFocus();
		await user.type(search, "  CoFfEe  ");
		expect(screen.getByRole("button", { name: "☕" })).toHaveAttribute(
			"title",
			"coffee drink cafe tea"
		);
		expect(
			screen.queryByRole("button", { name: "🏠" })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "☕" }));
		expect(onChange).toHaveBeenCalledExactlyOnceWith("☕");
		expect(trigger).toHaveTextContent("☕");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(
			screen.queryByPlaceholderText("Search emojis...")
		).not.toBeInTheDocument();
		await user.click(trigger);
		expect(screen.getByPlaceholderText("Search emojis...")).toHaveValue("");
		expect(screen.getByRole("button", { name: "🏠" })).toBeVisible();
	});

	it("matches category titles and shows an actionable no-results state without selecting anything", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<EmojiPicker onChange={onChange} />);
		await user.click(screen.getByRole("combobox", { name: "Choose an icon" }));
		const search = screen.getByPlaceholderText("Search emojis...");
		await user.type(search, "Finance");
		expect(screen.getByRole("heading", { name: "Finance" })).toBeVisible();
		expect(screen.getByRole("button", { name: "💳" })).toBeVisible();
		expect(screen.getByRole("button", { name: "📉" })).toBeVisible();
		expect(
			screen.queryByRole("heading", { name: "Home & Living" })
		).not.toBeInTheDocument();
		await user.clear(search);
		await user.type(search, "missing-unicorn");
		expect(
			screen.getByText('No emojis found for "missing-unicorn"')
		).toBeVisible();
		expect(onChange).not.toHaveBeenCalled();
		await user.clear(search);
		expect(
			screen.getByRole("heading", { name: "Home & Living" })
		).toBeVisible();
	});

	it("preserves custom icons outside the catalog and supports keyboard dismissal and selection", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<EmojiPicker
				ariaLabel="Custom icon"
				className="custom-picker"
				onChange={onChange}
				value="🦄"
			/>
		);
		const trigger = screen.getByRole("combobox", { name: "Custom icon" });
		expect(trigger).toHaveTextContent("🦄");
		expect(trigger).toHaveClass("custom-picker");
		trigger.focus();
		await user.keyboard("{Enter}");
		await user.keyboard("{Escape}");
		expect(trigger).toHaveFocus();
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(onChange).not.toHaveBeenCalled();
		await user.keyboard("{Enter}");
		await user.type(
			screen.getByPlaceholderText("Search emojis..."),
			"croissant"
		);
		await user.tab();
		expect(screen.getByRole("button", { name: "🥐" })).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(onChange).toHaveBeenCalledExactlyOnceWith("🥐");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
	});
});
