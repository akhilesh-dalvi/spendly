// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useCallback, useState } from "react";
import type { DateRange } from "react-day-picker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencyInput } from "./currency-input";
import { DatePicker, DatePickerWithRange } from "./date-picker";
import { Progress } from "./progress";

const SEPTEMBER_16 = /September 16/;
const SEPTEMBER_18 = /September 18/;

function RangePicker({
	onChange,
}: {
	onChange: (date: DateRange | undefined) => void;
}) {
	const [date, setDate] = useState<DateRange | undefined>({
		from: new Date(2026, 8, 10),
		to: new Date(2026, 8, 12),
	});
	const changeDate = useCallback(
		(nextDate: DateRange | undefined) => {
			setDate(nextDate);
			onChange(nextDate);
		},
		[onChange]
	);
	return (
		<DatePickerWithRange
			date={date}
			numberOfMonths={1}
			onDateChange={changeDate}
		/>
	);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 8, 15, 12));
});
afterEach(() => {
	vi.useRealTimers();
});

describe("currency entry", () => {
	it("exposes the native input through its React 19 ref prop", () => {
		const ref = createRef<HTMLInputElement>();
		render(<CurrencyInput aria-label="Amount" ref={ref} />);
		expect(ref.current).toBe(screen.getByRole("textbox", { name: "Amount" }));
		ref.current?.focus();
		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus();
	});
	it("accepts partial decimals, rejects non-numeric text, and clears without inventing zero", () => {
		const onChange = vi.fn();
		render(<CurrencyInput aria-label="Amount" onChange={onChange} />);
		const input = screen.getByRole("textbox", { name: "Amount" });
		fireEvent.change(input, { target: { value: "." } });
		expect(input).toHaveValue(".");
		expect(onChange).toHaveBeenLastCalledWith(undefined);
		fireEvent.change(input, { target: { value: "12.34" } });
		expect(input).toHaveValue("12.34");
		expect(onChange).toHaveBeenLastCalledWith(12.34);
		fireEvent.change(input, { target: { value: "12x" } });
		expect(input).toHaveValue("12.34");
		fireEvent.change(input, { target: { value: "" } });
		expect(input).toHaveValue("");
		expect(onChange).toHaveBeenLastCalledWith(undefined);
	});

	it("reflects controlled numeric changes and also works without an onChange callback", () => {
		const { rerender } = render(
			<CurrencyInput aria-label="Amount" value={0} />
		);
		expect(screen.getByLabelText("Amount")).toHaveValue("0");
		rerender(<CurrencyInput aria-label="Amount" value={50} />);
		expect(screen.getByLabelText("Amount")).toHaveValue("50");
		fireEvent.change(screen.getByLabelText("Amount"), {
			target: { value: "" },
		});
		expect(screen.getByLabelText("Amount")).toHaveValue("");
	});
});

describe("calendar inputs", () => {
	it("selects a real calendar day and reports it to the caller", async () => {
		const onDateChange = vi.fn();
		const user = userEvent.setup();
		render(<DatePicker onDateChange={onDateChange} placeholder="Choose day" />);
		await user.click(screen.getByRole("button", { name: "Choose day" }));
		await user.click(screen.getByRole("button", { name: SEPTEMBER_16 }));
		expect(onDateChange.mock.calls[0]?.[0]).toEqual(new Date(2026, 8, 16));
	});

	it("displays an existing date and does not open a disabled picker", async () => {
		render(
			<DatePicker
				date={new Date(2026, 8, 15)}
				disabled
				onDateChange={vi.fn()}
			/>
		);
		const trigger = screen.getByRole("button", {
			name: "September 15th, 2026",
		});
		expect(trigger).toBeDisabled();
		await userEvent.setup().click(trigger);
		expect(screen.queryByRole("grid")).not.toBeInTheDocument();
	});

	it("extends and displays an existing range through real calendar selections", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<RangePicker onChange={onChange} />);
		await user.click(
			screen.getByRole("button", { name: "Sep 10, 2026 - Sep 12, 2026" })
		);
		await user.click(screen.getByRole("button", { name: SEPTEMBER_16 }));
		expect(onChange).toHaveBeenLastCalledWith({
			from: new Date(2026, 8, 10),
			to: new Date(2026, 8, 16),
		});
		await user.click(screen.getByRole("button", { name: SEPTEMBER_18 }));
		expect(onChange).toHaveBeenLastCalledWith({
			from: new Date(2026, 8, 10),
			to: new Date(2026, 8, 18),
		});
		await user.keyboard("{Escape}");
		expect(
			screen.getByRole("button", { name: "Sep 10, 2026 - Sep 18, 2026" })
		).toBeVisible();
	});

	it("distinguishes empty and partially chosen ranges", () => {
		const { rerender } = render(
			<DatePickerWithRange
				date={undefined}
				onDateChange={vi.fn()}
				placeholder="Choose range"
			/>
		);
		expect(
			screen.getByRole("button", { name: "Choose range" })
		).toHaveAttribute("data-empty", "true");
		rerender(
			<DatePickerWithRange
				date={{ from: new Date(2026, 8, 15) }}
				onDateChange={vi.fn()}
			/>
		);
		expect(
			screen.getByRole("button", { name: "Sep 15, 2026" })
		).toHaveAttribute("data-empty", "false");
	});
});

describe("accessible progress", () => {
	it.each([0, 25, 100])(
		"exposes the actual %s%% value to assistive technology",
		(value) => {
			const { container } = render(
				<Progress aria-label="Budget used" value={value} />
			);
			expect(
				screen.getByRole("progressbar", { name: "Budget used" })
			).toHaveAttribute("aria-valuenow", String(value));
			expect(
				container.querySelector('[data-slot="progress-indicator"]')
			).toHaveStyle({ transform: `translateX(-${100 - value}%)` });
		}
	);

	it("does not report a fabricated value while progress is indeterminate", () => {
		render(<Progress aria-label="Loading" />);
		expect(
			screen.getByRole("progressbar", { name: "Loading" })
		).not.toHaveAttribute("aria-valuenow");
	});
});
