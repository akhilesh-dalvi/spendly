// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "./toggle";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

describe("preset toggle primitives", () => {
	it("supports keyboard selection and inherits group appearance and spacing", async () => {
		const onValueChange = vi.fn();
		render(
			<ToggleGroup
				aria-label="Ranges"
				defaultValue="a"
				onValueChange={onValueChange}
				size="sm"
				spacing={2}
				type="single"
				variant="outline"
			>
				<ToggleGroupItem value="a">First</ToggleGroupItem>
				<ToggleGroupItem value="b">Second</ToggleGroupItem>
			</ToggleGroup>
		);
		const first = screen.getByRole("radio", { name: "First" });
		expect(first).toHaveAttribute("data-size", "sm");
		expect(first).toHaveAttribute("data-variant", "outline");
		expect(first).toHaveAttribute("data-spacing", "2");
		first.focus();
		await userEvent.setup().keyboard("{ArrowRight}{Enter}");
		expect(onValueChange).toHaveBeenCalledExactlyOnceWith("b");
		expect(screen.getByRole("radio", { name: "Second" })).toHaveAttribute(
			"aria-checked",
			"true"
		);
	});

	it("supports item-level variants and disabled choices", async () => {
		const onValueChange = vi.fn();
		render(
			<ToggleGroup
				aria-label="Ranges"
				onValueChange={onValueChange}
				type="single"
			>
				<ToggleGroupItem disabled size="lg" value="a" variant="outline">
					Unavailable
				</ToggleGroupItem>
			</ToggleGroup>
		);
		const item = screen.getByRole("radio", { name: "Unavailable" });
		expect(item).toHaveAttribute("data-size", "lg");
		expect(item).toHaveAttribute("data-variant", "outline");
		await userEvent.setup().click(item);
		expect(onValueChange).not.toHaveBeenCalled();
	});

	it("keeps standalone toggle buttons keyboard-accessible", async () => {
		const onPressedChange = vi.fn();
		render(
			<Toggle
				aria-label="Flag"
				onPressedChange={onPressedChange}
				size="sm"
				variant="outline"
			>
				Flag
			</Toggle>
		);
		const toggle = screen.getByRole("button", { name: "Flag" });
		expect(toggle).toHaveAttribute("aria-pressed", "false");
		toggle.focus();
		await userEvent.setup().keyboard(" ");
		expect(toggle).toHaveAttribute("aria-pressed", "true");
		expect(onPressedChange).toHaveBeenCalledExactlyOnceWith(true);
	});
});
