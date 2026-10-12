// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ColorPicker,
	ColorPickerFormat,
	ColorPickerHue,
	ColorPickerOutput,
	ColorPickerSelection,
} from "./index";

function Picker(props: ComponentProps<typeof ColorPicker>) {
	return (
		<ColorPicker {...props}>
			<ColorPickerSelection data-testid="selection" />
			<ColorPickerHue aria-label="Hue" />
			<ColorPickerOutput aria-label="Color format" />
			<ColorPickerFormat data-testid="format" />
		</ColorPicker>
	);
}
const values = () =>
	screen
		.getAllByRole("textbox")
		.map((input) => (input as HTMLInputElement).value);
const chooseFormat = async (format: string) => {
	const user = userEvent.setup();
	await user.click(screen.getByRole("combobox", { name: "Color format" }));
	await user.click(screen.getByRole("option", { name: format }));
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Kibo ColorPicker", () => {
	it("provides a default black color, emits RGBA and keeps format inputs read-only", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<Picker onChange={onChange} />);
		expect(values()).toEqual(["#000000", "100"]);
		expect(onChange).toHaveBeenCalledExactlyOnceWith([0, 0, 0, 1]);
		expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
		for (const input of screen.getAllByRole("textbox")) {
			expect(input).toHaveAttribute("readonly");
		}
		await user.type(screen.getAllByRole("textbox")[0], "#FFFFFF");
		expect(values()).toEqual(["#000000", "100"]);
		expect(onChange).toHaveBeenCalledOnce();
	});

	it("changes between HEX, RGB, CSS and HSL through the real format select", async () => {
		render(<Picker defaultValue="#FF0000" />);
		expect(values()).toEqual(["#FF0000", "100"]);
		await chooseFormat("RGB");
		expect(values()).toEqual(["255", "0", "0", "100"]);
		await chooseFormat("CSS");
		expect(values()).toEqual(["rgba(255, 0, 0, 100%)"]);
		await chooseFormat("HSL");
		expect(values()).toEqual(["0", "100", "50", "100"]);
		await chooseFormat("HEX");
		expect(values()).toEqual(["#FF0000", "100"]);
	});

	it("reflects a controlled external color and alpha without sending a redundant parent notification", async () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<Picker onChange={onChange} value="rgba(255, 0, 0, 0.5)" />
		);
		expect(values()).toEqual(["#FF0000", "50"]);
		expect(onChange).not.toHaveBeenCalled();
		rerender(<Picker onChange={onChange} value="rgba(0, 0, 255, 0.25)" />);
		await waitFor(() => expect(values()).toEqual(["#0000FF", "25"]));
		expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "240");
		expect(onChange).not.toHaveBeenCalled();
	});

	it("changes hue with arrow, page and boundary keys and emits corresponding RGBA", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Picker defaultValue="#FF0000" onChange={onChange} />);
		const hue = screen.getByRole("slider");
		hue.focus();
		await user.keyboard("{ArrowRight}");
		expect(hue).toHaveAttribute("aria-valuenow", "1");
		expect(onChange).toHaveBeenLastCalledWith([255, 4.25, 0, 1]);
		await user.keyboard("{PageUp}");
		expect(hue).toHaveAttribute("aria-valuenow", "11");
		await user.keyboard("{End}");
		expect(hue).toHaveAttribute("aria-valuenow", "360");
		expect(values()).toEqual(["#FF0000", "100"]);
		await user.keyboard("{ArrowRight}");
		expect(hue).toHaveAttribute("aria-valuenow", "360");
		await user.keyboard("{Home}");
		expect(hue).toHaveAttribute("aria-valuenow", "0");
	});

	it("maps dragged pointer coordinates to saturation/lightness, clamps outside bounds and stops on pointerup", () => {
		const onChange = vi.fn();
		render(<Picker defaultValue="#FF0000" onChange={onChange} />);
		const selection = screen.getByTestId("selection");
		vi.spyOn(selection, "getBoundingClientRect").mockReturnValue({
			x: 10,
			y: 20,
			left: 10,
			top: 20,
			width: 100,
			height: 100,
			right: 110,
			bottom: 120,
			toJSON: () => ({}),
		});
		const pointer = (
			target: Element | Window,
			type: string,
			x: number,
			y: number
		) =>
			fireEvent(
				target,
				new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
			);
		onChange.mockClear();
		pointer(window, "pointermove", 60, 70);
		expect(onChange).not.toHaveBeenCalled();
		pointer(selection, "pointerdown", 60, 70);
		pointer(window, "pointermove", 110, 20);
		expect(values()).toEqual(["#FF0000", "100"]);
		pointer(window, "pointermove", 0, 0);
		expect(values()).toEqual(["#FFFFFF", "100"]);
		expect(onChange).toHaveBeenLastCalledWith([255, 255, 255, 1]);
		pointer(window, "pointermove", 500, 500);
		expect(values()).toEqual(["#000000", "100"]);
		expect(onChange).toHaveBeenLastCalledWith([0, 0, 0, 1]);
		pointer(window, "pointermove", 60, 70);
		expect(values()).toEqual(["#8F3030", "100"]);
		expect(selection.firstElementChild).toHaveStyle({
			left: "50%",
			top: "50%",
		});
		pointer(window, "pointerup", 60, 70);
		const calls = onChange.mock.calls.length;
		pointer(window, "pointermove", 0, 0);
		expect(onChange).toHaveBeenCalledTimes(calls);
		expect(values()).toEqual(["#8F3030", "100"]);
	});

	it("preserves alpha in RGBA notifications when changing hue on a translucent default", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Picker defaultValue="rgba(255, 0, 0, 0.25)" onChange={onChange} />);
		expect(values()).toEqual(["#FF0000", "25"]);
		expect(onChange).toHaveBeenLastCalledWith([255, 0, 0, 0.25]);
		screen.getByRole("slider").focus();
		await user.keyboard("{ArrowRight}");
		expect(onChange).toHaveBeenLastCalledWith([255, 4.25, 0, 0.25]);
		expect(values()[1]).toBe("25");
	});

	it("cleans up pointer listeners when unmounted during a drag", () => {
		const remove = vi.spyOn(window, "removeEventListener");
		const { unmount } = render(<Picker defaultValue="#FF0000" />);
		fireEvent.pointerDown(screen.getByTestId("selection"));
		remove.mockClear();
		unmount();
		expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
		expect(remove).toHaveBeenCalledWith("pointerup", expect.any(Function));
	});

	it("rejects standalone controls with a useful provider error", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		expect(() => render(<ColorPickerFormat />)).toThrow(
			"useColorPicker must be used within a ColorPickerProvider"
		);
	});
});
