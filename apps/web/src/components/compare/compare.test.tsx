// @vitest-environment jsdom
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComparePage from "../../app/(app)/compare/page";
import { CompareCategoryBreakdownList } from "./compare-category-breakdown-list";
import { CompareCycleOverviewCards } from "./compare-cycle-overview-cards";
import { CompareCycleSelector } from "./compare-cycle-selector";
import { CompareKpiStrip } from "./compare-kpi-strip";
import type { CompareCycleRow } from "./types";

const service = vi.hoisted(() => ({
	data: {} as Record<string, unknown>,
	params: new URLSearchParams(),
	router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
	query: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => service.router,
	useSearchParams: () => service.params,
}));
vi.mock("convex/react", () => ({
	useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
		const name = getFunctionName(ref);
		service.query(name, args);
		return args === "skip" ? undefined : service.data[name];
	},
}));

const options = ["January", "February", "March", "April", "May", "June"].map(
	(name, index) => ({
		id: `cycle${index + 1}`,
		name,
		startDate: "2026-01-01",
		endDate: "2026-01-31",
	})
);
const rows: CompareCycleRow[] = [
	{
		cycleId: "cycle1" as Id<"expense_cycles">,
		cycleName: "January",
		startDate: "2026-01-01",
		endDate: "2026-01-31",
		totalSpent: 150,
		totalPlanned: 100,
		categoryBreakdown: [
			{ categoryName: "Food", spent: 60, planned: 50 },
			{ categoryName: "Food", spent: 90, planned: 50 },
			{ categoryName: "Unplanned", spent: 10, planned: null },
			{ categoryName: "Unplanned", spent: 5, planned: 0 },
		],
	},
	{
		cycleId: "cycle2" as Id<"expense_cycles">,
		cycleName: "February",
		startDate: "2026-02-01",
		endDate: "2026-02-28",
		totalSpent: 20,
		totalPlanned: 0,
		categoryBreakdown: [{ categoryName: "Transport", spent: 20, planned: 0 }],
	},
];
const money = (amount: number) =>
	`${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;

beforeEach(() => {
	vi.clearAllMocks();
	service.params = new URLSearchParams();
	service.data = {
		"users:get": { currency: "USD" },
		"cycles:list": options.map(({ id, ...cycle }) => ({ _id: id, ...cycle })),
		"aggregations:compareMultiple": rows,
	};
});

function SelectorHarness({ initialIds = [] }: { initialIds?: string[] }) {
	const [selectedIds, setSelectedIds] = useState(initialIds);
	return (
		<CompareCycleSelector
			cycles={options}
			max={2}
			onChange={setSelectedIds}
			selectedIds={selectedIds}
		/>
	);
}

const januaryOption = /January/;
const februaryOption = /February/;
const marchOption = /March/;
const foodCategory = /^Food/;
const unplannedCategory = /^Unplanned/;
const transportCategory = /^Transport/;
const selectionNote =
	/2 invalid selections were removed\. 2 duplicate entries were ignored\. selection trimmed to the first 5 cycles/;

describe("comparison cycle selector", () => {
	it("searches, selects, enforces the maximum, deselects and removes selected badges", async () => {
		const user = userEvent.setup();
		render(<SelectorHarness />);
		expect(screen.getByText("No cycles selected yet.")).toBeVisible();
		await user.click(screen.getByRole("combobox"));
		const search = screen.getByPlaceholderText("Search cycles...");
		await user.type(search, "January");
		expect(screen.getAllByRole("option")).toHaveLength(1);
		await user.click(screen.getByRole("option", { name: januaryOption }));
		expect(
			screen.getByRole("button", { name: "Remove January" })
		).toBeVisible();
		expect(screen.getByText("1 cycle selected")).toBeVisible();
		await user.clear(search);
		await user.click(screen.getByRole("option", { name: februaryOption }));
		expect(screen.getByRole("option", { name: marchOption })).toHaveAttribute(
			"aria-disabled",
			"true"
		);
		await user.click(screen.getByRole("option", { name: marchOption }));
		expect(
			screen.queryByRole("button", { name: "Remove March" })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("option", { name: januaryOption }));
		expect(screen.getByRole("option", { name: marchOption })).toHaveAttribute(
			"aria-disabled",
			"false"
		);
		await user.type(search, "nothing matches");
		expect(screen.getByText("No cycles found.")).toBeVisible();
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Remove February" }));
		expect(screen.getByText("No cycles selected yet.")).toBeVisible();
	});
});

describe("comparison breakdown", () => {
	it("aggregates duplicate category names and expands overspending, missing and unplanned cells", async () => {
		const user = userEvent.setup();
		render(<CompareCategoryBreakdownList formatCurrency={money} rows={rows} />);
		const food = screen.getByRole("button", { name: foodCategory });
		expect(food).toHaveTextContent("$150.00 / $100.00");
		expect(food).toHaveTextContent("100%");
		expect(within(food).getByRole("progressbar").firstElementChild).toHaveStyle(
			{ transform: "translateX(-0%)" }
		);
		await user.click(food);
		expect(screen.getByText("-$50.00")).toHaveClass("text-destructive");
		expect(screen.getByText("No data for this category")).toBeVisible();
		await user.click(screen.getByRole("button", { name: unplannedCategory }));
		expect(screen.queryByText("-$50.00")).not.toBeInTheDocument();
		expect(screen.getAllByText("$15.00")).toHaveLength(2);
		expect(screen.getByText("Budget utilization")).toBeVisible();
		await user.click(screen.getByRole("button", { name: unplannedCategory }));
		expect(screen.queryByText("Budget utilization")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: transportCategory }));
		expect(screen.getByText("No data for this category")).toBeVisible();
	});

	it("shows an explicit empty breakdown rather than an empty table", () => {
		render(
			<CompareCategoryBreakdownList
				formatCurrency={money}
				rows={rows.map((row) => ({ ...row, categoryBreakdown: [] }))}
			/>
		);
		expect(
			screen.getByText("No category breakdown for the selected cycles.")
		).toBeVisible();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("distinguishes capped overspending from a cycle without a plan in overview cards", () => {
		render(<CompareCycleOverviewCards formatCurrency={money} rows={rows} />);
		expect(screen.getByText("-$50.00")).toBeVisible();
		expect(screen.getByText("100% spent")).toBeVisible();
		expect(screen.getByText("0% spent")).toBeVisible();
		expect(screen.getByText("$20.00 of —")).toBeVisible();
		expect(screen.getByText("Feb 1 - Feb 28, 2026")).toBeVisible();
		expect(
			screen
				.getAllByRole("progressbar")
				.map((bar) => bar.getAttribute("aria-valuenow"))
		).toEqual(["100", "0"]);
		expect(
			screen
				.getAllByRole("progressbar")
				.map((bar) => bar.firstElementChild?.getAttribute("style"))
		).toEqual(["transform: translateX(-0%);", "transform: translateX(-100%);"]);
	});

	it.each([
		{
			totalPlanned: 100,
			netRemaining: -70,
			planned: "$100.00",
			remaining: "-$70.00",
			status: "Planned minus spent",
		},
		{
			totalPlanned: 200,
			netRemaining: 30,
			planned: "$200.00",
			remaining: "$30.00",
			status: "Planned minus spent",
		},
		{
			totalPlanned: 0,
			netRemaining: -170,
			planned: "—",
			remaining: "—",
			status: "No planned values to compare",
		},
	])("explains planned=$totalPlanned across the selection", ({
		totalPlanned,
		netRemaining,
		planned,
		remaining,
		status,
	}) => {
		render(
			<CompareKpiStrip
				formatCurrency={money}
				totals={{ cycleCount: 2, totalSpent: 170, totalPlanned, netRemaining }}
			/>
		);
		expect(screen.getByText("Total Spent").parentElement).toHaveTextContent(
			"$170.00"
		);
		expect(screen.getByText("Total Planned").parentElement).toHaveTextContent(
			planned
		);
		expect(screen.getByText("Net Remaining").parentElement).toHaveTextContent(
			remaining
		);
		expect(screen.getByText(status)).toBeVisible();
	});
});

describe("comparison page", () => {
	it("waits for the cycle list before presenting selectors or querying comparisons", () => {
		service.data["cycles:list"] = undefined;
		const { container } = render(<ComparePage />);
		expect(
			container.querySelector('[data-slot="skeleton"]')
		).toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(service.query).toHaveBeenCalledWith(
			"aggregations:compareMultiple",
			"skip"
		);
	});

	it("directs a new user to create cycles", () => {
		service.data["cycles:list"] = [];
		render(<ComparePage />);
		expect(screen.getByText("No cycles to compare")).toBeVisible();
		expect(screen.getByRole("link", { name: "Create Cycle" })).toHaveAttribute(
			"href",
			"/cycles/new"
		);
	});

	it("pushes a read-only selection and can clear it without changing financial data", async () => {
		const user = userEvent.setup();
		service.params = new URLSearchParams("cycles=cycle1");
		const { rerender } = render(<ComparePage />);
		expect(
			screen.getByText(
				"Choose at least two cycles to view spending and category comparisons."
			)
		).toBeVisible();
		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: februaryOption }));
		expect(service.router.push).toHaveBeenCalledWith(
			"/compare?cycles=cycle1,cycle2",
			{ scroll: false }
		);
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Remove January" }));
		expect(service.router.push).toHaveBeenLastCalledWith("/compare", {
			scroll: false,
		});
		service.params = new URLSearchParams();
		rerender(<ComparePage />);
		expect(screen.getByText("No cycles selected yet.")).toBeVisible();
		expect(service.router.replace).not.toHaveBeenCalled();
	});

	it("sanitizes invalid, duplicate and excess URL selections before sending the query", () => {
		service.params = new URLSearchParams(
			"cycles=cycle1,cycle1,javascript:alert(1),bad,cycle2,cycle2,cycle3,cycle4,cycle5,cycle6"
		);
		render(<ComparePage />);
		expect(service.router.replace).toHaveBeenCalledWith(
			"/compare?cycles=cycle1,cycle2,cycle3,cycle4,cycle5",
			{ scroll: false }
		);
		expect(service.query).toHaveBeenCalledWith("aggregations:compareMultiple", {
			cycleIds: ["cycle1", "cycle2", "cycle3", "cycle4", "cycle5"],
		});
		expect(screen.getByText(selectionNote)).toBeVisible();
		expect(screen.getByText("5 cycles selected")).toBeVisible();
	});

	it("explains singular invalid and duplicate selections", () => {
		service.params = new URLSearchParams("cycles=cycle1,cycle1,unknown");
		render(<ComparePage />);
		expect(
			screen.getByText(
				"1 invalid selection was removed. 1 duplicate entry was ignored."
			)
		).toBeVisible();
		expect(service.query).toHaveBeenCalledWith(
			"aggregations:compareMultiple",
			"skip"
		);
	});

	it("keeps selection visible while loading and retries unavailable comparison data", async () => {
		const user = userEvent.setup();
		service.params = new URLSearchParams("cycles=cycle1,cycle2");
		service.data["aggregations:compareMultiple"] = undefined;
		const { container, rerender } = render(<ComparePage />);
		expect(screen.getByText("2 cycles selected")).toBeVisible();
		expect(
			container.querySelector('[data-slot="skeleton"]')
		).toBeInTheDocument();
		expect(screen.queryByText("Cycles Compared")).not.toBeInTheDocument();
		service.data["aggregations:compareMultiple"] = null;
		rerender(<ComparePage />);
		expect(screen.getByText("Unable to load comparison data")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(service.router.refresh).toHaveBeenCalledOnce();
	});

	it("loads real KPI, overview and expandable category components for a valid URL", async () => {
		const user = userEvent.setup();
		service.params = new URLSearchParams("cycles=cycle1,cycle2");
		render(<ComparePage />);
		expect(
			screen.getByRole("heading", { name: "Compare Cycles" })
		).toBeVisible();
		expect(screen.getByText("Total Spent").parentElement).toHaveTextContent(
			"$170.00"
		);
		expect(screen.getByText("Net Remaining").parentElement).toHaveTextContent(
			"-$70.00"
		);
		expect(screen.getByText("100% spent")).toBeVisible();
		await user.click(screen.getByRole("button", { name: foodCategory }));
		expect(screen.getByText("No data for this category")).toBeVisible();
		expect(screen.getAllByText("-$50.00")).toHaveLength(2);
		expect(document.querySelector('a[href="/dashboard"]')).toBeInTheDocument();
		expect(service.router.replace).not.toHaveBeenCalled();
	});
});
