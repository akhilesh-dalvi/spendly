// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import type { DateRange } from "react-day-picker";
import { describe, expect, it, vi } from "vitest";
import { Calendar } from "./calendar";

const NOVEMBER_30 = /November 30th, 2026/;
const DECEMBER_31 = /December 31st, 2026/;
const JANUARY_1 = /January 1st, 2027/;
const JANUARY_2 = /January 2nd, 2027/;

function RangeCalendar({
	onChange,
}: {
	onChange: (range: DateRange | undefined) => void;
}) {
	const [selected, setSelected] = useState<DateRange>();
	const select = useCallback(
		(range: DateRange | undefined) => {
			setSelected(range);
			onChange(range);
		},
		[onChange]
	);
	return (
		<Calendar
			defaultMonth={new Date(2026, 11, 1)}
			mode="range"
			numberOfMonths={2}
			onSelect={select}
			selected={selected}
		/>
	);
}

describe("shared calendar month boundaries", () => {
	it.each([
		{ days: 30, month: new Date(2026, 10, 1) },
		{ days: 31, month: new Date(2027, 0, 1) },
		{ days: 29, month: new Date(2028, 1, 1) },
	])(
		"leaves adjacent-month cells blank while preserving weekday alignment: $month",
		({ month, days }) => {
			const { container } = render(
				<Calendar defaultMonth={month} mode="single" />
			);
			expect(
				within(screen.getByRole("grid")).getAllByRole("button")
			).toHaveLength(days);
			const outsideCells = container.querySelectorAll('[data-outside="true"]');
			expect(outsideCells.length).toBeGreaterThan(0);
			for (const cell of outsideCells) {
				expect(cell).toHaveAttribute("data-hidden", "true");
				expect(cell).toHaveClass("invisible");
				expect(cell).toBeEmptyDOMElement();
				expect(cell.querySelector("button")).toBeNull();
			}
			const firstDay = container.querySelector(
				"[data-day]:not([data-outside])"
			);
			if (!firstDay?.parentElement) {
				throw new Error("First calendar day missing");
			}
			expect(firstDay.parentElement.children).toHaveLength(7);
			expect(
				Array.from(firstDay.parentElement.children).indexOf(firstDay)
			).toBe(month.getDay());
		}
	);

	it("shows each range endpoint only in its own month, never in the adjacent calendar", () => {
		const { container } = render(
			<Calendar
				defaultMonth={new Date(2026, 10, 1)}
				mode="range"
				numberOfMonths={2}
				selected={{ from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) }}
			/>
		);
		const grids = screen.getAllByRole("grid");
		expect(within(grids[0]).getAllByRole("button")).toHaveLength(30);
		expect(within(grids[1]).getAllByRole("button")).toHaveLength(31);
		expect(screen.getAllByRole("button", { name: NOVEMBER_30 })).toHaveLength(
			1
		);
		expect(screen.getByRole("button", { name: NOVEMBER_30 })).toHaveAttribute(
			"data-range-end",
			"true"
		);
		expect(
			screen.queryByRole("button", { name: JANUARY_1 })
		).not.toBeInTheDocument();
		for (const cell of container.querySelectorAll(
			'[data-outside="true"][data-selected="true"]'
		)) {
			expect(cell).toHaveAttribute("data-hidden", "true");
			expect(cell).toBeEmptyDOMElement();
		}
	});

	it("still selects a range across a year boundary", async () => {
		const onChange = vi.fn();
		render(<RangeCalendar onChange={onChange} />);
		const interaction = userEvent.setup();
		expect(screen.getAllByRole("button", { name: DECEMBER_31 })).toHaveLength(
			1
		);
		expect(screen.getAllByRole("button", { name: JANUARY_1 })).toHaveLength(1);
		await interaction.click(screen.getByRole("button", { name: DECEMBER_31 }));
		await interaction.click(screen.getByRole("button", { name: JANUARY_2 }));
		expect(onChange).toHaveBeenLastCalledWith({
			from: new Date(2026, 11, 31),
			to: new Date(2027, 0, 2),
		});
		expect(screen.getByRole("button", { name: DECEMBER_31 })).toHaveAttribute(
			"data-range-start",
			"true"
		);
		expect(screen.getByRole("button", { name: JANUARY_2 })).toHaveAttribute(
			"data-range-end",
			"true"
		);
	});

	it("keeps next/previous month navigation and future dates available", async () => {
		const onSelect = vi.fn();
		render(
			<Calendar
				defaultMonth={new Date(2026, 11, 1)}
				mode="single"
				onSelect={onSelect}
			/>
		);
		const interaction = userEvent.setup();
		expect(
			screen.queryByRole("button", { name: JANUARY_1 })
		).not.toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Go to the Next Month" })
		);
		await interaction.click(screen.getByRole("button", { name: JANUARY_1 }));
		expect(onSelect.mock.calls[0]?.[0]).toEqual(new Date(2027, 0, 1));
		await interaction.click(
			screen.getByRole("button", { name: "Go to the Previous Month" })
		);
		expect(
			screen.getByRole("button", { name: DECEMBER_31 })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: JANUARY_1 })
		).not.toBeInTheDocument();
	});

	it("moves keyboard focus across hidden month boundaries without selecting blank cells", async () => {
		const onSelect = vi.fn();
		render(
			<Calendar
				defaultMonth={new Date(2026, 11, 1)}
				mode="single"
				onSelect={onSelect}
				selected={new Date(2026, 11, 31)}
			/>
		);
		const interaction = userEvent.setup();
		screen.getByRole("button", { name: DECEMBER_31 }).focus();
		await interaction.keyboard("{ArrowRight}");
		expect(screen.getByRole("button", { name: JANUARY_1 })).toHaveFocus();
		await interaction.keyboard("{Enter}");
		expect(onSelect.mock.calls[0]?.[0]).toEqual(new Date(2027, 0, 1));
		await interaction.keyboard("{ArrowLeft}");
		expect(screen.getByRole("button", { name: DECEMBER_31 })).toHaveFocus();
	});
});
