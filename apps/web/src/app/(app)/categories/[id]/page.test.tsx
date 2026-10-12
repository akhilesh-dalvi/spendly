// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CategoryDetailPage from "./page";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
	removeExpense: vi.fn(),
	push: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	report: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		({
			"categories:update": mocks.update,
			"categories:remove": mocks.remove,
			"expenses:remove": mocks.removeExpense,
		})[getFunctionName(reference)],
}));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));
// Forms have dedicated tests; inspect the public defaults and close callbacks here.
vi.mock("@/components/category-form", () => ({
	CategoryForm: ({ onSuccess, ...props }: { onSuccess: () => void }) => (
		<div>
			<output data-testid="category-defaults">{JSON.stringify(props)}</output>
			<button onClick={onSuccess} type="button">
				Finish category edit
			</button>
		</div>
	),
}));
vi.mock("@/components/expense-form", () => ({
	ExpenseForm: ({ onSuccess, ...props }: { onSuccess: () => void }) => (
		<div>
			<output data-testid="expense-defaults">{JSON.stringify(props)}</output>
			<button onClick={onSuccess} type="button">
				Finish expense
			</button>
		</div>
	),
}));
const categoryId = "category-rent";
const cycleId = "cycle-march";
const category = {
	_id: categoryId,
	cycleId,
	name: "Rent",
	categoryTypeId: "type-needs",
	plannedAmount: 100,
	icon: "🏠",
	isHidden: false,
};
const expenses = [
	{ _id: "expense-coffee", amount: 25, date: "2026-03-02", spentOn: "Coffee" },
	{ _id: "expense-rent", amount: 50, date: "2026-03-01", spentOn: null },
];
const fixtures = new Map<string, unknown>();
const page = (params: Promise<{ id: string }>) => (
	<Suspense fallback={<p>Waiting for route</p>}>
		<CategoryDetailPage params={params} />
	</Suspense>
);
const renderPage = async () => {
	const params = Promise.resolve({ id: categoryId });
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(page(params));
		await params;
	});
	await screen.findByRole("heading", { name: "Rent", level: 1 });
	return { ...view, refresh: () => view.rerender(page(params)) };
};

beforeEach(() => {
	vi.clearAllMocks();
	fixtures.clear();
	fixtures.set(getFunctionName(api.categories.get), category);
	fixtures.set(getFunctionName(api.categories.listTypes), [
		{ _id: "type-needs", name: "Needs", color: "#123456" },
	]);
	fixtures.set(getFunctionName(api.cycles.get), { name: "March" });
	fixtures.set(getFunctionName(api.aggregations.getHistoricalCategoryStats), {
		cycleName: "February",
		stats: { Rent: 60 },
	});
	fixtures.set(getFunctionName(api.expenses.list), expenses);
	fixtures.set(getFunctionName(api.users.get), { currency: "USD" });
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0], args: unknown) =>
			args === "skip" ? undefined : fixtures.get(getFunctionName(reference))
	);
	mocks.remove.mockResolvedValue({ affectedExpenses: 0 });
	mocks.removeExpense.mockResolvedValue(undefined);
	mocks.update.mockResolvedValue(undefined);
});

