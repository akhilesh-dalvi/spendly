// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { cloneElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

const service = vi.hoisted(() => ({
	data: {} as Record<string, unknown>,
	summaries: {} as Record<string, unknown>,
	query: vi.fn(),
	create: vi.fn(),
	createType: vi.fn(),
	dismiss: vi.fn(),
	error: vi.fn(),
	success: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("convex/react", () => ({
	useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
		const name = getFunctionName(ref);
		service.query(name, args);
		if (args === "skip") {
			return undefined;
		}
		if (
			name === "aggregations:getCycleSummary" &&
			typeof args === "object" &&
			args !== null &&
			"cycleId" in args &&
			typeof args.cycleId === "string"
		) {
			return service.summaries[args.cycleId];
		}
		return service.data[name];
	},
	useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
		const name = getFunctionName(ref);
		if (name === "cycles:create") {
			return service.create;
		}
		if (name === "categories:createType") {
			return service.createType;
		}
		return service.dismiss;
	},
}));
vi.mock("sonner", () => ({
	toast: { success: service.success, error: service.error },
}));
vi.mock("recharts", async (importOriginal) => ({
	...(await importOriginal<typeof import("recharts")>()),
	ResponsiveContainer: ({
		children,
	}: {
		children: ReactElement<{ width?: number; height?: number }>;
	}) => <div>{cloneElement(children, { width: 250, height: 250 })}</div>,
}));

const cycles = [
	{
		_id: "future",
		name: "July",
		startDate: "2026-07-01",
		endDate: "2026-07-31",
	},
	{
		_id: "current",
		name: "June",
		startDate: "2026-06-01",
		endDate: "2026-06-30",
	},
	{ _id: "past", name: "May", startDate: "2026-05-01", endDate: "2026-05-31" },
];
const accountSummary = {
	accounts: [{ name: "Checking", accountTypeName: "Bank", isDefault: true }],
	totals: [{ currency: "USD", total: 800 }],
	accountsOnboardingStatus: "completed",
};
const typeStats = [
	{
		typeId: "needs",
		typeName: "Needs",
		typeColor: "#123456",
		totalSpent: 20,
		totalPlanned: 100,
		categories: [
			{
				categoryId: "food",
				categoryTypeId: "needs",
				name: "Food",
				icon: "🍎",
				spent: 20,
				planned: 100,
				isHidden: false,
			},
		],
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	vi.setSystemTime(new Date("2026-06-15T12:00:00"));
	service.data = {
		"cycles:list": cycles,
		"cycles:getCurrent": cycles[1],
		"accounts:getSummary": accountSummary,
		"expenses:listRecent": [
			{
				_id: "expense1",
				amount: 20,
				date: "2026-06-15T09:00:00",
				spentOn: "Lunch",
				categoryId: "food",
				categoryName: "Food",
				categoryIcon: "🍎",
				accountName: "Archived wallet",
				accountTypeName: "Cash",
			},
		],
		"users:get": { currency: "USD", dashboardViewMode: "grouped" },
		"users:getOnboardingState": null,
		"categories:listTypes": [],
		"categories:listPreviousCycleUnused": [],
	};
	service.summaries = Object.fromEntries(
		cycles.map((cycle) => [
			cycle._id,
			{
				...cycle,
				totalSpent: cycle._id === "past" ? 150 : 20,
				totalPlanned: 100,
				daysRemaining: 15,
				typeStats,
			},
		])
	);
	service.dismiss.mockResolvedValue(undefined);
	service.createType.mockResolvedValue({ _id: "newtype" });
	service.create.mockImplementation(() => {
		service.data["cycles:list"] = cycles;
		return Promise.resolve({ _id: "current" });
	});
});
afterEach(() => vi.useRealTimers());

// Cycle arrow controls are currently icon-only and unnamed.
function arrow(
	container: HTMLElement,
	direction: "left" | "right"
): HTMLButtonElement {
	const button = container
		.querySelector(`svg.lucide-chevron-${direction}`)
		?.closest("button");
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Missing ${direction} cycle navigation`);
	}
	return button;
}

const lunchLink = /Lunch/;
const foodLink = /Food.*20%/;

describe("dashboard page", () => {
	it.each([
		"cycles:list",
		"cycles:getCurrent",
		"accounts:getSummary",
		"expenses:listRecent",
		"summary",
	])("waits for %s before rendering financial information", (query) => {
		if (query === "summary") {
			service.summaries.current = undefined;
		} else {
			service.data[query] = undefined;
		}
		const { container } = render(<DashboardPage />);
		expect(container.querySelector(".animate-spin")).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Add Category" })
		).not.toBeInTheDocument();
		expect(screen.queryByText("Tracked funds")).not.toBeInTheDocument();
	});

	it("loads budget, charts, active-account balances and historical activity from an archived account", () => {
		render(<DashboardPage />);
		expect(screen.getByRole("button", { name: "June" })).toBeVisible();
		expect(
			screen.getByRole("region", { name: "Budget left" })
		).toHaveTextContent("$80.00");
		expect(
			screen.getByRole("region", { name: "Tracked funds" })
		).toHaveTextContent("Across 1 account");
		expect(
			screen.getByRole("region", { name: "Tracked funds" })
		).toHaveTextContent("Checking · Bank");
		expect(screen.getByRole("link", { name: "Add Category" })).toHaveAttribute(
			"href",
			"/categories/new?id=current"
		);
		expect(screen.getByRole("link", { name: lunchLink })).toHaveAttribute(
			"href",
			"/expenses/expense1"
		);
		expect(screen.getByRole("link", { name: lunchLink })).toHaveTextContent(
			"Archived wallet · Cash"
		);
		expect(
			screen.getByRole("link", { name: "View full history" })
		).toHaveAttribute("href", "/expenses");
		expect(screen.getByRole("link", { name: foodLink })).toHaveAttribute(
			"href",
			"/categories/food"
		);
		expect(
			screen.queryByRole("link", { name: "Add account" })
		).not.toBeInTheDocument();
	});

	it("moves to adjacent cycles, updates the budget and links, and disables boundary arrows", async () => {
		const user = userEvent.setup();
		const { container } = render(<DashboardPage />);
		await user.click(arrow(container, "left"));
		expect(screen.getByRole("button", { name: "May" })).toBeVisible();
		expect(
			screen.getByRole("region", { name: "Over budget" })
		).toHaveTextContent("$50.00");
		expect(arrow(container, "left")).toBeDisabled();
		expect(screen.getByRole("link", { name: "Add Category" })).toHaveAttribute(
			"href",
			"/categories/new?id=past"
		);
		await user.click(arrow(container, "right"));
		await user.click(arrow(container, "right"));
		expect(screen.getByRole("button", { name: "July" })).toBeVisible();
		expect(
			screen.getByRole("region", { name: "Planned budget" })
		).toHaveTextContent("$100.00");
		expect(arrow(container, "right")).toBeDisabled();
		expect(service.query).toHaveBeenCalledWith("aggregations:getCycleSummary", {
			cycleId: "future",
		});
	});

	it("selects current, upcoming and historical cycles from grouped menu sections", async () => {
		const user = userEvent.setup();
		render(<DashboardPage />);
		await user.click(screen.getByRole("button", { name: "June" }));
		expect(screen.getByText("Current")).toBeVisible();
		expect(screen.getByText("Upcoming")).toBeVisible();
		expect(screen.getByText("History")).toBeVisible();
		await user.click(screen.getByRole("menuitem", { name: "July" }));
		expect(screen.getByRole("button", { name: "July" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "July" }));
		await user.click(screen.getByRole("menuitem", { name: "May" }));
		expect(screen.getByText("Ended")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "May" }));
		await user.click(screen.getByRole("menuitem", { name: "June" }));
		expect(screen.getByText("Active")).toBeVisible();
	});

	it("falls back to the first listed cycle and supports a list with no current or upcoming group", async () => {
		const user = userEvent.setup();
		service.data["cycles:getCurrent"] = null;
		service.data["cycles:list"] = [cycles[2]];
		render(<DashboardPage />);
		expect(screen.getByRole("button", { name: "May" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "May" }));
		expect(screen.getByText("History")).toBeVisible();
		expect(screen.queryByText("Current")).not.toBeInTheDocument();
		expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
	});

	it("returns to the account-only empty state when the selected cycle disappears", async () => {
		const user = userEvent.setup();
		const { container, rerender } = render(<DashboardPage />);
		await user.click(arrow(container, "left"));
		expect(screen.getByRole("button", { name: "May" })).toBeVisible();
		service.data["cycles:list"] = cycles.slice(0, 2);
		rerender(<DashboardPage />);
		expect(screen.getByText("No active cycle")).toBeVisible();
		expect(screen.getByRole("heading", { name: "Checking" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Create Cycle" })).toBeVisible();
		expect(service.query).toHaveBeenCalledWith(
			"aggregations:getCycleSummary",
			"skip"
		);
	});

	it("handles a current-cycle snapshot absent from the list without enabling unsafe navigation", async () => {
		const user = userEvent.setup();
		service.data["cycles:list"] = [];
		const { container } = render(<DashboardPage />);
		expect(screen.getByRole("button", { name: "June" })).toBeVisible();
		expect(arrow(container, "left")).toBeDisabled();
		expect(arrow(container, "right")).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "June" }));
		expect(screen.getByRole("button", { name: "New Cycle" })).toBeVisible();
		expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
	});

	it.each([
		"pending",
		"skipped",
		"completed",
		undefined,
	])("shows account onboarding only when no accounts exist and status=%s", (status) => {
		service.data["accounts:getSummary"] = {
			accounts: [],
			totals: [],
			accountsOnboardingStatus: status,
		};
		render(<DashboardPage />);
		if (status === "pending" || status === undefined) {
			expect(screen.getByRole("link", { name: "Add account" })).toHaveAttribute(
				"href",
				"/accounts/new"
			);
		} else {
			expect(
				screen.queryByRole("link", { name: "Add account" })
			).not.toBeInTheDocument();
		}
	});

	it("shows account balances without a cycle, creates the first cycle, and closes the real form", async () => {
		const user = userEvent.setup();
		service.data["cycles:list"] = [];
		service.data["cycles:getCurrent"] = null;
		const { rerender } = render(<DashboardPage />);
		expect(screen.getByText("No active cycle")).toBeVisible();
		expect(screen.getByRole("heading", { name: "Checking" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "$800.00" })).toBeVisible();
		expect(service.query).toHaveBeenCalledWith(
			"aggregations:getCycleSummary",
			"skip"
		);
		await user.click(screen.getByRole("button", { name: "Create Cycle" }));
		const dialog = screen.getByRole("dialog", { name: "Create First Cycle" });
		expect(within(dialog).getByLabelText("Cycle Name")).toHaveValue(
			"June 2026"
		);
		await user.click(
			within(dialog).getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		rerender(<DashboardPage />);
		expect(screen.getByRole("button", { name: "June" })).toBeVisible();
		expect(service.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "June 2026",
				startDate: "2026-06-01",
				endDate: "2026-06-30",
			})
		);
	});

	it("opens a new-cycle form from the loaded dashboard, keeps failures visible and closes after retry", async () => {
		const user = userEvent.setup();
		service.create.mockRejectedValueOnce(
			new Error("ConvexError: Cycle overlaps")
		);
		render(<DashboardPage />);
		await user.click(screen.getByRole("button", { name: "June" }));
		await user.click(screen.getByRole("button", { name: "New Cycle" }));
		const dialog = screen.getByRole("dialog", { name: "Create Expense Cycle" });
		await user.click(
			within(dialog).getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(service.error).toHaveBeenCalledWith("Cycle overlaps")
		);
		expect(dialog).toBeVisible();
		await user.click(
			within(dialog).getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		await user.keyboard("{Escape}");
		expect(screen.getByRole("button", { name: "June" })).toBeVisible();
	});

	it("shows empty allocation, category and activity guidance and opens the real type form", async () => {
		const user = userEvent.setup();
		service.summaries.current = {
			...cycles[1],
			totalSpent: 0,
			totalPlanned: 0,
			daysRemaining: 15,
			typeStats: [],
		};
		service.data["expenses:listRecent"] = [];
		const { container } = render(<DashboardPage />);
		expect(screen.getByText("No budget planned")).toBeVisible();
		expect(screen.getByText("No spending data")).toBeVisible();
		expect(screen.getByText("No categories yet")).toBeVisible();
		expect(screen.getByText("No transactions")).toBeVisible();
		const allocationHeading = screen.getByText("Allocation");
		const section = allocationHeading.parentElement;
		if (!section) {
			throw new Error("Missing allocation section");
		}
		await user.click(within(section).getByRole("button"));
		const dialog = screen.getByRole("dialog", { name: "Add Category Type" });
		await user.type(within(dialog).getByLabelText("Type Name"), "Travel");
		await user.click(
			within(dialog).getByRole("button", { name: "Add Category Type" })
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(service.createType).toHaveBeenCalledWith({
			name: "Travel",
			color: "#3b82f6",
		});
		expect(container).toHaveTextContent("Allocation");
	});

	it("passes existing allocation names to the type form and exposes optional setup resumption", async () => {
		const user = userEvent.setup();
		service.data["users:getOnboardingState"] = {
			step: "categories",
			path: "manual",
			cycle: cycles[1],
		};
		render(<DashboardPage />);
		expect(screen.getByRole("link", { name: "Resume setup" })).toHaveAttribute(
			"href",
			"/onboarding/categories?cycleId=current"
		);
		const heading = screen.getByText("Allocation");
		if (!heading.parentElement) {
			throw new Error("Missing allocation header");
		}
		await user.click(within(heading.parentElement).getByRole("button"));
		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).queryByRole("button", { name: "Needs" })
		).not.toBeInTheDocument();
		expect(within(dialog).getByRole("button", { name: "Wants" })).toBeVisible();
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
