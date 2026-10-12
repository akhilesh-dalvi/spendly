// @vitest-environment jsdom

import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryForm } from "./category-form";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	update: vi.fn(),
	createType: vi.fn(),
	query: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		({
			"categories:create": mocks.create,
			"categories:update": mocks.update,
			"categories:createType": mocks.createType,
		})[getFunctionName(reference)],
}));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/hooks/use-currency", () => ({
	useCurrency: () => ({ format: (amount: number) => `$${amount.toFixed(2)}` }),
}));

const cycleId = "cycle-march" as Id<"expense_cycles">;
const categoryId = "category-rent" as Id<"categories">;
const types = [
	{ _id: "type-needs", name: "Needs", color: "#3b82f6" },
	{ _id: "type-wants", name: "Wants" },
];
const previous = [
	{
		_id: "old-rent",
		name: "Rent",
		plannedAmount: 1200,
		categoryTypeId: "type-needs",
		icon: "🏠",
	},
	{ _id: "old-books", name: "Books", plannedAmount: 30 },
];
const names = () => screen.getAllByPlaceholderText("Category name");
const amounts = () => screen.getAllByPlaceholderText("0.00");
const typeSelects = () =>
	screen
		.getAllByRole("combobox")
		.filter(
			(element) => element.getAttribute("aria-label") !== "Choose an icon"
		);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0]) =>
			getFunctionName(reference) === "categories:listTypes" ? types : previous
	);
	mocks.create.mockResolvedValue({ _id: categoryId });
	mocks.update.mockResolvedValue(undefined);
	mocks.createType.mockResolvedValue({ _id: "type-custom" });
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("CategoryForm", () => {
	it("requires a named category and creates a typed budget with a real emoji selection", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		render(<CategoryForm cycleId={cycleId} onSuccess={onSuccess} />);
		expect(screen.getByRole("button", { name: "Add Category" })).toBeDisabled();
		await user.type(names()[0], "   ");
		expect(screen.getByRole("button", { name: "Add Category" })).toBeDisabled();
		await user.clear(names()[0]);
		await user.type(names()[0], "Groceries");
		fireEvent.change(amounts()[0], { target: { value: "125.50" } });
		expect(amounts()[0]).toHaveValue("125.5");
		fireEvent.change(amounts()[0], { target: { value: "125.555" } });
		expect(amounts()[0]).toHaveValue("125.5");
		fireEvent.change(amounts()[0], { target: { value: "-10" } });
		expect(amounts()[0]).toHaveValue("125.5");
		await user.click(typeSelects()[0]);
		await user.click(screen.getByRole("option", { name: "Needs" }));
		await user.click(screen.getByRole("combobox", { name: "Choose an icon" }));
		await user.type(screen.getByPlaceholderText("Search emojis..."), "salad");
		await user.click(screen.getByRole("button", { name: "🥗" }));
		await user.click(screen.getByRole("button", { name: "Add Category" }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		expect(mocks.create).toHaveBeenCalledWith({
			cycleId,
			name: "Groceries",
			plannedAmount: 125.5,
			categoryTypeId: "type-needs",
			icon: "🥗",
		});
		expect(mocks.success).toHaveBeenCalledWith("Category added successfully");
		expect(names()[0]).toHaveValue("");
		expect(amounts()[0]).toHaveValue("");
	});

	it("fills an empty row from a previous cycle, suppresses duplicates, appends suggestions and removes rows", async () => {
		const user = userEvent.setup();
		render(<CategoryForm cycleId={cycleId} />);
		await user.click(screen.getByRole("button", { name: "🏠 Rent" }));
		expect(names()).toHaveLength(1);
		expect(names()[0]).toHaveValue("Rent");
		expect(amounts()[0]).toHaveValue("1200");
		expect(
			screen.queryByRole("button", { name: "🏠 Rent" })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "📦 Books" }));
		expect(names()).toHaveLength(2);
		expect(names()[1]).toHaveValue("Books");
		expect(
			screen.queryByText("Suggestions from Previous Cycle")
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Add Another Row" }));
		expect(names()).toHaveLength(3);
		// Row removal is currently an icon-only, unnamed control.
		const emptyRow = names()[2].closest(".relative");
		const remove = emptyRow?.querySelector<HTMLButtonElement>(
			'button[type="button"]'
		);
		if (!remove) {
			throw new Error("Missing remove-row control");
		}
		await user.click(remove);
		expect(names()).toHaveLength(2);
		await user.click(screen.getByRole("button", { name: "Add Categories" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith(
				"Categories added successfully"
			)
		);
		expect(mocks.create).toHaveBeenCalledTimes(2);
		expect(mocks.create).toHaveBeenNthCalledWith(1, {
			cycleId,
			name: "Rent",
			categoryTypeId: "type-needs",
			plannedAmount: 1200,
			icon: "🏠",
		});
		expect(mocks.create).toHaveBeenNthCalledWith(2, {
			cycleId,
			name: "Books",
			categoryTypeId: undefined,
			plannedAmount: 30,
			icon: "📦",
		});
	});

	it("filters previous suggestions case-insensitively and appends rather than overwriting a budget-only row", async () => {
		const user = userEvent.setup();
		render(
			<CategoryForm cycleId={cycleId} defaultValues={{ name: "  rEnT  " }} />
		);
		expect(
			screen.queryByRole("button", { name: "🏠 Rent" })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Add Another Row" }));
		fireEvent.change(amounts()[1], { target: { value: "20" } });
		await user.click(screen.getByRole("button", { name: "📦 Books" }));
		expect(names()).toHaveLength(3);
		expect(names()[1]).toHaveValue("");
		expect(amounts()[1]).toHaveValue("20");
		expect(names()[2]).toHaveValue("Books");
		expect(amounts()[2]).toHaveValue("30");
	});

	it("edits one category, uses historical spending and clears type and optional budget in the mutation", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		render(
			<CategoryForm
				categoryId={categoryId}
				cycleId={cycleId}
				defaultValues={{
					name: "Rent",
					categoryTypeId: "type-needs",
					plannedAmount: 1200,
					icon: "🏠",
				}}
				historicalSpent={{ amount: 1100, cycleName: "February" }}
				onSuccess={onSuccess}
			/>
		);
		expect(
			screen.queryByRole("button", { name: "Add Another Row" })
		).not.toBeInTheDocument();
		expect(
			screen.queryByText("Suggestions from Previous Cycle")
		).not.toBeInTheDocument();
		expect(screen.getByText("You spent $1100.00 in February")).toBeVisible();
		await user.click(
			screen.getByRole("button", { name: "Use Last Cycle ($1100.00)" })
		);
		expect(amounts()[0]).toHaveValue("1100");
		await user.clear(amounts()[0]);
		await user.clear(names()[0]);
		await user.type(names()[0], "Housing");
		await user.click(typeSelects()[0]);
		await user.click(screen.getByRole("option", { name: "No type" }));
		await user.click(screen.getByRole("button", { name: "Save Changes" }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		expect(mocks.update).toHaveBeenCalledWith({
			id: categoryId,
			name: "Housing",
			categoryTypeId: undefined,
			plannedAmount: undefined,
			icon: "🏠",
		});
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.success).toHaveBeenCalledWith("Category updated");
	});

	it("disables saving while editing is pending and uses the selected uncolored type", async () => {
		const user = userEvent.setup();
		let finish: () => void = () => undefined;
		mocks.update.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finish = resolve;
			})
		);
		render(
			<CategoryForm
				categoryId={categoryId}
				cycleId={cycleId}
				defaultValues={{ name: "Books" }}
			/>
		);
		await user.click(typeSelects()[0]);
		await user.click(screen.getByRole("option", { name: "Wants" }));
		await user.click(screen.getByRole("button", { name: "Save Changes" }));
		expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
		expect(mocks.update).toHaveBeenCalledWith({
			id: categoryId,
			name: "Books",
			categoryTypeId: "type-wants",
			plannedAmount: undefined,
			icon: "📦",
		});
		finish();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled()
		);
	});

	it.each([
		false,
		true,
	])("preserves values on failed saves and supports retry (editing=%s)", async (editing) => {
		const user = userEvent.setup();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		(editing ? mocks.update : mocks.create).mockRejectedValueOnce(
			new Error("offline")
		);
		const onSuccess = vi.fn();
		render(
			<CategoryForm
				categoryId={editing ? categoryId : undefined}
				cycleId={cycleId}
				defaultValues={{ name: "Books", plannedAmount: 25 }}
				onSuccess={onSuccess}
			/>
		);
		await user.click(
			screen.getByRole("button", {
				name: editing ? "Save Changes" : "Add Category",
			})
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				editing ? "Failed to update category" : "Failed to add categories"
			)
		);
		expect(onSuccess).not.toHaveBeenCalled();
		expect(names()[0]).toHaveValue("Books");
		expect(amounts()[0]).toHaveValue("25");
		await user.click(
			screen.getByRole("button", {
				name: editing ? "Save Changes" : "Add Category",
			})
		);
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
	});

	it("creates a type inside the selector and applies it to the category", async () => {
		const user = userEvent.setup();
		mocks.createType.mockImplementationOnce(() => {
			mocks.query.mockImplementation(
				(reference: Parameters<typeof getFunctionName>[0]) =>
					getFunctionName(reference) === "categories:listTypes"
						? [
								...types,
								{ _id: "type-custom", name: "Travel", color: "#3b82f6" },
							]
						: previous
			);
			return Promise.resolve({ _id: "type-custom" });
		});
		render(<CategoryForm cycleId={cycleId} />);
		await user.type(names()[0], "Flights");
		await user.click(typeSelects()[0]);
		await user.click(screen.getByRole("button", { name: "New Type" }));
		expect(
			screen.getByRole("dialog", { name: "Add Category Type" })
		).toBeVisible();
		await user.type(screen.getByLabelText("Type Name"), "Travel");
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		await user.keyboard("{Escape}");
		await user.click(typeSelects()[0]);
		await user.click(screen.getByRole("option", { name: "Travel" }));
		await user.click(screen.getByRole("button", { name: "Add Category" }));
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				cycleId,
				name: "Flights",
				categoryTypeId: "type-custom",
				plannedAmount: undefined,
				icon: "📦",
			})
		);
	});

	it("shows adding state while a create is pending and supports queries that are still loading", async () => {
		const user = userEvent.setup();
		mocks.query.mockReturnValue(undefined);
		let finish: () => void = () => undefined;
		mocks.create.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finish = resolve;
			})
		);
		render(<CategoryForm cycleId={cycleId} />);
		expect(
			screen.queryByText("Suggestions from Previous Cycle")
		).not.toBeInTheDocument();
		await user.type(names()[0], "Travel");
		await user.click(screen.getByRole("button", { name: "Add Category" }));
		expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
		finish();
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Category added successfully")
		);
	});
});
