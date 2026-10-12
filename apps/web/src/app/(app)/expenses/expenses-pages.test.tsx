// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpenseDetailPage from "./[id]/page";
import NewExpensePage from "./new/page";
import ExpensesPage from "./page";

const NOTE_LABEL = /Note/;

const mocks = vi.hoisted(() => ({
	queries: new Map<string, unknown>(),
	query: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
	createTag: vi.fn(),
	push: vi.fn(),
	replace: vi.fn(),
	search: new URLSearchParams(),
	success: vi.fn(),
	error: vi.fn(),
	warning: vi.fn(),
	report: vi.fn(),
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
				[name(api.expenses.create), mocks.create],
				[name(api.expenses.update), mocks.update],
				[name(api.expenses.remove), mocks.remove],
				[name(api.tags.create), mocks.createTag],
			]).get(name(ref)),
	};
});
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
	useSearchParams: () => mocks.search,
}));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error, warning: mocks.warning },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));
function fixture<T extends FunctionReference<"query">>(
	ref: T,
	value: FunctionReturnType<T> | undefined
) {
	mocks.queries.set(getFunctionName(ref), value);
}
const userId = "user" as Id<"users">;
const accountId = "cash" as Id<"accounts">;
const archivedId = "archived" as Id<"accounts">;
const cycleId = "july" as Id<"expense_cycles">;
const categoryId = "food" as Id<"categories">;
const tagId = "work" as Id<"tags">;
const current: NonNullable<FunctionReturnType<typeof api.cycles.getCurrent>> = {
	_id: cycleId,
	_creationTime: 0,
	userId,
	createdAt: 0,
	name: "July budget",
	startDate: "2026-07-01",
	endDate: "2026-08-01",
};
const accounts: FunctionReturnType<typeof api.accounts.list> = [
	{
		_id: accountId,
		_creationTime: 0,
		userId,
		accountTypeId: "bank" as Id<"account_types">,
		createdAt: 0,
		name: "Cash",
		startingBalance: 200,
		currentBalance: 150,
		accountTypeName: "Bank",
		accountTypeBalanceNature: "asset",
		accountTypeColor: "#123456",
		accountTypeIcon: "wallet",
	},
	{
		_id: archivedId,
		_creationTime: 0,
		userId,
		accountTypeId: "bank" as Id<"account_types">,
		createdAt: 0,
		name: "Old account",
		startingBalance: 0,
		currentBalance: 0,
		accountTypeName: "Bank",
		accountTypeBalanceNature: "asset",
		accountTypeColor: null,
		accountTypeIcon: null,
		isArchived: true,
	},
];
type Expense = FunctionReturnType<typeof api.expenses.list>[number];
function expense(id: string, values: Partial<Expense> = {}): Expense {
	return {
		_id: id as Id<"expenses">,
		_creationTime: 0,
		userId,
		createdAt: 0,
		amount: 25,
		date: "2026-07-10",
		cycleId,
		categoryId,
		accountId,
		spentOn: `Lunch ${id}`,
		tagIds: [tagId],
		accountName: "Cash",
		accountTypeId: accounts[0].accountTypeId,
		accountTypeName: "Bank",
		accountTypeBalanceNature: "asset",
		accountTypeIcon: "wallet",
		accountTypeColor: "#123456",
		categoryName: "Food",
		categoryIcon: "🍲",
		categoryTypeColor: "#123456",
		cycleName: "July budget",
		tagNames: ["Work"],
		...values,
	};
}
const lunch = expense("lunch");
const uncategorized = expense("taxi", {
	amount: 15,
	spentOn: "Taxi",
	categoryId: undefined,
	categoryName: null,
	categoryIcon: null,
	categoryTypeColor: null,
	accountId: undefined,
	accountName: null,
	accountTypeId: null,
	accountTypeName: null,
	accountTypeIcon: null,
	accountTypeColor: null,
	accountTypeBalanceNature: null,
	tagIds: [],
	tagNames: [],
});
beforeEach(() => {
	vi.clearAllMocks();
	mocks.queries.clear();
	mocks.search = new URLSearchParams();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 6, 10, 12));
	mocks.create.mockReset().mockResolvedValue(lunch);
	mocks.update.mockReset().mockResolvedValue(lunch);
	mocks.remove.mockReset().mockResolvedValue({ success: true });
	mocks.createTag.mockReset().mockResolvedValue("created-tag");
	fixture(api.users.get, {
		_id: userId,
		_creationTime: 0,
		clerkId: "clerk",
		email: "test@example.com",
		createdAt: 0,
		currency: "USD",
	});
	fixture(api.cycles.list, [
		current,
		{
			...current,
			_id: "aug" as Id<"expense_cycles">,
			name: "August budget",
			startDate: "2026-08-01",
			endDate: "2026-09-01",
		},
		{
			...current,
			_id: "june" as Id<"expense_cycles">,
			name: "June budget",
			startDate: "2026-06-01",
			endDate: "2026-07-01",
		},
	]);
	fixture(api.cycles.getCurrent, current);
	fixture(api.accounts.list, accounts);
	fixture(api.categories.list, [
		{
			_id: categoryId,
			_creationTime: 0,
			userId,
			cycleId,
			createdAt: 0,
			name: "Food",
			plannedAmount: 100,
			order: 0,
			typeName: undefined,
			typeColor: undefined,
		},
	]);
	fixture(api.categories.listTypes, []);
	fixture(api.tags.list, [
		{ _id: tagId, _creationTime: 0, userId, createdAt: 0, name: "Work" },
	]);
	fixture(api.expenses.list, [lunch, uncategorized]);
	fixture(api.expenses.listRecent, []);
	fixture(api.expenses.get, lunch);
});
afterEach(() => vi.useRealTimers());
function combobox(label: string): HTMLElement {
	const trigger = screen
		.getAllByRole("combobox")
		.find((element) => element.textContent?.includes(label));
	if (!trigger) {
		throw new Error(`Missing combobox: ${label}`);
	}
	return trigger;
}
async function renderDetail() {
	const params = Promise.resolve({ id: "lunch" });
	await act(async () => {
		await params;
		render(
			<Suspense fallback={<p>Resolving route</p>}>
				<ExpenseDetailPage params={params} />
			</Suspense>
		);
	});
}
async function deleteRow(description = "Lunch lunch") {
	const interaction = userEvent.setup();
	const row = screen.getByText(description).closest("tr");
	if (!row) {
		throw new Error("Expense row missing");
	}
	await interaction.click(within(row).getByRole("button"));
	return interaction;
}

