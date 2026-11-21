// @vitest-environment jsdom

import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseDateFilter } from "./expense-date-filter";

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 6, 10, 12));
});
afterEach(() => vi.useRealTimers());

const JUNE_15 = /June 15th, 2026/;
const JULY_10 = /July 10th, 2026/;
const JULY_12 = /July 12th, 2026/;
const NOVEMBER_30 = /November 30th, 2026/;
const DECEMBER_1 = /December 1st, 2026/;
const JANUARY_1 = /January 1st, 2027/;

describe("expense date filter", () => {
	it("explains to-date presets and keeps Monday week-to-date as a single inclusive day", async () => {
		vi.setSystemTime(new Date(2026, 10, 16, 12));
		const onApply = vi.fn();
		render(
			<ExpenseDateFilter onApply={onApply} value={{ from: "", through: "" }} />
		);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		expect(
			screen.getByRole("radiogroup", { name: "Date presets" })
		).toHaveAccessibleDescription(
			"Weeks start Monday. “To date” ends today. All ranges include both dates."
		);
		expect(
			screen.getByRole("radio", { name: "Month to date" })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("radio", { name: "This week" })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("radio", { name: "This month" })
		).not.toBeInTheDocument();
		await interaction.click(
			screen.getByRole("radio", { name: "Week to date" })
		);
		expect(screen.getByLabelText("From")).toHaveValue("2026-11-16");
		expect(screen.getByLabelText("Through")).toHaveValue("2026-11-16");
		expect(onApply).not.toHaveBeenCalled();
	});

	it.each([
		["Today", "2026-07-10", "2026-07-10"],
		["Week to date", "2026-07-06", "2026-07-10"],
		["Last week", "2026-06-29", "2026-07-05"],
		["Month to date", "2026-07-01", "2026-07-10"],
		["Last month", "2026-06-01", "2026-06-30"],
		["Last 30 days", "2026-06-11", "2026-07-10"],
	])(
		"fills and highlights %s without applying until confirmed",
		async (label, from, through) => {
			const onApply = vi.fn();
			render(
				<ExpenseDateFilter
					onApply={onApply}
					value={{ from: "", through: "" }}
				/>
			);
			const interaction = userEvent.setup();
			await interaction.click(
				screen.getByRole("button", { name: "Date range" })
			);
			await interaction.click(
				within(
					screen.getByRole("radiogroup", { name: "Date presets" })
				).getByRole("radio", { name: label })
			);
			expect(screen.getByLabelText("From")).toHaveValue(from);
			expect(screen.getByLabelText("Through")).toHaveValue(through);
			expect(screen.getByRole("radio", { name: label })).toHaveAttribute(
				"aria-checked",
				"true"
			);
			const dialog = screen.getByRole("dialog");
			expect(
				dialog.querySelector(
					`[role="gridcell"][data-day="${from}"]:not([data-outside])`
				)
			).toHaveAttribute("aria-selected", "true");
			expect(
				dialog.querySelector(
					`[role="gridcell"][data-day="${through}"]:not([data-outside])`
				)
			).toHaveAttribute("aria-selected", "true");
			expect(onApply).not.toHaveBeenCalled();
			await interaction.click(screen.getByRole("button", { name: "Apply" }));
			expect(onApply).toHaveBeenCalledExactlyOnceWith({ from, through });
		}
	);

	it("supports preset keyboard selection and clears the preset indicator after manual edits", async () => {
		const onApply = vi.fn();
		render(
			<ExpenseDateFilter onApply={onApply} value={{ from: "", through: "" }} />
		);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		screen.getByRole("radio", { name: "Today" }).focus();
		await interaction.keyboard("{ArrowRight}{Enter}");
		expect(screen.getByRole("radio", { name: "Week to date" })).toHaveAttribute(
			"aria-checked",
			"true"
		);
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-06");
		expect(onApply).not.toHaveBeenCalled();
		await interaction.clear(screen.getByLabelText("From"));
		expect(screen.getByRole("radio", { name: "Week to date" })).toHaveAttribute(
			"aria-checked",
			"false"
		);
		await interaction.click(
			screen.getByRole("radio", { name: "Month to date" })
		);
		await interaction.clear(screen.getByLabelText("Through"));
		expect(
			screen.getByRole("radio", { name: "Month to date" })
		).toHaveAttribute("aria-checked", "false");
		await interaction.click(screen.getByRole("radio", { name: "Last month" }));
		await interaction.click(screen.getByRole("button", { name: JUNE_15 }));
		expect(screen.getByRole("radio", { name: "Last month" })).toHaveAttribute(
			"aria-checked",
			"false"
		);
	});

	it("discards unapplied presets on Escape and outside close", async () => {
		const onApply = vi.fn();
		render(
			<>
				<ExpenseDateFilter
					onApply={onApply}
					value={{ from: "2026-07-10", through: "" }}
				/>
				<button type="button">Outside</button>
			</>
		);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.click(screen.getByRole("radio", { name: "Last month" }));
		await interaction.keyboard("{Escape}");
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-10");
		expect(screen.getByLabelText("Through")).toHaveValue("");
		expect(screen.getByRole("radio", { name: "Last month" })).toHaveAttribute(
			"aria-checked",
			"false"
		);
		await interaction.click(
			screen.getByRole("radio", { name: "Month to date" })
		);
		await interaction.click(screen.getByRole("button", { name: "Outside" }));
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-10");
		expect(screen.getByLabelText("Through")).toHaveValue("");
		expect(onApply).not.toHaveBeenCalled();
	});

	it("refreshes Today after midnight and leaves a repeated preset selection intact", async () => {
		const onApply = vi.fn();
		render(
			<ExpenseDateFilter onApply={onApply} value={{ from: "", through: "" }} />
		);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.click(screen.getByRole("radio", { name: "Today" }));
		await interaction.click(screen.getByRole("radio", { name: "Today" }));
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-10");
		vi.setSystemTime(new Date(2026, 6, 11, 0, 1));
		await interaction.click(screen.getByRole("radio", { name: "Today" }));
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-11");
		expect(screen.getByLabelText("Through")).toHaveValue("2026-07-11");
		await interaction.keyboard("{Escape}");
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.click(screen.getByRole("radio", { name: "Today" }));
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-11");
		expect(screen.getByLabelText("Through")).toHaveValue("2026-07-11");
		expect(onApply).not.toHaveBeenCalled();
	});

	it.each([375, 1440])(
		"hides adjacent-month dates without losing range endpoints at %spx",
		async (width) => {
			const previousWidth = window.innerWidth;
			Object.defineProperty(window, "innerWidth", {
				configurable: true,
				value: width,
			});
			try {
				render(
					<ExpenseDateFilter
						onApply={vi.fn()}
						value={{ from: "2026-11-01", through: "2026-11-30" }}
					/>
				);
				await userEvent
					.setup()
					.click(screen.getByRole("button", { name: "Date range" }));
				const grids = screen.getAllByRole("grid");
				expect(grids).toHaveLength(width < 768 ? 1 : 2);
				expect(within(grids[0]).getAllByRole("button")).toHaveLength(30);
				expect(
					screen.getAllByRole("button", { name: NOVEMBER_30 })
				).toHaveLength(1);
				expect(
					screen.getByRole("button", { name: NOVEMBER_30 })
				).toHaveAttribute("data-range-end", "true");
				expect(
					within(grids[0]).queryByRole("button", { name: DECEMBER_1 })
				).not.toBeInTheDocument();
				expect(
					screen.queryByRole("button", { name: JANUARY_1 })
				).not.toBeInTheDocument();
				expect(
					within(
						screen.getByRole("radiogroup", { name: "Date presets" })
					).getAllByRole("radio")
				).toHaveLength(6);
				await userEvent
					.setup()
					.click(screen.getByRole("radio", { name: "Month to date" }));
				expect(screen.getByLabelText("From")).toHaveValue("2026-07-01");
				expect(screen.getByLabelText("Through")).toHaveValue("2026-07-10");
				expect(screen.getAllByRole("grid")).toHaveLength(width < 768 ? 1 : 2);
			} finally {
				Object.defineProperty(window, "innerWidth", {
					configurable: true,
					value: previousWidth,
				});
			}
		}
	);

	it("keeps typed edits private until Apply and supports keyboard submission", async () => {
		const onApply = vi.fn();
		render(
			<ExpenseDateFilter onApply={onApply} value={{ from: "", through: "" }} />
		);
		const interaction = userEvent.setup();
		expect(
			screen.getByRole("button", { name: "Date range" })
		).toHaveTextContent("All dates");
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		expect(screen.getAllByRole("grid")).toHaveLength(2);
		await interaction.type(screen.getByLabelText("From"), "2026-07-10");
		await interaction.type(screen.getByLabelText("Through"), "2026-07-10");
		expect(onApply).not.toHaveBeenCalled();
		await interaction.keyboard("{Enter}");
		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			from: "2026-07-10",
			through: "2026-07-10",
		});
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Date range" })).toHaveFocus()
		);
	});

	it("discards drafts on Escape and outside close and reopens with the applied values", async () => {
		const onApply = vi.fn();
		render(
			<>
				<ExpenseDateFilter
					onApply={onApply}
					value={{ from: "2026-07-10", through: "" }}
				/>
				<button type="button">Outside</button>
			</>
		);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.type(screen.getByLabelText("Through"), "2026-07-12");
		await interaction.keyboard("{Escape}");
		expect(onApply).not.toHaveBeenCalled();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		expect(screen.getByLabelText("Through")).toHaveValue("");
		await interaction.clear(screen.getByLabelText("From"));
		await interaction.click(screen.getByRole("button", { name: "Outside" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-10");
		expect(onApply).not.toHaveBeenCalled();
	});

	it("blocks malformed dates and reversed ranges with an accessible error", async () => {
		const onApply = vi.fn();
		render(
			<ExpenseDateFilter onApply={onApply} value={{ from: "", through: "" }} />
		);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.type(screen.getByLabelText("From"), "2026-02-30");
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Enter a valid From date as YYYY-MM-DD."
		);
		expect(screen.getByLabelText("From")).toHaveAttribute(
			"aria-invalid",
			"true"
		);
		expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
		await interaction.clear(screen.getByLabelText("From"));
		await interaction.type(screen.getByLabelText("From"), "2026-07-12");
		await interaction.type(screen.getByLabelText("Through"), "2026-07-10");
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Through must be on or after From."
		);
		fireEvent.submit(
			screen.getByRole("button", { name: "Apply" }).closest("form") ??
				document.body
		);
		expect(onApply).not.toHaveBeenCalled();
	});

	it.each([
		{ from: "2026-07-10", through: "" },
		{ from: "", through: "2026-07-10" },
	])("applies an open-ended range: %j", async (value) => {
		const onApply = vi.fn();
		render(<ExpenseDateFilter onApply={onApply} value={value} />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.click(screen.getByRole("button", { name: "Apply" }));
		expect(onApply).toHaveBeenCalledExactlyOnceWith(value);
	});

	it("selects an inclusive calendar range without applying it immediately", async () => {
		const onApply = vi.fn();
		render(
			<ExpenseDateFilter onApply={onApply} value={{ from: "", through: "" }} />
		);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.click(screen.getByRole("button", { name: JULY_10 }));
		await interaction.click(screen.getByRole("button", { name: JULY_12 }));
		expect(screen.getByLabelText("From")).toHaveValue("2026-07-10");
		expect(screen.getByLabelText("Through")).toHaveValue("2026-07-12");
		expect(onApply).not.toHaveBeenCalled();
		await interaction.click(screen.getByRole("button", { name: "Apply" }));
		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			from: "2026-07-10",
			through: "2026-07-12",
		});
	});

	it("uses one month on mobile and supports calendar arrow-key selection and Clear", async () => {
		const previousWidth = window.innerWidth;
		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			value: 375,
		});
		try {
			const onApply = vi.fn();
			render(
				<ExpenseDateFilter
					onApply={onApply}
					value={{ from: "2026-07-10", through: "2026-07-10" }}
				/>
			);
			const interaction = userEvent.setup();
			await interaction.click(
				screen.getByRole("button", { name: "Date range" })
			);
			expect(screen.getAllByRole("grid")).toHaveLength(1);
			screen.getByRole("button", { name: JULY_10 }).focus();
			await interaction.keyboard("{ArrowRight}{Enter}");
			expect(screen.getByLabelText("Through")).toHaveValue("2026-07-11");
			await interaction.click(screen.getByRole("button", { name: "Clear" }));
			expect(onApply).toHaveBeenCalledExactlyOnceWith({
				from: "",
				through: "",
			});
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		} finally {
			Object.defineProperty(window, "innerWidth", {
				configurable: true,
				value: previousWidth,
			});
		}
	});
});
