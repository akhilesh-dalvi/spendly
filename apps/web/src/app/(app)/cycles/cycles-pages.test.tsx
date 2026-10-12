// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditCyclePage from "./[id]/edit/page";
import CycleDetailPage from "./[id]/page";
import NewCyclePage from "./new/page";
import CyclesPage from "./page";

const HISTORY_CYCLE_LINK = /\/cycles\/(june|may)$/;
const AUGUST_LABEL = /August budget/;
const JULY_LABEL = /July budget/;
const JUNE_LABEL = /June budget/;

const mocks = vi.hoisted(() => ({
	queries: new Map<string, unknown>(),
	query: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
	removeCategory: vi.fn(),
	createCategory: vi.fn(),
	updateCategory: vi.fn(),
	push: vi.fn(),
	replace: vi.fn(),
	back: vi.fn(),
	search: new URLSearchParams(),
	success: vi.fn(),
	error: vi.fn(),
}));
vi.mock("convex/react", async () => {
	const { getFunctionName: name } = await import("convex/server");
	return {
		useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
			mocks.query(name(ref), args);
			return args === "skip" ? undefined : mocks.queries.get(name(ref));
		},
		useMutation: (ref: FunctionReference<"mutation">) =>
			new Map([
				[name(api.cycles.create), mocks.create],
				[name(api.cycles.update), mocks.update],
				[name(api.cycles.remove), mocks.remove],
				[name(api.categories.remove), mocks.removeCategory],
				[name(api.categories.create), mocks.createCategory],
				[name(api.categories.update), mocks.updateCategory],
			]).get(name(ref)),
	};
});
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: mocks.push,
		replace: mocks.replace,
		back: mocks.back,
	}),
	useSearchParams: () => mocks.search,
}));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));
// Responsive Recharts sizing is peripheral to the route's behavior in jsdom.
vi.mock("@/components/category-type-chart", () => ({
	CategoryTypeChart: () => <div>Allocation chart</div>,
}));
vi.mock("@/components/category-spending-chart", () => ({
	CategorySpendingChart: () => <div>Spending chart</div>,
}));
function fixture<T extends FunctionReference<"query">>(
	ref: T,
	value: FunctionReturnType<T> | undefined
) {
	mocks.queries.set(getFunctionName(ref), value);
}
const userId = "user" as Id<"users">;
const cycleId = "july" as Id<"expense_cycles">;
const foodId = "food" as Id<"categories">;
function cycle(
	id: string,
	name: string,
	startDate: string,
	endDate: string
): Doc<"expense_cycles"> {
	return {
		_id: id as Id<"expense_cycles">,
		_creationTime: 0,
		userId,
		createdAt: 0,
		name,
		startDate,
		endDate,
	};
}
const current = cycle("july", "July budget", "2026-07-01", "2026-08-01");
const upcoming = cycle("aug", "August budget", "2026-08-01", "2026-09-01");
const past = cycle("june", "June budget", "2026-06-01", "2026-07-01");
const older = cycle("may", "May budget", "2026-05-01", "2026-06-01");
const categories: FunctionReturnType<typeof api.categories.list> = [
	{
		_id: foodId,
		_creationTime: 0,
		cycleId,
		userId,
		createdAt: 0,
		name: "Food",
		icon: "🍲",
		plannedAmount: 100,
		order: 0,
		typeName: "Needs",
		typeColor: "#123456",
	},
];
function setSummary(spent = 25, planned = 100) {
	fixture(api.aggregations.getCycleSummary, {
		cycleId,
		cycleName: current.name,
		startDate: current.startDate,
		endDate: current.endDate,
		totalSpent: spent,
		totalPlanned: planned,
		remaining: planned - spent,
		daysRemaining: 22,
		categoryStats: [],
		typeStats: [],
	});
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.queries.clear();
	mocks.search = new URLSearchParams();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 6, 10, 12));
	mocks.create.mockReset().mockResolvedValue(current);
	mocks.update.mockReset().mockResolvedValue(current);
	mocks.remove.mockReset().mockResolvedValue(null);
	mocks.removeCategory.mockReset().mockResolvedValue(null);
	mocks.createCategory.mockReset().mockResolvedValue({ _id: foodId });
	mocks.updateCategory.mockReset().mockResolvedValue({ _id: foodId });
	fixture(api.users.get, {
		_id: userId,
		_creationTime: 0,
		clerkId: "clerk",
		email: "test@example.com",
		createdAt: 0,
		currency: "USD",
	});
	fixture(api.cycles.list, [upcoming, current, past, older]);
	fixture(api.cycles.get, current);
	setSummary();
	fixture(api.categories.list, categories);
	fixture(api.categories.listTypes, []);
	fixture(api.expenses.list, []);
	fixture(api.aggregations.getHistoricalCategoryStats, {
		cycleName: "June budget",
		stats: { Food: 80 },
	});
});
afterEach(() => vi.useRealTimers());
async function renderDetail(tab = "overview") {
	mocks.search = new URLSearchParams(tab === "overview" ? "" : `tab=${tab}`);
	const params = Promise.resolve({ id: cycleId });
	let view: ReturnType<typeof render> | undefined;
	await act(async () => {
		await params;
		view = render(
			<Suspense fallback={<p>Resolving route</p>}>
				<CycleDetailPage params={params} />
			</Suspense>
		);
	});
	if (!view) {
		throw new Error("Route did not render");
	}
	return view;
}
async function renderEdit(id = cycleId) {
	const params = Promise.resolve({ id });
	await act(async () => {
		await params;
		render(
			<Suspense fallback={<p>Resolving route</p>}>
				<EditCyclePage params={params} />
			</Suspense>
		);
	});
}

