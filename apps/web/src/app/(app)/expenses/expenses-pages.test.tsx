// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpenseDetailModal from "../@modal/(.)expenses/[id]/page";
import ExpenseDetailPage from "./[id]/page";
import NewExpensePage from "./new/page";
import ExpensesIndex from "./page";

const NOTE_LABEL = /Note/;

function onUrlUpdate(event: UrlUpdateEvent) {
	mocks.urlUpdate(event.queryString);
	mocks.urlEvent(event);
}

function ExpensesPage() {
	return (
		<NuqsTestingAdapter
			hasMemory
			onUrlUpdate={onUrlUpdate}
			searchParams={mocks.search}
		>
			<ExpensesIndex />
		</NuqsTestingAdapter>
	);
}

const mocks = vi.hoisted(() => ({
	back: vi.fn(),
	create: vi.fn(),
	createTag: vi.fn(),
	error: vi.fn(),
	push: vi.fn(),
	queries: new Map<string, unknown>(),
	query: vi.fn(),
	remove: vi.fn(),
	replace: vi.fn(),
	report: vi.fn(),
	search: new URLSearchParams(),
	success: vi.fn(),
	update: vi.fn(),
	urlEvent: vi.fn(),
	urlUpdate: vi.fn(),
	warning: vi.fn(),
}));
vi.mock("convex/react", async () => {
	const { getFunctionName: name } = await import("convex/server");
	return {
		useMutation: (ref: FunctionReference<"mutation">) =>
			new Map([
				[name(api.expenses.create), mocks.create],
				[name(api.expenses.update), mocks.update],
				[name(api.expenses.remove), mocks.remove],
				[name(api.tags.create), mocks.createTag],
			]).get(name(ref)),
		useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
			mocks.query(name(ref), args);
			return args === "skip" ? undefined : mocks.queries.get(name(ref));
		},
	};
});
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({
		back: mocks.back,
		push: mocks.push,
		replace: mocks.replace,
	}),
	useSearchParams: () => mocks.search,
}));
vi.mock("sonner", () => ({
	toast: { error: mocks.error, success: mocks.success, warning: mocks.warning },
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
	_creationTime: 0,
	_id: cycleId,
	createdAt: 0,
	endDate: "2026-08-01",
	name: "July budget",
	startDate: "2026-07-01",
	userId,
};
const accounts: FunctionReturnType<typeof api.accounts.list> = [
	{
		_creationTime: 0,
		_id: accountId,
		accountTypeBalanceNature: "asset",
		accountTypeColor: "#123456",
		accountTypeIcon: "wallet",
		accountTypeId: "bank" as Id<"account_types">,
		accountTypeName: "Bank",
		createdAt: 0,
		currentBalance: 150,
		name: "Cash",
		startingBalance: 200,
		userId,
	},
	{
		_creationTime: 0,
		_id: archivedId,
		accountTypeBalanceNature: "asset",
		accountTypeColor: null,
		accountTypeIcon: null,
		accountTypeId: "bank" as Id<"account_types">,
		accountTypeName: "Bank",
		createdAt: 0,
		currentBalance: 0,
		isArchived: true,
		name: "Old account",
		startingBalance: 0,
		userId,
	},
];
type Expense = FunctionReturnType<typeof api.expenses.list>[number];
function expense(id: string, values: Partial<Expense> = {}): Expense {
	return {
		_creationTime: 0,
		_id: id as Id<"expenses">,
		accountId,
		accountName: "Cash",
		accountTypeBalanceNature: "asset",
		accountTypeColor: "#123456",
		accountTypeIcon: "wallet",
		accountTypeId: accounts[0].accountTypeId,
		accountTypeName: "Bank",
		amount: 25,
		categoryIcon: "🍲",
		categoryId,
		categoryName: "Food",
		categoryTypeColor: "#123456",
		createdAt: 0,
		cycleId,
		cycleName: "July budget",
		date: "2026-07-10",
		spentOn: `Lunch ${id}`,
		tagIds: [tagId],
		tagNames: ["Work"],
		userId,
		...values,
	};
}
const lunch = expense("lunch");
const uncategorized = expense("taxi", {
	accountId: undefined,
	accountName: null,
	accountTypeBalanceNature: null,
	accountTypeColor: null,
	accountTypeIcon: null,
	accountTypeId: null,
	accountTypeName: null,
	amount: 15,
	categoryIcon: null,
	categoryId: undefined,
	categoryName: null,
	categoryTypeColor: null,
	spentOn: "Taxi",
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
		_creationTime: 0,
		_id: userId,
		clerkId: "clerk",
		createdAt: 0,
		currency: "USD",
		email: "test@example.com",
	});
	fixture(api.cycles.list, [
		current,
		{
			...current,
			_id: "aug" as Id<"expense_cycles">,
			endDate: "2026-09-01",
			name: "August budget",
			startDate: "2026-08-01",
		},
		{
			...current,
			_id: "june" as Id<"expense_cycles">,
			endDate: "2026-07-01",
			name: "June budget",
			startDate: "2026-06-01",
		},
	]);
	fixture(api.cycles.getCurrent, current);
	fixture(api.accounts.list, accounts);
	fixture(api.categories.list, [
		{
			_creationTime: 0,
			_id: categoryId,
			createdAt: 0,
			cycleId,
			name: "Food",
			order: 0,
			plannedAmount: 100,
			typeColor: undefined,
			typeName: undefined,
			userId,
		},
	]);
	fixture(api.categories.listTypes, []);
	fixture(api.tags.list, [
		{ _creationTime: 0, _id: tagId, createdAt: 0, name: "Work", userId },
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
async function renderDetail(modal = false) {
	const params = Promise.resolve({ id: "lunch" });
	await act(async () => {
		await params;
		render(
			<Suspense fallback={<p>Resolving route</p>}>
				{modal ? (
					<ExpenseDetailModal params={params} />
				) : (
					<ExpenseDetailPage params={params} />
				)}
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
	it("applies preset dates as explicit URL bounds while preserving all other filters", async () => {
		mocks.search = new URLSearchParams(
			"cycle=july&category=food&account=unassigned&tag=work&keep=1"
		);
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.click(screen.getByRole("radio", { name: "Last month" }));
		expect(mocks.urlUpdate).not.toHaveBeenCalled();
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ categoryId, cycleId, tagIds: [tagId], unassigned: true }
		);
		await interaction.click(screen.getByRole("button", { name: "Apply" }));
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith(
			"?cycle=july&category=food&account=unassigned&tag=work&keep=1&from=2026-06-01&to=2026-06-30"
		);
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{
				categoryId,
				cycleId,
				endDate: "2026-07-01",
				startDate: "2026-06-01",
				tagIds: [tagId],
				unassigned: true,
			}
		);
		expect(combobox("July budget")).toBeInTheDocument();
	});

	it("uses the same 40px control size for search, date and all filter dropdowns", () => {
		render(<ExpensesPage />);
		expect(screen.getByPlaceholderText("Search description...")).toHaveClass(
			"h-10"
		);
		expect(screen.getByRole("button", { name: "Date range" })).toHaveClass(
			"h-10"
		);
		for (const label of ["Cycle", "Category", "Account"]) {
			const trigger = screen.getByRole("combobox", { name: label });
			expect(trigger).toHaveAttribute("data-size", "lg");
			expect(trigger).not.toHaveClass("h-10");
		}
	});

	it("restores all URL filters and sends inclusive From/Through as the existing half-open backend contract", async () => {
		const otherTag = "travel" as Id<"tags">;
		fixture(api.tags.list, [
			{ _creationTime: 0, _id: tagId, createdAt: 0, name: "Work", userId },
			{ _creationTime: 0, _id: otherTag, createdAt: 0, name: "Travel", userId },
		]);
		mocks.search = new URLSearchParams(
			"cycle=july&category=food&account=unassigned&tag=work&tag=travel&from=2026-07-10&to=2026-07-10&keep=1"
		);
		render(<ExpensesPage />);
		expect(combobox("July budget")).toBeInTheDocument();
		expect(combobox("Food")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Date range" })
		).toHaveTextContent("Jul 10, 2026");
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{
				categoryId,
				cycleId,
				endDate: "2026-07-11",
				startDate: "2026-07-10",
				tagIds: [tagId, otherTag],
				unassigned: true,
			}
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Remove date filter" }));
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ categoryId, cycleId, tagIds: [tagId, otherTag], unassigned: true }
		);
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith(
			"?cycle=july&category=food&account=unassigned&tag=work&tag=travel&keep=1"
		);
	});

	it("applies both date bounds in one history entry without changing the selected cycle", async () => {
		mocks.search = new URLSearchParams("cycle=july&account=unassigned&keep=1");
		fixture(api.expenses.list, []);
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.type(screen.getByLabelText("From"), "2026-06-01");
		await interaction.type(screen.getByLabelText("Through"), "2026-06-30");
		expect(mocks.urlUpdate).not.toHaveBeenCalled();
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ cycleId, unassigned: true }
		);
		await interaction.click(screen.getByRole("button", { name: "Apply" }));
		expect(mocks.urlEvent).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				options: { history: "push", scroll: false, shallow: true },
				queryString:
					"?cycle=july&account=unassigned&keep=1&from=2026-06-01&to=2026-06-30",
			})
		);
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{
				cycleId,
				endDate: "2026-07-01",
				startDate: "2026-06-01",
				unassigned: true,
			}
		);
		expect(combobox("July budget")).toBeInTheDocument();
		expect(screen.getByText("No expenses found")).toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Date range" }));
		await interaction.click(screen.getByRole("button", { name: "Clear" }));
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith(
			"?cycle=july&account=unassigned&keep=1"
		);
	});

	it("restores changed URLs on navigation including removal of Uncategorized and dates", async () => {
		mocks.search = new URLSearchParams(
			"cycle=july&category=uncategorized&from=2026-07-01&to=2026-07-31&tag=work"
		);
		const view = render(<ExpensesPage />);
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{
				cycleId,
				endDate: "2026-08-01",
				startDate: "2026-07-01",
				tagIds: [tagId],
				uncategorized: true,
			}
		);
		mocks.search = new URLSearchParams(
			"cycle=july&category=food&account=archived&to=2026-07-10"
		);
		view.rerender(<ExpensesPage />);
		await waitFor(() =>
			expect(mocks.query).toHaveBeenLastCalledWith(
				getFunctionName(api.expenses.list),
				{ accountId: archivedId, categoryId, cycleId, endDate: "2026-07-11" }
			)
		);
		mocks.search = new URLSearchParams();
		view.rerender(<ExpensesPage />);
		await waitFor(() =>
			expect(mocks.query).toHaveBeenLastCalledWith(
				getFunctionName(api.expenses.list),
				{}
			)
		);
		expect(screen.getByText("Lunch lunch")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Remove date filter" })
		).not.toBeInTheDocument();
	});

	it.each(["from=2026-02-30", "to=bad", "from=2026-07-11&to=2026-07-10"])(
		"does not silently broaden an invalid date URL: %s",
		async (query) => {
			mocks.search = new URLSearchParams(`${query}&keep=1`);
			render(<ExpensesPage />);
			expect(
				screen.getByRole("heading", { name: "Invalid date range" })
			).toBeInTheDocument();
			expect(mocks.query).toHaveBeenLastCalledWith(
				getFunctionName(api.expenses.list),
				"skip"
			);
			expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
			await userEvent
				.setup()
				.click(screen.getByRole("button", { name: "Clear date filter" }));
			expect(mocks.urlUpdate).toHaveBeenLastCalledWith("?keep=1");
			expect(screen.getByText("Lunch lunch")).toBeInTheDocument();
		}
	);

	it.each([
		"cycle=missing",
		"category=food",
		"cycle=july&category=missing",
		"tag=missing",
	])(
		"guards unavailable resource filters before querying: %s",
		async (query) => {
			mocks.search = new URLSearchParams(`${query}&keep=1`);
			render(<ExpensesPage />);
			expect(
				screen.getByRole("heading", { name: "Expense filter unavailable" })
			).toBeInTheDocument();
			expect(mocks.query).toHaveBeenLastCalledWith(
				getFunctionName(api.expenses.list),
				"skip"
			);
			await userEvent
				.setup()
				.click(screen.getByRole("button", { name: "Clear all filters" }));
			expect(mocks.urlUpdate).toHaveBeenLastCalledWith("?keep=1");
			expect(screen.getByText("Lunch lunch")).toBeInTheDocument();
		}
	);

	it("clears incompatible categories atomically when switching or removing cycles", async () => {
		mocks.search = new URLSearchParams(
			"cycle=july&category=food&from=2026-07-01"
		);
		const view = render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("combobox", { name: "Cycle" }));
		await interaction.click(
			screen.getByRole("option", { name: "August budget" })
		);
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ cycleId: "aug", startDate: "2026-07-01" }
		);
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith(
			"?cycle=aug&from=2026-07-01"
		);
		mocks.search = new URLSearchParams(
			"cycle=july&category=uncategorized&from=2026-07-01"
		);
		view.rerender(<ExpensesPage />);
		await waitFor(() => expect(combobox("July budget")).toBeInTheDocument());
		await interaction.click(
			screen.getByRole("button", { name: "Remove cycle filter" })
		);
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ startDate: "2026-07-01" }
		);
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith("?from=2026-07-01");
	});

	it("resets table pagination on a server filter change while keeping search local", async () => {
		fixture(
			api.expenses.list,
			Array.from({ length: 21 }, (_, index) => expense(`row-${index}`))
		);
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("Lunch row-10")).toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Work" }));
		expect(screen.getByText("Lunch row-0")).toBeInTheDocument();
		await interaction.type(
			screen.getByPlaceholderText("Search description..."),
			"row-0"
		);
		expect(mocks.urlUpdate).toHaveBeenCalledTimes(1);
	});

	it("makes bounded totals explicit when 500 matching expenses are loaded", () => {
		fixture(
			api.expenses.list,
			Array.from({ length: 500 }, (_, index) => expense(`row-${index}`))
		);
		render(<ExpensesPage />);
		expect(screen.getByRole("status")).toHaveTextContent(
			"Showing up to 500 expenses."
		);
		expect(screen.getByText("Loaded total")).toBeInTheDocument();
	});

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
			expense("lunch", { lastModifiedSource: "cli_agent", revision: 2 }),
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
			{ accountId: archivedId, uncategorized: true }
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Clear all" }));
		expect(mocks.urlUpdate).toHaveBeenCalledWith("?keep=1");
		expect(screen.getByText("Lunch lunch")).toBeInTheDocument();
	});

	it("lists current/upcoming/history cycles and sends category filters to Convex", async () => {
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		expect(combobox("All categories")).toBeEnabled();
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
			{ categoryId, cycleId }
		);
		await interaction.click(combobox("Food"));
		await interaction.click(
			screen.getByRole("option", { name: "Uncategorized" })
		);
		expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
		expect(screen.getByText("Taxi")).toBeInTheDocument();
		await interaction.click(screen.getByRole("button", { name: "Clear all" }));
		expect(screen.getByText("Lunch lunch")).toBeInTheDocument();
		expect(mocks.urlUpdate).toHaveBeenCalledWith("");
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
		expect(mocks.urlUpdate).toHaveBeenCalledWith("?account=archived");
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.list),
			{ accountId: archivedId }
		);
		await interaction.click(
			screen.getByRole("button", { name: "Remove Old account account filter" })
		);
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith("");
	});

	it("restores an unassigned URL and removes its pill without dropping other parameters", async () => {
		mocks.search = new URLSearchParams(
			"account=unassigned&category=uncategorized&keep=1"
		);
		fixture(api.expenses.list, [uncategorized]);
		render(<ExpensesPage />);
		expect(combobox("Unassigned")).toBeInTheDocument();
		expect(screen.getByText("Loaded total").parentElement).toHaveTextContent(
			"$15.00"
		);
		expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.expenses.list),
			{ unassigned: true, uncategorized: true }
		);
		await userEvent.setup().click(
			screen.getByRole("button", {
				name: "Remove Unassigned account filter",
			})
		);
		expect(combobox("All accounts")).toBeInTheDocument();
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith(
			"?category=uncategorized&keep=1"
		);
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ uncategorized: true }
		);
	});

	it("switches between unassigned and specific accounts and combines other filters", async () => {
		mocks.search = new URLSearchParams("keep=1");
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		await interaction.click(combobox("All cycles"));
		await interaction.click(
			screen.getByRole("option", { name: "July budget" })
		);
		await interaction.click(combobox("All categories"));
		await interaction.click(screen.getByRole("option", { name: "Food" }));
		await interaction.click(screen.getByRole("button", { name: "Work" }));
		await interaction.click(combobox("All accounts"));
		await interaction.click(screen.getByRole("option", { name: "Unassigned" }));
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ categoryId, cycleId, tagIds: [tagId], unassigned: true }
		);
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith(
			"?keep=1&cycle=july&category=food&tag=work&account=unassigned"
		);
		await interaction.click(combobox("Unassigned"));
		await interaction.click(
			screen.getByRole("option", { name: "Cash · Bank" })
		);
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ accountId, categoryId, cycleId, tagIds: [tagId] }
		);
		await interaction.click(combobox("Cash"));
		await interaction.click(screen.getByRole("option", { name: "Unassigned" }));
		await interaction.click(screen.getByRole("button", { name: "Clear all" }));
		expect(combobox("All accounts")).toBeInTheDocument();
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith("?keep=1");
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{}
		);
	});

	it("offers unassigned by keyboard even with no accounts or matching expenses", async () => {
		fixture(api.accounts.list, []);
		fixture(api.expenses.list, []);
		render(<ExpensesPage />);
		const interaction = userEvent.setup();
		const accountFilter = screen.getByRole("combobox", { name: "Account" });
		accountFilter.focus();
		await interaction.keyboard("{Enter}");
		await interaction.keyboard("{End}{Enter}");
		expect(combobox("Unassigned")).toBeInTheDocument();
		expect(screen.getByText("No expenses found")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove Unassigned account filter" })
		).toBeInTheDocument();
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ unassigned: true }
		);
	});

	it("restores account URL changes on the mounted page", async () => {
		mocks.search = new URLSearchParams("account=unassigned");
		const view = render(<ExpensesPage />);
		expect(combobox("Unassigned")).toBeInTheDocument();
		mocks.search = new URLSearchParams("account=archived");
		view.rerender(<ExpensesPage />);
		await waitFor(() => expect(combobox("Old account")).toBeInTheDocument());
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ accountId: archivedId }
		);
		mocks.search = new URLSearchParams("account=unassigned");
		view.rerender(<ExpensesPage />);
		await waitFor(() => expect(combobox("Unassigned")).toBeInTheDocument());
		mocks.search = new URLSearchParams();
		view.rerender(<ExpensesPage />);
		await waitFor(() => expect(combobox("All accounts")).toBeInTheDocument());
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{}
		);
	});

	it("does not request unfiltered results while resolving an account URL", () => {
		mocks.search = new URLSearchParams("account=cash");
		fixture(api.accounts.list, undefined);
		const view = render(<ExpensesPage />);
		expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			"skip"
		);
		fixture(api.accounts.list, accounts);
		view.rerender(<ExpensesPage />);
		expect(combobox("Cash")).toBeInTheDocument();
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			{ accountId }
		);
	});

	it("explains an unavailable account URL instead of silently showing all expenses", async () => {
		mocks.search = new URLSearchParams("account=missing&keep=1");
		render(<ExpensesPage />);
		expect(screen.getByText("Account filter unavailable")).toBeInTheDocument();
		expect(screen.queryByText("Lunch lunch")).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenLastCalledWith(
			getFunctionName(api.expenses.list),
			"skip"
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Clear account filter" }));
		expect(mocks.urlUpdate).toHaveBeenLastCalledWith("?keep=1");
		expect(combobox("All accounts")).toBeInTheDocument();
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

	it.each([new Error("Cannot delete"), "offline"])(
		"reports row deletion failure (%s)",
		async (error) => {
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
		}
	);
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
			lastModifiedSource: "cli_agent",
			revision: 2,
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
				accountId,
				amount: 25,
				categoryId,
				date: "2026-07-10",
				id: "lunch",
				spentOn: "Updated lunch",
				tagIds: [tagId],
			})
		);
		expect(mocks.push).toHaveBeenCalledWith("/expenses");
	});

	it.each([false, true])(
		"clears a saved note through the real editor (modal=%s)",
		async (modal) => {
			await renderDetail(modal);
			const interaction = userEvent.setup();
			const note = screen.getByLabelText(NOTE_LABEL);
			expect(note).toHaveAccessibleDescription(
				"Leave blank to clear the saved note."
			);
			await interaction.clear(note);
			await interaction.click(
				screen.getByRole("button", { name: "Save Changes" })
			);
			await waitFor(() =>
				expect(mocks.update).toHaveBeenCalledWith({
					accountId,
					amount: lunch.amount,
					categoryId,
					date: lunch.date,
					id: lunch._id,
					spentOn: null,
					tagIds: [tagId],
				})
			);
			if (modal) {
				expect(mocks.back).toHaveBeenCalledOnce();
			} else {
				expect(mocks.push).toHaveBeenCalledWith("/expenses");
			}
		}
	);

	it.each([false, true])(
		"cancels a cleared draft without saving and restores the saved note on reopening (modal=%s)",
		async (modal) => {
			await renderDetail(modal);
			const interaction = userEvent.setup();
			await interaction.clear(screen.getByLabelText(NOTE_LABEL));
			await interaction.click(screen.getByRole("button", { name: "Cancel" }));
			expect(mocks.update).not.toHaveBeenCalled();
			expect(mocks.create).not.toHaveBeenCalled();
			if (modal) {
				expect(mocks.back).toHaveBeenCalledOnce();
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			} else {
				expect(mocks.push).toHaveBeenCalledWith("/expenses");
			}
			cleanup();
			await renderDetail(modal);
			expect(screen.getByLabelText(NOTE_LABEL)).toHaveValue(lunch.spentOn);
		}
	);

	it.each(["Escape", "Close"])(
		"dismisses a cleared modal draft with %s without saving",
		async (dismissal) => {
			await renderDetail(true);
			const interaction = userEvent.setup();
			await interaction.clear(screen.getByLabelText(NOTE_LABEL));
			if (dismissal === "Escape") {
				await interaction.keyboard("{Escape}");
			} else {
				await interaction.click(screen.getByRole("button", { name: "Close" }));
			}
			expect(mocks.update).not.toHaveBeenCalled();
			expect(mocks.back).toHaveBeenCalledOnce();
		}
	);

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
		await interaction.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Cancel",
			})
		);
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

	it.each([new Error("Permission denied"), "offline"])(
		"retains the detail page on delete failure (%s)",
		async (error) => {
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
		}
	);
});
