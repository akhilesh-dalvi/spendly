// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	type CycleFilter,
	type CycleSort,
	CyclesControls,
} from "./cycles-controls";

function ControlsHarness() {
	const [filter, setFilter] = useState<CycleFilter>("all");
	const [sort, setSort] = useState<CycleSort>("newest");
	const [budget, setBudget] = useState(false);
	return (
		<CyclesControls
			budgetOnly={budget}
			onBudgetOnlyChange={setBudget}
			onFilterChange={setFilter}
			onSortChange={setSort}
			selectedFilter={filter}
			selectedSort={sort}
		/>
	);
}

describe("CyclesControls", () => {
	it("switches every filter and exposes the selected state", async () => {
		render(<ControlsHarness />);
		const interaction = userEvent.setup();
		expect(
			screen.getByRole("tablist", { name: "Cycle filter" })
		).toBeInTheDocument();
		for (const name of ["Current", "Upcoming", "History", "All"]) {
			await interaction.click(screen.getByRole("button", { name }));
			expect(screen.getByRole("button", { name })).toHaveAttribute(
				"aria-selected",
				"true"
			);
			const others = ["All", "Current", "Upcoming", "History"].filter(
				(label) => label !== name
			);
			for (const label of others) {
				expect(screen.getByRole("button", { name: label })).toHaveAttribute(
					"aria-selected",
					"false"
				);
			}
		}
	});

	it("selects every sorting mode through the real Radix listbox", async () => {
		render(<ControlsHarness />);
		const interaction = userEvent.setup();
		for (const label of [
			"Oldest first",
			"Highest planned",
			"Highest spent",
			"Newest first",
		]) {
			await interaction.click(
				screen.getByRole("combobox", { name: "Sort cycles" })
			);
			await interaction.click(screen.getByRole("option", { name: label }));
			expect(
				screen.getByRole("combobox", { name: "Sort cycles" })
			).toHaveTextContent(label);
		}
	});

	it("supports keyboard selection and toggles the budget filter on and off", async () => {
		const onSortChange = vi.fn();
		const onBudgetOnlyChange = vi.fn();
		const props = {
			selectedFilter: "all" as const,
			selectedSort: "newest" as const,
			onFilterChange: vi.fn(),
			onSortChange,
			onBudgetOnlyChange,
		};
		const view = render(<CyclesControls {...props} budgetOnly={false} />);
		const interaction = userEvent.setup();
		screen.getByRole("combobox", { name: "Sort cycles" }).focus();
		await interaction.keyboard("{Enter}{ArrowDown}{Enter}");
		expect(onSortChange).toHaveBeenCalledWith("oldest");
		const button = screen.getByRole("button", {
			name: "Show only with budget",
		});
		expect(button).toHaveAttribute("aria-pressed", "false");
		await interaction.click(button);
		expect(onBudgetOnlyChange).toHaveBeenCalledWith(true);
		view.rerender(<CyclesControls {...props} budgetOnly />);
		expect(button).toHaveAttribute("aria-pressed", "true");
		await interaction.click(button);
		expect(onBudgetOnlyChange).toHaveBeenLastCalledWith(false);
	});
});