describe("cycles index route", () => {
	it("loads before offering a first-cycle action for an empty account", () => {
		fixture(api.cycles.list, undefined);
		const view = render(<CyclesPage />);
		expect(screen.queryByRole("heading")).not.toBeInTheDocument();
		fixture(api.cycles.list, []);
		view.rerender(<CyclesPage />);
		expect(screen.getByText("No cycles found")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Create First Cycle" })
		).toHaveAttribute("href", "/cycles/new");
	});

	it("groups cycles and sorts history through the real controls", async () => {
		render(<CyclesPage />);
		expect(screen.getByRole("link", { name: "New Cycle" })).toHaveAttribute(
			"href",
			"/cycles/new"
		);
		expect(screen.getByText("Days Left")).toBeInTheDocument();
		expect(screen.getByText("$25.00 / $100.00")).toBeInTheDocument();
		expect(screen.getByText("Current Cycle")).toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "History" }));
		let links = screen
			.getAllByRole("link")
			.filter((link) =>
				HISTORY_CYCLE_LINK.test(link.getAttribute("href") ?? "")
			);
		expect(links.map((link) => link.getAttribute("href"))).toEqual([
			"/cycles/june",
			"/cycles/may",
		]);
		expect(
			screen.queryByRole("link", { name: AUGUST_LABEL })
		).not.toBeInTheDocument();
		await interaction.click(
			screen.getByRole("combobox", { name: "Sort cycles" })
		);
		await interaction.click(
			screen.getByRole("option", { name: "Oldest first" })
		);
		links = screen
			.getAllByRole("link")
			.filter((link) =>
				HISTORY_CYCLE_LINK.test(link.getAttribute("href") ?? "")
			);
		expect(links.map((link) => link.getAttribute("href"))).toEqual([
			"/cycles/may",
			"/cycles/june",
		]);
		await interaction.click(
			screen.getByRole("button", { name: "Show only with budget" })
		);
		expect(
			screen.getByRole("button", { name: "Show only with budget" })
		).toHaveAttribute("aria-pressed", "true");
	});

	it("shows loading summary, then can filter current and upcoming cycles", async () => {
		fixture(api.aggregations.getCycleSummary, undefined);
		const view = render(<CyclesPage />);
		expect(screen.getByText("Loading summary...")).toBeInTheDocument();
		setSummary();
		view.rerender(<CyclesPage />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Current" }));
		expect(screen.getByRole("link", { name: JULY_LABEL })).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: JUNE_LABEL })
		).not.toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Upcoming" }));
		expect(
			screen.getByRole("link", { name: AUGUST_LABEL })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: JULY_LABEL })
		).not.toBeInTheDocument();
	});

	it("resets an empty filter result and displays inactive-cycle summary", async () => {
		fixture(api.cycles.list, [past]);
		render(<CyclesPage />);
		expect(screen.getByText("No active cycle in progress")).toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Upcoming" }));
		expect(
			screen.getByText("No cycles match these filters")
		).toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Reset Filters" })
		);
		expect(screen.getByRole("link", { name: JUNE_LABEL })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
			"aria-selected",
			"true"
		);
	});
});

