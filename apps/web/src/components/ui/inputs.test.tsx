// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useCallback, useState } from "react";
import type { DateRange } from "react-day-picker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencyInput } from "./currency-input";
import { DatePicker, DatePickerWithRange } from "./date-picker";
import { Progress } from "./progress";

const SEPTEMBER_16 = /September 16/;
const SEPTEMBER_18 = /September 18/;
const AUGUST_31 = /August 31st, 2026/;
const OCTOBER_1 = /October 1st, 2026/;
const NOVEMBER_30 = /November 30th, 2026/;
const JANUARY_1 = /January 1st, 2027/;

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
	it("hides adjacent-month dates in the single-date picker used by expense forms", async () => {
		const onDateChange = vi.fn();
		render(
			<DatePicker date={new Date(2026, 8, 15)} onDateChange={onDateChange} />
		);
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "September 15th, 2026" })
		);
		expect(
			within(screen.getByRole("grid")).getAllByRole("button")
		).toHaveLength(30);
		expect(
			screen.queryByRole("button", { name: AUGUST_31 })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: OCTOBER_1 })
		).not.toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Go to the Next Month" })
		);
		await interaction.click(screen.getByRole("button", { name: OCTOBER_1 }));
		expect(onDateChange.mock.calls[0]?.[0]).toEqual(new Date(2026, 9, 1));
	});

	it.each([1, 2])(
		"hides adjacent-month dates in the %s-month range picker used by cycle forms and onboarding",
		async (numberOfMonths) => {
			render(
				<DatePickerWithRange
					date={{ from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) }}
					numberOfMonths={numberOfMonths}
					onDateChange={vi.fn()}
				/>
			);
			await userEvent
				.setup()
				.click(
					screen.getByRole("button", { name: "Nov 01, 2026 - Nov 30, 2026" })
				);
			const grids = screen.getAllByRole("grid");
			expect(grids).toHaveLength(numberOfMonths);
			expect(within(grids[0]).getAllByRole("button")).toHaveLength(30);
			expect(screen.getAllByRole("button", { name: NOVEMBER_30 })).toHaveLength(
				1
			);
			expect(
				screen.queryByRole("button", { name: JANUARY_1 })
			).not.toBeInTheDocument();
			if (numberOfMonths === 2) {
				expect(within(grids[1]).getAllByRole("button")).toHaveLength(31);
			}
		}
	);

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