describe("expenses index route", () => {
	it("waits for queries and offers expense creation when the list is empty", () => {
		fixture(api.expenses.list, undefined);
		const view = render(<ExpensesPage />);
		expect(
			screen.queryByRole("heading", { name: "Expenses" })
		).not.toBeInTheDocument();
		fixture(api.expenses.list, []);
		view.rerender(<ExpensesPage />);
		expect(screen.getByText("No expenses found")).toBeInTheDocument();
		for (const link of screen.getAllByRole("link", { name: "Add Expense" })) {
			expect(link).toHaveAttribute("href", "/expenses/new");
		}
	});

	it("renders actual row details, totals and source attribution and navigates on row click", async () => {
		fixture(api.expenses.list, [
			expense("lunch", { revision: 2, lastModifiedSource: "cli_agent" }),
			uncategorized,
		]);
		render(<ExpensesPage />);
		expect(screen.getAllByText("$40.00")).toHaveLength(2);
		expect(screen.getByText("Uncategorized")).toBeInTheDocument();
		expect(screen.getByText("🍲")).toBeInTheDocument();
		expect(
			screen.getByRole("img", {
				name: "Last edited by an AI agent via Spendly CLI",
			})
		).toBeInTheDocument();
		await userEvent.setup().click(screen.getByText("Lunch lunch"));
		expect(mocks.push).toHaveBeenCalledWith("/expenses/lunch");
	});

	it("filters the real table search, recalculates its footer and shows no results", async () => {
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.type(
			screen.getByPlaceholderText("Search description..."),
			"Taxi"
		);
		expect(screen.getByText("Taxi")).toBeInTheDocument();
		expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
		const footer = screen.getByText("Total").closest("tr");
		if (!footer) {
			throw new Error("Total row missing");
		}
		expect(within(footer).getByText("$15.00")).toBeInTheDocument();
		await interaction.clear(
			screen.getByPlaceholderText("Search description...")
		);
		await interaction.type(
			screen.getByPlaceholderText("Search description..."),
			"no match"
		);
		expect(screen.getByText("No results.")).toBeInTheDocument();
	});

	it("honors an uncategorized/account URL and clears filters while preserving unrelated parameters", async () => {
		mocks.search = new URLSearchParams(
			"category=uncategorized&account=archived&keep=1"
		);
		render(<ExpensesPage />);
		expect(screen.getByText("Taxi")).toBeInTheDocument();
		expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove Old account account filter" })
		).toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.list),
			{ accountId: archivedId }
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Clear all" }));
		expect(mocks.replace).toHaveBeenCalledWith("/expenses?keep=1", {
			scroll: false,
		});
		expect(screen.getByText("Lunch lunch")).toBeInTheDocument();
	});

	it("lists current/upcoming/history cycles and sends category filters to Convex", async () => {
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		expect(combobox("All categories")).toBeDisabled();
		await interaction.click(combobox("All cycles"));
		expect(
			screen.getByRole("option", { name: "August budget" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("option", { name: "June budget" })
		).toBeInTheDocument();
		await interaction.click(
			screen.getByRole("option", { name: "July budget" })
		);
		expect(combobox("All categories")).toBeEnabled();
		await interaction.click(combobox("All categories"));
		await interaction.click(screen.getByRole("option", { name: "Food" }));
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.list),
			{ cycleId, categoryId }
		);
		await interaction.click(combobox("Food"));
		await interaction.click(
			screen.getByRole("option", { name: "Uncategorized" })
		);
		expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
		expect(screen.getByText("Taxi")).toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Clear all" }));
		expect(screen.getByText("Lunch lunch")).toBeInTheDocument();
		expect(mocks.replace).toHaveBeenCalledWith("/expenses", { scroll: false });
	});

	it("selects archived accounts, updates the URL and removes the account filter", async () => {
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.click(combobox("All accounts"));
		expect(screen.getByText("Active")).toBeInTheDocument();
		expect(screen.getByText("Archived")).toBeInTheDocument();
		await interaction.click(
			screen.getByRole("option", { name: "Old account · Bank (Archived)" })
		);
		expect(mocks.replace).toHaveBeenCalledWith("/expenses?account=archived", {
			scroll: false,
		});
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.list),
			{ accountId: archivedId }
		);
		await interaction.click(
			screen.getByRole("button", { name: "Remove Old account account filter" })
		);
		expect(mocks.replace).toHaveBeenLastCalledWith("/expenses", {
			scroll: false,
		});
	});

	it("toggles quick tags and sends only selected IDs", async () => {
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Work" }));
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.list),
			{ tagIds: [tagId] }
		);
		expect(
			screen.getByRole("button", { name: "Clear all" })
		).toBeInTheDocument();
		// The selected tag's clear icon has no accessible name; scope to its visible pill.
		const badge = screen
			.getAllByText("Work", { selector: "span" })
			.find((label) =>
				label.parentElement?.querySelector("button")
			)?.parentElement;
		if (!badge) {
			throw new Error("Tag filter missing");
		}
		await interaction.click(within(badge).getByRole("button"));
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{}
		);
		expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
	});

	it("paginates a real twelve-expense table and changes its page size", async () => {
		fixture(
			api.expenses.list,
			Array.from({ length: 12 }, (_, index) =>
				expense(`row-${index + 1}`, {
					amount: index + 1,
					spentOn: `Expense ${index + 1}`,
				})
			)
		);
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
		expect(screen.queryByText("Expense 11")).not.toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("Expense 11")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
		await interaction.click(screen.getByRole("button", { name: "Previous" }));
		await interaction.click(combobox("10"));
		await interaction.click(screen.getByRole("option", { name: "5" }));
		expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
		expect(screen.queryByText("Expense 6")).not.toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Amount" }));
		await interaction.click(screen.getByRole("button", { name: "Amount" }));
		expect(screen.getByText("Expense 12")).toBeInTheDocument();
	});

	it("cancels and confirms deletion without triggering row navigation", async () => {
		render(<ExpensesPage />);
		let interaction = await deleteRow();
		expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
			"Delete expense?"
		);
		await interaction.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.remove).not.toHaveBeenCalled();
		interaction = await deleteRow();
		await interaction.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Delete",
			})
		);
		await waitFor(() =>
			expect(mocks.remove).toHaveBeenCalledWith({ id: "lunch" })
		);
		expect(mocks.success).toHaveBeenCalledWith("Expense deleted");
		expect(mocks.push).not.toHaveBeenCalled();
	});

	it.each([
		new Error("Cannot delete"),
		"offline",
	])("reports row deletion failure (%s)", async (error) => {
		mocks.remove.mockRejectedValue(error);
		render(<ExpensesPage />);
		const interaction = await deleteRow();
		await interaction.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Delete",
			})
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				error instanceof Error ? "Cannot delete" : "Failed to delete expense"
			)
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "expenses",
			operation: "delete",
		});
	});
});