describe("category detail and transaction columns", () => {
	it("waits for category and expenses and renders the not-found back link", async () => {
		fixtures.set(getFunctionName(api.categories.get), undefined);
		const params = Promise.resolve({ id: categoryId });
		let view!: ReturnType<typeof render>;
		await act(async () => {
			view = render(page(params));
			await params;
		});
		const { rerender } = view;
		await waitFor(() =>
			expect(mocks.query).toHaveBeenCalledWith(api.cycles.get, "skip")
		);
		expect(
			screen.queryByRole("heading", { name: "Rent" })
		).not.toBeInTheDocument();
		fixtures.set(getFunctionName(api.categories.get), category);
		fixtures.set(getFunctionName(api.expenses.list), undefined);
		rerender(page(params));
		expect(
			screen.queryByRole("heading", { name: "Rent" })
		).not.toBeInTheDocument();
		fixtures.set(getFunctionName(api.expenses.list), []);
		fixtures.set(getFunctionName(api.categories.get), null);
		rerender(page(params));
		expect(
			screen.getByRole("heading", { name: "Category not found" })
		).toBeVisible();
		expect(
			screen.getByRole("link", { name: "Back to Dashboard" })
		).toHaveAttribute("href", "/dashboard");
	});

	it("shows owned query filters, aggregate budget, description fallback and real table sorting and filtering", async () => {
		const user = userEvent.setup();
		await renderPage();
		expect(mocks.query).toHaveBeenCalledWith(api.categories.get, {
			id: categoryId,
		});
		expect(mocks.query).toHaveBeenCalledWith(api.expenses.list, { categoryId });
		expect(mocks.query).toHaveBeenCalledWith(api.cycles.get, { cycleId });
		expect(mocks.query).toHaveBeenCalledWith(
			api.aggregations.getHistoricalCategoryStats,
			{ currentCycleId: cycleId }
		);
		expect(screen.getByText("• March")).toBeVisible();
		expect(screen.getByText("Needs")).toBeVisible();
		expect(screen.getByRole("heading", { name: "$75.00" })).toBeVisible();
		expect(screen.getByText("(75%)")).toBeVisible();
		expect(screen.getByRole("heading", { name: "$25.00" })).toBeVisible();
		expect(screen.getByText("No description")).toBeVisible();
		const rows = () =>
			within(screen.getByRole("table")).getAllByRole("row").slice(1);
		await user.click(screen.getByRole("button", { name: "Date" }));
		expect(rows()[0]).toHaveTextContent("No description");
		await user.click(screen.getByRole("button", { name: "Date" }));
		expect(rows()[0]).toHaveTextContent("Coffee");
		await user.click(screen.getByRole("button", { name: "Amount" }));
		expect(rows()[0]).toHaveTextContent("Coffee");
		await user.click(screen.getByRole("button", { name: "Amount" }));
		expect(rows()[0]).toHaveTextContent("No description");
		await user.type(
			screen.getByPlaceholderText("Filter all columns..."),
			" Coffee "
		);
		expect(rows()).toHaveLength(1);
		expect(rows()[0]).toHaveTextContent("Coffee");
		await user.clear(screen.getByPlaceholderText("Filter all columns..."));
		await user.type(
			screen.getByPlaceholderText("Filter all columns..."),
			"nonexistent"
		);
		expect(screen.getByText("No results.")).toBeVisible();
	});

	it.each([
		{
			spent: 40,
			planned: 100,
			label: "Remaining",
			remainder: "$60.00",
			width: "40%",
			color: "rgb(18, 52, 86)",
		},
		{
			spent: 90,
			planned: 100,
			label: "Remaining",
			remainder: "$10.00",
			width: "90%",
			color: "hsl(var(--amber-500))",
		},
		{
			spent: 125,
			planned: 100,
			label: "Over Budget",
			remainder: "$25.00",
			width: "100%",
			color: "hsl(var(--destructive))",
		},
	])("renders $spent spent against a $planned plan", async ({
		spent,
		planned,
		label,
		remainder,
		width,
		color,
	}) => {
		fixtures.set(getFunctionName(api.categories.get), {
			...category,
			plannedAmount: planned,
		});
		fixtures.set(getFunctionName(api.expenses.list), [
			{ ...expenses[0], amount: spent },
		]);
		const { container } = await renderPage();
		expect(screen.getByText(label)).toBeVisible();
		expect(screen.getByRole("heading", { name: remainder })).toBeVisible();
		const progress = container.querySelector<HTMLElement>(
			".h-full.transition-all"
		);
		expect(progress?.style.width).toBe(width);
		expect(progress?.style.backgroundColor).toBe(color);
	});

	it("handles absent plans, type, cycle and historical record, and opens an expense from the empty state", async () => {
		const user = userEvent.setup();
		fixtures.set(getFunctionName(api.categories.get), {
			...category,
			plannedAmount: undefined,
			categoryTypeId: undefined,
			icon: undefined,
		});
		fixtures.set(getFunctionName(api.categories.listTypes), undefined);
		fixtures.set(getFunctionName(api.cycles.get), undefined);
		fixtures.set(
			getFunctionName(api.aggregations.getHistoricalCategoryStats),
			null
		);
		fixtures.set(getFunctionName(api.expenses.list), []);
		await renderPage();
		expect(screen.getByText("📦")).toBeVisible();
		expect(screen.getByRole("heading", { name: "—" })).toBeVisible();
		expect(screen.queryByText("Needs")).not.toBeInTheDocument();
		expect(screen.getByText("No transactions yet")).toBeVisible();
		expect(screen.getByText("0 total")).toBeVisible();
		await user.click(screen.getAllByRole("button", { name: "Add Expense" })[1]);
		expect(
			screen.getByRole("dialog", { name: "Add Expense to Rent" })
		).toBeVisible();
		expect(
			JSON.parse(screen.getByTestId("expense-defaults").textContent ?? "{}")
		).toEqual({ defaultValues: { categoryId } });
		await user.click(screen.getByRole("button", { name: "Finish expense" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("passes category defaults and historical spend to edit, and closes both dialog actions on success", async () => {
		const user = userEvent.setup();
		await renderPage();
		await user.click(screen.getByRole("button", { name: "Edit" }));
		expect(
			JSON.parse(screen.getByTestId("category-defaults").textContent ?? "{}")
		).toEqual({
			categoryId,
			cycleId,
			defaultValues: {
				name: "Rent",
				categoryTypeId: "type-needs",
				plannedAmount: 100,
				icon: "🏠",
			},
			historicalSpent: { amount: 60, cycleName: "February" },
		});
		await user.click(
			screen.getByRole("button", { name: "Finish category edit" })
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Add Expense" }));
		expect(
			screen.getByRole("dialog", { name: "Add Expense to Rent" })
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Finish expense" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("omits null defaults and unmatched historical spending while editing an untyped category", async () => {
		const user = userEvent.setup();
		fixtures.set(getFunctionName(api.categories.get), {
			...category,
			categoryTypeId: null,
			plannedAmount: null,
			icon: null,
		});
		fixtures.set(getFunctionName(api.aggregations.getHistoricalCategoryStats), {
			cycleName: "February",
			stats: { Food: 20 },
		});
		await renderPage();
		await user.click(screen.getByRole("button", { name: "Edit" }));
		expect(
			JSON.parse(screen.getByTestId("category-defaults").textContent ?? "{}")
		).toEqual({ categoryId, cycleId, defaultValues: { name: "Rent" } });
	});

	it.each([
		false,
		true,
	])("toggles dashboard visibility from hidden=%s and surfaces mutation failure", async (isHidden) => {
		const user = userEvent.setup();
		fixtures.set(getFunctionName(api.categories.get), {
			...category,
			isHidden,
		});
		await renderPage();
		const button = screen.getByRole("button", {
			name: isHidden ? "Show on Dashboard" : "Hide from Dashboard",
		});
		await user.click(button);
		expect(mocks.update).toHaveBeenCalledWith({
			id: categoryId,
			isHidden: !isHidden,
		});
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith(
				isHidden
					? "Category now visible on dashboard"
					: "Category hidden from dashboard"
			)
		);
		mocks.update.mockRejectedValueOnce(new Error("offline"));
		await user.click(button);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to update visibility")
		);
		expect(mocks.push).not.toHaveBeenCalled();
	});

	it.each([
		0, 2,
	])("requires confirmation and redirects after deletion with %s affected expenses", async (affectedExpenses) => {
		const user = userEvent.setup();
		mocks.remove.mockResolvedValueOnce({ affectedExpenses });
		await renderPage();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(screen.getByRole("alertdialog")).toHaveTextContent(
			'Any expenses in this category will become "Uncategorized".'
		);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.remove).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		await user.click(screen.getByRole("button", { name: "Delete Category" }));
		await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
		expect(mocks.remove).toHaveBeenCalledWith({ categoryId });
		expect(mocks.success).toHaveBeenCalledWith(
			affectedExpenses
				? "Category deleted. 2 expenses moved to Uncategorized."
				: "Category deleted"
		);
		expect(
			screen.queryByRole("heading", { name: "Rent" })
		).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(api.categories.get, "skip");
		expect(mocks.query).toHaveBeenCalledWith(api.expenses.list, "skip");
	});

	it("recovers from deletion failure without leaving the page, and omits the expense warning for an empty category", async () => {
		const user = userEvent.setup();
		mocks.remove.mockRejectedValueOnce(new Error("offline"));
		fixtures.set(getFunctionName(api.expenses.list), []);
		await renderPage();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(screen.getByRole("alertdialog")).not.toHaveTextContent(
			"Uncategorized"
		);
		await user.click(screen.getByRole("button", { name: "Delete Category" }));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to delete category")
		);
		expect(screen.getByRole("heading", { name: "Rent" })).toBeVisible();
		expect(mocks.push).not.toHaveBeenCalled();
		await user.click(
			screen.getByRole("button", { name: "Hide from Dashboard" })
		);
		expect(mocks.update).toHaveBeenCalledWith({
			id: categoryId,
			isHidden: true,
		});
	});

	it("links transaction edit actions and deletes expenses with success and failure feedback", async () => {
		const user = userEvent.setup();
		await renderPage();
		await user.click(screen.getAllByRole("button", { name: "Open menu" })[0]);
		expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
			"href",
			"/expenses/expense-coffee"
		);
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Expense deleted")
		);
		expect(mocks.removeExpense).toHaveBeenCalledWith({ id: "expense-coffee" });
		const error = new Error("offline");
		mocks.removeExpense.mockRejectedValueOnce(error);
		await user.click(screen.getAllByRole("button", { name: "Open menu" })[1]);
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to delete expense")
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "expenses",
			operation: "delete",
		});
		expect(mocks.removeExpense).toHaveBeenLastCalledWith({
			id: "expense-rent",
		});
	});
});