describe("new and edit cycle routes", () => {
	it("creates with the real form and provides back/list navigation", async () => {
		render(<NewCyclePage />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "" }));
		expect(mocks.back).toHaveBeenCalledOnce();
		await interaction.click(
			screen.getByRole("button", { name: "View all cycles" })
		);
		expect(mocks.push).toHaveBeenCalledWith("/cycles");
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.push).toHaveBeenCalledWith("/cycles/july")
		);
		expect(mocks.create).toHaveBeenCalledWith(
			expect.objectContaining({ name: "July 2026" })
		);
	});

	it("loads edit data, saves the real form, and navigates to the edited cycle", async () => {
		await renderEdit();
		expect(screen.getByLabelText("Cycle Name")).toHaveValue("July budget");
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "" }));
		expect(mocks.back).toHaveBeenCalledOnce();
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith({
				id: cycleId,
				name: "July budget",
				startDate: "2026-07-01",
				endDate: "2026-08-01",
			})
		);
		expect(mocks.push).toHaveBeenCalledWith("/cycles/july");
	});

	it("shows edit loading without rendering a form", async () => {
		fixture(api.cycles.get, undefined);
		await renderEdit();
		expect(screen.queryByLabelText("Cycle Name")).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(getFunctionName(api.cycles.get), {
			cycleId,
		});
	});

	it("handles missing cycles and returns to the list", async () => {
		// A stale route can receive no document at runtime even though the typed query normally throws.
		mocks.queries.set(getFunctionName(api.cycles.get), null);
		await renderEdit();
		expect(
			screen.getByRole("heading", { name: "Cycle not found" })
		).toBeInTheDocument();
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Back to Cycles" }));
		expect(mocks.push).toHaveBeenCalledWith("/cycles");
	});

	it("cancels and confirms cycle deletion through the real alert dialog", async () => {
		await renderEdit();
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "Delete Cycle" })
		);
		expect(screen.getByRole("alertdialog")).toHaveTextContent(
			"no expenses assigned"
		);
		await interaction.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.remove).not.toHaveBeenCalled();
		await interaction.click(
			screen.getByRole("button", { name: "Delete Cycle" })
		);
		await interaction.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Delete Cycle",
			})
		);
		await waitFor(() =>
			expect(mocks.remove).toHaveBeenCalledWith({ id: cycleId })
		);
		expect(mocks.success).toHaveBeenCalledWith("Cycle deleted successfully");
		expect(mocks.push).toHaveBeenCalledWith("/cycles");
	});

	it.each([
		new Error("ConvexError: Cycle has expenses"),
		"offline",
	])("reports delete failure without navigating (%s)", async (error) => {
		mocks.remove.mockRejectedValue(error);
		await renderEdit();
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "Delete Cycle" })
		);
		await interaction.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Delete Cycle",
			})
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				error instanceof Error ? "Cycle has expenses" : "Failed to delete cycle"
			)
		);
		expect(mocks.push).not.toHaveBeenCalled();
	});
});