describe("new and detail expense routes", () => {
	it("passes a category from the URL into the real new-expense form", async () => {
		mocks.search = new URLSearchParams("categoryId=food");
		render(<NewExpensePage />);
		expect(
			screen.getByRole("heading", { name: "Add New Expense" })
		).toBeInTheDocument();
		expect(combobox("Food")).toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.click(screen.getByLabelText("Amount"));
		await interaction.paste("12.50");
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ amount: 12.5, categoryId })
			)
		);
	});

	it("keeps category optional when the new route has no category parameter", () => {
		render(<NewExpensePage />);
		expect(combobox("Uncategorized")).toBeInTheDocument();
	});

	it("loads the detail query before displaying the form", async () => {
		fixture(api.expenses.get, undefined);
		await renderDetail();
		expect(
			screen.queryByRole("heading", { name: "Edit Expense" })
		).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.get),
			{ expenseId: "lunch" }
		);
	});

	it("edits the loaded expense through the real form and navigates on success", async () => {
		fixture(api.expenses.get, {
			...lunch,
			revision: 2,
			lastModifiedSource: "cli_agent",
		});
		await renderDetail();
		expect(screen.getByLabelText("Amount")).toHaveValue("25");
		expect(screen.getByText("Created on Jul 10, 2026")).toBeInTheDocument();
		expect(
			screen.getByRole("img", {
				name: "Last edited by an AI agent via Spendly CLI",
			})
		).toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.clear(screen.getByLabelText(NOTE_LABEL));
		await interaction.type(screen.getByLabelText(NOTE_LABEL), "Updated lunch");
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith({
				id: "lunch",
				amount: 25,
				accountId,
				categoryId,
				date: "2026-07-10",
				spentOn: "Updated lunch",
				tagIds: [tagId],
			})
		);
		expect(mocks.push).toHaveBeenCalledWith("/expenses");
	});

	it("supplies empty optional fields for a legacy uncategorized expense", async () => {
		fixture(api.expenses.get, {
			...uncategorized,
			spentOn: undefined,
			tagIds: undefined,
		});
		await renderDetail();
		expect(combobox("Uncategorized")).toBeInTheDocument();
		expect(combobox("No account selected")).toBeInTheDocument();
		expect(screen.getByLabelText(NOTE_LABEL)).toHaveValue("");
		expect(combobox("Add tags...")).toBeInTheDocument();
	});

	it("cancels a detail delete, then deletes and skips the query after success", async () => {
		await renderDetail();
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Delete" }));
		await interaction.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.remove).not.toHaveBeenCalled();
		await interaction.click(screen.getByRole("button", { name: "Delete" }));
		await interaction.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Delete",
			})
		);
		await waitFor(() =>
			expect(mocks.remove).toHaveBeenCalledWith({ id: "lunch" })
		);
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.get),
			"skip"
		);
		expect(mocks.push).toHaveBeenCalledWith("/expenses");
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it.each([
		new Error("Permission denied"),
		"offline",
	])("retains the detail page on delete failure (%s)", async (error) => {
		mocks.remove.mockRejectedValue(error);
		await renderDetail();
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Delete" }));
		await interaction.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Delete",
			})
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				error instanceof Error
					? "Permission denied"
					: "Failed to delete expense"
			)
		);
		expect(mocks.push).not.toHaveBeenCalled();
		expect(
			screen.getByRole("heading", { name: "Edit Expense" })
		).toBeInTheDocument();
	});
});
