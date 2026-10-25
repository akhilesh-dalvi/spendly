// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { type ComponentProps, cloneElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategorySpendingChart } from "./category-spending-chart";
import { CategoryTypeChart } from "./category-type-chart";

const service = vi.hoisted(() => ({
	data: {} as Record<string, unknown>,
	updateCategory: vi.fn(),
	updateView: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("convex/react", () => ({
	useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
		service.data[getFunctionName(ref)],
	useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
		getFunctionName(ref) === "users:updateDashboardViewMode"
			? service.updateView
			: service.updateCategory,
}));
vi.mock("sonner", () => ({
	toast: { success: service.success, error: service.error },
}));
// Fix chart dimensions for jsdom; keep slices and legend real.
vi.mock("recharts", async (importOriginal) => ({
	...(await importOriginal<typeof import("recharts")>()),
	ResponsiveContainer: ({
		children,
	}: {
		children: ReactElement<{ width?: number; height?: number }>;
	}) => <div>{cloneElement(children, { width: 250, height: 250 })}</div>,
}));

type TypeStats = ComponentProps<typeof CategorySpendingChart>["typeStats"];
const typeStats: TypeStats = [
	{
		typeId: "needs",
		typeName: "Needs",
		typeColor: "#123456",
		totalPlanned: 180,
		totalSpent: 120,
		categories: [
			{
				categoryId: "food",
				categoryTypeId: "needs",
				name: "Food",
				icon: "🍎",
				planned: 100,
				spent: 20,
				isHidden: false,
			},
			{
				categoryId: "rent",
				categoryTypeId: "needs",
				name: "Rent",
				icon: null,
				planned: 50,
				spent: 80,
				isHidden: false,
			},
			{
				categoryId: "hidden",
				categoryTypeId: null,
				name: "Secret",
				icon: null,
				planned: 30,
				spent: 20,
				isHidden: true,
			},
		],
	},
	{
		typeId: null,
		typeName: "Other",
		typeColor: null,
		totalPlanned: 0,
		totalSpent: 40,
		categories: [
			{
				categoryId: "uncategorized",
				name: "Uncategorized",
				icon: null,
				planned: null,
				spent: 40,
				isHidden: false,
			},
		],
	},
	{
		typeId: "hidden-type",
		typeName: "Hidden Type",
		typeColor: null,
		totalPlanned: 0,
		totalSpent: 0,
		categories: [
			{
				categoryId: "hidden2",
				name: "Hidden Two",
				icon: null,
				planned: null,
				spent: 0,
				isHidden: true,
			},
		],
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	service.data = {
		"users:get": { currency: "USD", dashboardViewMode: "grouped" },
		"categories:listTypes": [],
		"categories:listPreviousCycleUnused": [],
	};
	service.updateCategory.mockResolvedValue(undefined);
	service.updateView.mockResolvedValue(undefined);
});

// Production icon-only controls do not have accessible names yet.
function iconButton(container: HTMLElement, icon: string): HTMLButtonElement {
	const button = container
		.querySelector(`svg.lucide-${icon}`)
		?.closest("button");
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Missing ${icon} control`);
	}
	return button;
}
function categoryMenu(name: string): HTMLButtonElement {
	const row = screen.getByRole("link", {
		name: new RegExp(`^.*${name}`),
	}).parentElement;
	if (!row) {
		throw new Error(`Missing ${name} row`);
	}
	return within(row).getByRole("button");
}
function categoryOrder(): string[] {
	return screen
		.getAllByRole("link")
		.map((link) => link.getAttribute("href"))
		.filter(
			(href): href is string =>
				href !== null &&
				((href.startsWith("/categories/") && !href.includes("new")) ||
					href === "/expenses?category=uncategorized")
		);
}

const rentLink = /Rent/;
const foodLink = /Food/;
const uncategorizedLink = /Uncategorized/;
const needsGroup = /Needs/;
const secretLink = /Secret/;
const saveChanges = /Save Changes/;

describe("category allocation chart", () => {
	it("offers a first expense when only zero or negative spending exists", () => {
		render(
			<CategoryTypeChart
				typeStats={[
					{
						typeId: "empty",
						typeName: "Unused",
						totalSpent: 0,
						totalPlanned: 100,
					},
					{ typeId: null, typeName: "Refund", totalSpent: -5, totalPlanned: 0 },
				]}
			/>
		);
		expect(screen.getByText("No spending data")).toBeVisible();
		expect(screen.getByRole("link", { name: "Add Expense" })).toHaveAttribute(
			"href",
			"/expenses/new"
		);
		expect(screen.queryByText("Unused")).not.toBeInTheDocument();
	});

	it("filters unused types and displays spending percentages, optional plans and color fallbacks", () => {
		render(
			<CategoryTypeChart
				typeStats={[
					{
						typeId: "needs",
						typeName: "Needs",
						totalSpent: 60,
						totalPlanned: 100,
						typeColor: "#123456",
					},
					{
						typeId: null,
						typeName: "Uncategorized",
						totalSpent: 30,
						totalPlanned: 0,
					},
					{
						typeId: "wants",
						typeName: "Wants",
						totalSpent: 10,
						totalPlanned: 0,
					},
					{
						typeId: "unused",
						typeName: "Unused",
						totalSpent: 0,
						totalPlanned: 200,
					},
				]}
			/>
		);
		expect(screen.getByText("60%")).toBeVisible();
		expect(screen.getByText("30%")).toBeVisible();
		expect(screen.getByText("10%")).toBeVisible();
		expect(screen.getByText("$60.00")).toHaveTextContent("$60.00/$100.00");
		expect(screen.getByText("$30.00")).toHaveTextContent("$30.00");
		expect(screen.queryByText("Unused")).not.toBeInTheDocument();
	});
});

describe("category spending chart", () => {
	it("shows a cycle-specific add link when no categories have been planned", () => {
		render(<CategorySpendingChart cycleId="cycle1" typeStats={[]} />);
		expect(screen.getByText("No categories yet")).toBeVisible();
		expect(screen.getByRole("link", { name: "Add Category" })).toHaveAttribute(
			"href",
			"/categories/new?id=cycle1"
		);
	});

	it("groups visible categories, explains overspending and unplanned spending, and collapses a type", async () => {
		const user = userEvent.setup();
		render(<CategorySpendingChart cycleId="cycle1" typeStats={typeStats} />);
		expect(screen.queryByText("Secret")).not.toBeInTheDocument();
		expect(screen.queryByText("Hidden Type")).not.toBeInTheDocument();
		expect(screen.getByRole("link", { name: rentLink })).toHaveTextContent(
			"Over: $30.00/Plan: $50.00"
		);
		expect(screen.getByRole("link", { name: foodLink })).toHaveTextContent(
			"Left: $80.00/Plan: $100.00"
		);
		expect(
			screen.getByRole("link", { name: uncategorizedLink })
		).toHaveAttribute("href", "/expenses?category=uncategorized");
		expect(
			screen.getByRole("link", { name: uncategorizedLink })
		).toHaveTextContent("No budget planned");
		await user.click(screen.getByRole("button", { name: needsGroup }));
		expect(
			screen.queryByRole("link", { name: rentLink })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: needsGroup }));
		expect(screen.getByRole("link", { name: rentLink })).toBeVisible();
	});

	it.each([
		{ option: "Spent (High to Low)", order: ["rent", "uncategorized", "food"] },
		{ option: "Spent (Low to High)", order: ["food", "uncategorized", "rent"] },
		{
			option: "Planned (High to Low)",
			order: ["food", "rent", "uncategorized"],
		},
		{
			option: "Planned (Low to High)",
			order: ["uncategorized", "rent", "food"],
		},
		{
			option: "Remaining (High to Low)",
			order: ["food", "rent", "uncategorized"],
		},
		{
			option: "Remaining (Low to High)",
			order: ["uncategorized", "rent", "food"],
		},
		{ option: "Name (A-Z)", order: ["food", "rent", "uncategorized"] },
		{ option: "Name (Z-A)", order: ["uncategorized", "rent", "food"] },
	])("orders the simple list by $option while omitting hidden categories", async ({
		option,
		order,
	}) => {
		const user = userEvent.setup();
		service.data["users:get"] = { currency: "USD", dashboardViewMode: "list" };
		const { container } = render(
			<CategorySpendingChart typeStats={typeStats} />
		);
		await user.click(iconButton(container, "arrow-down-wide-narrow"));
		await user.click(screen.getByRole("menuitem", { name: option }));
		expect(categoryOrder()).toEqual(
			order.map((id) =>
				id === "uncategorized"
					? "/expenses?category=uncategorized"
					: `/categories/${id}`
			)
		);
	});

	it("persists a view change and renders the saved simple list then grouped layout", async () => {
		const user = userEvent.setup();
		const { container, rerender } = render(
			<CategorySpendingChart typeStats={typeStats} />
		);
		await user.click(iconButton(container, "layout-grid"));
		await user.click(screen.getByRole("menuitem", { name: "Simple List" }));
		expect(service.updateView).toHaveBeenCalledWith({ viewMode: "list" });
		service.data["users:get"] = { dashboardViewMode: "list" };
		rerender(<CategorySpendingChart typeStats={typeStats} />);
		expect(
			screen.queryByRole("button", { name: needsGroup })
		).not.toBeInTheDocument();
		expect(categoryOrder()).toEqual([
			"/categories/rent",
			"/expenses?category=uncategorized",
			"/categories/food",
		]);
		await user.click(iconButton(container, "list"));
		await user.click(screen.getByRole("menuitem", { name: "Grouped by Type" }));
		expect(service.updateView).toHaveBeenLastCalledWith({
			viewMode: "grouped",
		});
		service.data["users:get"] = undefined;
		rerender(<CategorySpendingChart typeStats={typeStats} />);
		expect(screen.getByRole("button", { name: needsGroup })).toBeVisible();
	});

	it.each([
		false,
		true,
	])("hides a category with a user-facing result (failure=%s)", async (failure) => {
		const user = userEvent.setup();
		if (failure) {
			service.updateCategory.mockRejectedValueOnce(new Error("offline"));
		}
		render(<CategorySpendingChart typeStats={typeStats} />);
		await user.click(categoryMenu("Rent"));
		expect(
			screen.getByRole("menuitem", { name: "Add Expense" })
		).toHaveAttribute("href", "/expenses/new?categoryId=rent");
		expect(
			screen.getByRole("menuitem", { name: "View Details" })
		).toHaveAttribute("href", "/categories/rent");
		await user.click(
			screen.getByRole("menuitem", { name: "Hide from Dashboard" })
		);
		expect(service.updateCategory).toHaveBeenCalledWith({
			id: "rent",
			isHidden: true,
		});
		await waitFor(() =>
			expect(failure ? service.error : service.success).toHaveBeenCalledWith(
				failure ? "Failed to hide category" : "Rent hidden from dashboard"
			)
		);
	});

	it.each([
		false,
		true,
	])("restores hidden categories with a user-facing result (failure=%s)", async (failure) => {
		const user = userEvent.setup();
		if (failure) {
			service.updateCategory.mockRejectedValueOnce(new Error("offline"));
		}
		const { container, rerender } = render(
			<CategorySpendingChart typeStats={typeStats} />
		);
		await user.click(iconButton(container, "eye-off"));
		expect(screen.getByRole("menuitem", { name: "Hidden Two" })).toBeVisible();
		await user.click(screen.getByRole("menuitem", { name: "Secret" }));
		expect(service.updateCategory).toHaveBeenCalledWith({
			id: "hidden",
			isHidden: false,
		});
		await waitFor(() =>
			expect(failure ? service.error : service.success).toHaveBeenCalledWith(
				failure ? "Failed to update visibility" : "Secret is now visible"
			)
		);
		if (!failure) {
			rerender(
				<CategorySpendingChart
					typeStats={typeStats.map((type) => ({
						...type,
						categories: type.categories.map((category) =>
							category.categoryId === "hidden"
								? { ...category, isHidden: false }
								: category
						),
					}))}
				/>
			);
			expect(screen.getByRole("link", { name: secretLink })).toBeVisible();
		}
	});

	it("limits uncategorized actions to adding expenses and viewing details", async () => {
		const user = userEvent.setup();
		render(<CategorySpendingChart typeStats={typeStats} />);
		await user.click(categoryMenu("Uncategorized"));
		expect(
			screen.getByRole("menuitem", { name: "Add Expense" })
		).toHaveAttribute("href", "/expenses/new");
		expect(
			screen.getByRole("menuitem", { name: "View Details" })
		).toHaveAttribute("href", "/expenses?category=uncategorized");
		expect(
			screen.queryByRole("menuitem", { name: "Edit Category" })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("menuitem", { name: "Hide from Dashboard" })
		).not.toBeInTheDocument();
	});

	it("opens a prefilled real edit form, saves it, and closes the dialog on success", async () => {
		const user = userEvent.setup();
		render(<CategorySpendingChart cycleId="cycle1" typeStats={typeStats} />);
		await user.click(categoryMenu("Food"));
		await user.click(screen.getByRole("menuitem", { name: "Edit Category" }));
		const dialog = screen.getByRole("dialog", { name: "Edit Category" });
		expect(within(dialog).getByDisplayValue("Food")).toBeVisible();
		expect(within(dialog).getByDisplayValue("100")).toBeVisible();
		await user.click(within(dialog).getByRole("button", { name: saveChanges }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(service.updateCategory).toHaveBeenCalledWith({
			id: "food",
			name: "Food",
			plannedAmount: 100,
			categoryTypeId: "needs",
			icon: "🍎",
		});
	});

	it("preserves a null plan as an empty edit field and allows cancelling without a mutation", async () => {
		const user = userEvent.setup();
		const unplanned = [
			{
				typeId: null,
				typeName: "Other",
				typeColor: null,
				totalPlanned: 0,
				totalSpent: 5,
				categories: [
					{
						categoryId: "misc",
						name: "Misc",
						icon: null,
						planned: null,
						spent: 5,
						isHidden: false,
					},
				],
			},
		];
		render(<CategorySpendingChart cycleId="cycle1" typeStats={unplanned} />);
		await user.click(categoryMenu("Misc"));
		await user.click(screen.getByRole("menuitem", { name: "Edit Category" }));
		expect(screen.getByRole("dialog")).toHaveTextContent("Edit Category");
		expect(screen.getByPlaceholderText("0.00")).toHaveValue("");
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(service.updateCategory).not.toHaveBeenCalled();
	});
});
