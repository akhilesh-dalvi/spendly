// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";

function ExampleSelect({
	contentProps,
	disabled,
	onValueChange,
	size,
}: {
	contentProps?: ComponentProps<typeof SelectContent>;
	disabled?: boolean;
	onValueChange?: (value: string) => void;
	size?: ComponentProps<typeof SelectTrigger>["size"];
}) {
	return (
		<>
			<Select
				defaultValue="beta"
				disabled={disabled}
				onValueChange={onValueChange}
			>
				<SelectTrigger aria-label="Example" size={size}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent {...contentProps}>
					<SelectGroup>
						<SelectItem value="alpha">Alpha</SelectItem>
						<SelectItem value="beta">Beta</SelectItem>
						<SelectItem value="gamma">Gamma</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			<button type="button">Outside</button>
		</>
	);
}

describe("shared select", () => {
	it.each([
		["default", "data-[size=default]:h-9"],
		["sm", "data-[size=sm]:h-8"],
		["lg", "data-[size=lg]:h-10"],
	] as const)(
		"provides a supported %s height without competing utility overrides",
		(size, heightClass) => {
			render(<ExampleSelect size={size} />);
			const trigger = screen.getByRole("combobox", { name: "Example" });
			expect(trigger).toHaveAttribute("data-size", size);
			expect(trigger).toHaveClass(heightClass);
		}
	);

	it("opens below and start-aligned to the trigger, rather than over the selected item", async () => {
		render(<ExampleSelect />);
		const interaction = userEvent.setup();
		const trigger = screen.getByRole("combobox", { name: "Example" });
		expect(trigger).toHaveAttribute("data-size", "default");
		await interaction.click(trigger);
		const listbox = screen.getByRole("listbox");
		expect(listbox).toHaveAttribute("data-side", "bottom");
		expect(listbox).toHaveAttribute("data-align", "start");
		expect(
			listbox.closest("[data-radix-popper-content-wrapper]")
		).not.toBeNull();
		expect(listbox).not.toHaveClass("data-[side=bottom]:translate-y-1");
		expect(screen.getByRole("option", { name: "Beta" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
		await interaction.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("preserves keyboard selection with the new popup positioning", async () => {
		const onValueChange = vi.fn();
		render(<ExampleSelect onValueChange={onValueChange} />);
		const interaction = userEvent.setup();
		const trigger = screen.getByRole("combobox", { name: "Example" });
		trigger.focus();
		await interaction.keyboard("{Enter}{End}{Enter}");
		expect(onValueChange).toHaveBeenCalledExactlyOnceWith("gamma");
		expect(trigger).toHaveTextContent("Gamma");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("dismisses on outside click and does not open a disabled trigger", async () => {
		const interaction = userEvent.setup();
		const view = render(<ExampleSelect />);
		await interaction.click(screen.getByRole("combobox", { name: "Example" }));
		fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		view.rerender(<ExampleSelect disabled />);
		await interaction.click(screen.getByRole("combobox", { name: "Example" }));
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("keeps caller placement overrides available", async () => {
		render(
			<ExampleSelect
				contentProps={{ align: "end", avoidCollisions: false, side: "top" }}
			/>
		);
		await userEvent
			.setup()
			.click(screen.getByRole("combobox", { name: "Example" }));
		expect(screen.getByRole("listbox")).toHaveAttribute("data-side", "top");
		expect(screen.getByRole("listbox")).toHaveAttribute("data-align", "end");
	});
});