describe("cycle detail route", () => {
	it("shows budget totals and routes tabs without losing other search parameters", async () => {
		await renderDetail("overview&keep=1");
		expect(
			screen.getByRole("heading", { name: "July budget" })
		).toBeInTheDocument();
		expect(screen.getByText("$25.00")).toBeInTheDocument();
		expect(screen.getByText("$75.00")).toBeInTheDocument();
		expect(screen.getByText("Remaining")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
			"href",
			"/cycles/july/edit"
		);
		await userEvent.setup().click(screen.getByRole("tab", { name: "Plan" }));
		expect(mocks.replace).toHaveBeenCalledWith("/cycles/july?tab=plan&keep=1");
	});

	it.each([
		[120, 100, "Over Budget"],
		[0, 0, "Remaining"],
	] as const)("handles budget totals %s/%s", async (spent, planned, label) => {
		setSummary(spent, planned);
		await renderDetail();
		expect(screen.getByText(label)).toBeInTheDocument();
		if (planned === 0) {
			expect(screen.getByText("—")).toBeInTheDocument();
		} else {
			expect(screen.getByText("$20.00")).toBeInTheDocument();
			expect(screen.getByText("(120%)")).toBeInTheDocument();
		}
	});

	it("navigates previous/next cycles while preserving the active tab", async () => {
		await renderDetail("activity");
		expect(
			screen.getByRole("heading", { name: "Transactions" })
		).toBeInTheDocument();
		expect(screen.getByText("No transactions")).toBeInTheDocument();
		const [previous, next] = screen.getAllByRole("button", { name: "" });
		const interaction = userEvent.setup();
		await interaction.click(previous);
		expect(mocks.push).toHaveBeenCalledWith("/cycles/june?tab=activity");
		await interaction.click(next);
		expect(mocks.push).toHaveBeenCalledWith("/cycles/aug?tab=activity");
	});

	it("disables adjacent navigation for a single cycle", async () => {
		fixture(api.cycles.list, [current]);
		await renderDetail();
		for (const button of screen.getAllByRole("button", { name: "" })) {
			expect(button).toBeDisabled();
		}
	});

	it("displays historical category spend and supports cancelling category deletion", async () => {
		await renderDetail("plan");
		expect(screen.getByText("Category Planning")).toBeInTheDocument();
		expect(screen.getByText("Last: $80.00")).toBeInTheDocument();
		const interaction = userEvent.setup();
		const food = screen
			.getByRole("heading", { name: "Food" })
			.closest('[data-slot="card"]');
		if (!(food instanceof HTMLElement)) {
			throw new Error("Category card missing");
		}
		const [, remove] = within(food).getAllByRole("button", { name: "" });
		await interaction.click(remove);
		expect(screen.getByRole("alertdialog")).toHaveTextContent(
			'delete the category "Food"'
		);
		await interaction.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.removeCategory).not.toHaveBeenCalled();
		await interaction.click(remove);
		await interaction.click(
			screen.getByRole("button", { name: "Delete Category" })
		);
		await waitFor(() =>
			expect(mocks.removeCategory).toHaveBeenCalledWith({ categoryId: foodId })
		);
		expect(mocks.success).toHaveBeenCalledWith("Category deleted");
	});

	it("shows an empty plan and opens/closes the real add-category dialog", async () => {
		fixture(api.categories.list, []);
		await renderDetail("plan");
		expect(screen.getByText("No categories added yet.")).toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "Add your first category" })
		);
		expect(screen.getByRole("dialog")).toHaveAccessibleName(
			"Add Category to July budget"
		);
		await interaction.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("deletes a cycle from its detail route", async () => {
		await renderDetail();
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Delete" }));
		await interaction.click(
			screen.getByRole("button", { name: "Delete Cycle" })
		);
		await waitFor(() =>
			expect(mocks.remove).toHaveBeenCalledWith({ id: cycleId })
		);
		expect(mocks.push).toHaveBeenCalledWith("/cycles");
	});

	it("handles a missing detail cycle with a route back to the list", async () => {
		mocks.queries.set(getFunctionName(api.cycles.get), null);
		await renderDetail();
		expect(
			screen.getByRole("heading", { name: "Cycle not found" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Back to Cycles" })
		).toHaveAttribute("href", "/cycles");
	});

	it.each([
		new Error("ConvexError: Cycle has expenses"),
		"offline",
	])("handles detail deletion errors without navigating (%s)", async (error) => {
		mocks.remove.mockRejectedValue(error);
		await renderDetail();
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Delete" }));
		await interaction.click(
			screen.getByRole("button", { name: "Delete Cycle" })
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				error instanceof Error ? "Cycle has expenses" : "Failed to delete cycle"
			)
		);
		expect(mocks.push).not.toHaveBeenCalled();
	});

	it("closes the add-category dialog only after the real form saves", async () => {
		await renderDetail("plan");
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "Add Category" })
		);
		const dialog = screen.getByRole("dialog");
		await interaction.type(
			within(dialog).getByPlaceholderText("Category name"),
			"Travel"
		);
		await interaction.click(
			within(dialog).getByRole("button", { name: "Add Category" })
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(mocks.createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ cycleId, name: "Travel" })
		);
	});

	it("opens an existing category editor and closes it after saving", async () => {
		await renderDetail("plan");
		const food = screen
			.getByRole("heading", { name: "Food" })
			.closest('[data-slot="card"]');
		if (!(food instanceof HTMLElement)) {
			throw new Error("Category card missing");
		}
		const interaction = userEvent.setup();
		await interaction.click(
			within(food).getAllByRole("button", { name: "" })[0]
		);
		const dialog = screen.getByRole("dialog", { name: "Edit Category: Food" });
		await interaction.click(
			within(dialog).getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(mocks.updateCategory).toHaveBeenCalledWith(
			expect.objectContaining({ id: foodId, name: "Food" })
		);
	});

	it("reports category deletion errors and keeps the plan visible", async () => {
		mocks.removeCategory.mockRejectedValue(new Error("offline"));
		await renderDetail("plan");
		const food = screen
			.getByRole("heading", { name: "Food" })
			.closest('[data-slot="card"]');
		if (!(food instanceof HTMLElement)) {
			throw new Error("Category card missing");
		}
		const interaction = userEvent.setup();
		await interaction.click(
			within(food).getAllByRole("button", { name: "" })[1]
		);
		await interaction.click(
			screen.getByRole("button", { name: "Delete Category" })
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to delete category")
		);
		expect(
			screen.getByRole("heading", { name: "Category Planning" })
		).toBeInTheDocument();
	});

	it("waits for summary data before showing cycle contents", async () => {
		fixture(api.aggregations.getCycleSummary, undefined);
		await renderDetail();
		expect(
			screen.queryByRole("heading", { name: "July budget" })
		).not.toBeInTheDocument();
	});
});
