// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseForm } from "./expense-form";

function pendingMutation() {
	let resolve: () => void = () => {
		throw new Error("Mutation has not started");
	};
	let reject: (reason: Error) => void = (_reason) => {
		throw new Error("Mutation has not started");
	};
	const promise = new Promise<void>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, reject, resolve };
}

const FOOD_LABEL = /Food/;
const NOTE_LABEL = /Note/;
const CASH_LABEL = /Cash/;
const CREDIT_LABEL = /Credit card/;
const MONEY_OWED_LABEL = /Money owed/;
const NO_ACCOUNT_LABEL = /No account selected/;
const MISC_LABEL = /Misc/;
const UNCATEGORIZED_LABEL = /Uncategorized/;
const JULY_15_LABEL = /July 15th, 2026/;
const OLD_DATE_WARNING = /This expense is from .* Is this correct\?/;
const CREATE_LABEL = /Create/;
const ADD_LABEL = /Add/;

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	createTag: vi.fn(),
	error: vi.fn(),
	push: vi.fn(),
	queries: new Map<string, unknown>(),
	query: vi.fn(),
	report: vi.fn(),
	success: vi.fn(),
	update: vi.fn(),
	warning: vi.fn(),
}));
vi.mock("convex/react", async () => {
	const { getFunctionName: name } = await import("convex/server");
	return {
		useMutation: (ref: FunctionReference<"mutation">) => {
			const mutations = new Map([
				[name(api.expenses.create), mocks.create],
				[name(api.expenses.update), mocks.update],
				[name(api.tags.create), mocks.createTag],
			]);
			return mutations.get(name(ref));
		},
		useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
			mocks.query(name(ref), args);
			return args === "skip" ? undefined : mocks.queries.get(name(ref));
		},
	};
});
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
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
const userId = "user-1" as Id<"users">;
const accountId = "cash" as Id<"accounts">;
const cardId = "card" as Id<"accounts">;
const categoryId = "food" as Id<"categories">;
const otherCategoryId = "other" as Id<"categories">;
const cycleId = "july" as Id<"expense_cycles">;
const typeId = "needs" as Id<"category_types">;
const workId = "work" as Id<"tags">;
const travelId = "travel" as Id<"tags">;
const cycle: NonNullable<FunctionReturnType<typeof api.cycles.getCurrent>> = {
	_creationTime: 0,
	_id: cycleId,
	createdAt: 0,
	endDate: "2026-08-01",
	name: "July budget",
	startDate: "2026-07-01",
	userId,
};
const user: FunctionReturnType<typeof api.users.get> = {
	_creationTime: 0,
	_id: userId,
	clerkId: "clerk",
	createdAt: 0,
	currency: "USD",
	defaultAccountId: accountId,
	email: "test@example.com",
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
		_id: cardId,
		accountTypeBalanceNature: "liability",
		accountTypeColor: null,
		accountTypeIcon: null,
		accountTypeId: "credit" as Id<"account_types">,
		accountTypeName: "Credit",
		createdAt: 0,
		currentBalance: 50,
		name: "Credit card",
		startingBalance: 0,
		userId,
	},
];
const categories: FunctionReturnType<typeof api.categories.list> = [
	{
		_creationTime: 0,
		_id: categoryId,
		categoryTypeId: typeId,
		createdAt: 0,
		cycleId,
		icon: "🍲",
		name: "Food",
		order: 0,
		plannedAmount: 300,
		typeColor: undefined,
		typeName: "Needs",
		userId,
	},
	{
		_creationTime: 0,
		_id: otherCategoryId,
		createdAt: 0,
		cycleId,
		name: "Misc",
		order: 1,
		plannedAmount: 50,
		typeColor: undefined,
		typeName: undefined,
		userId,
	},
];
const recent: FunctionReturnType<typeof api.expenses.listRecent> = [
	{
		_creationTime: 0,
		_id: "recent" as Id<"expenses">,
		accountId: cardId,
		accountName: "Credit card",
		accountTypeBalanceNature: "liability",
		accountTypeColor: null,
		accountTypeIcon: null,
		accountTypeId: "credit" as Id<"account_types">,
		accountTypeName: "Credit",
		amount: 20,
		categoryIcon: "🍲",
		categoryId,
		categoryName: "Food",
		categoryTypeColor: null,
		createdAt: 0,
		cycleName: "July budget",
		date: "2026-07-08",
		tagNames: [],
		userId,
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 6, 10, 12));
	mocks.queries.clear();
	mocks.create.mockReset().mockResolvedValue("created");
	mocks.update.mockReset().mockResolvedValue(null);
	mocks.createTag.mockReset().mockResolvedValue("new-tag" as Id<"tags">);
	fixture(api.users.get, user);
	fixture(api.accounts.list, accounts);
	fixture(api.cycles.getCurrent, cycle);
	fixture(api.categories.list, categories);
	fixture(api.categories.listTypes, [
		{
			_creationTime: 0,
			_id: typeId,
			color: "#123456",
			createdAt: 0,
			name: "Needs",
			userId,
		},
		{
			_creationTime: 0,
			_id: "unused" as Id<"category_types">,
			createdAt: 0,
			name: "Unused",
			userId,
		},
	]);
	fixture(api.tags.list, [
		{ _creationTime: 0, _id: workId, createdAt: 0, name: "Work", userId },
		{ _creationTime: 0, _id: travelId, createdAt: 0, name: "Travel", userId },
	]);
	fixture(api.expenses.listRecent, recent);
});
afterEach(() => vi.useRealTimers());

// These comboboxes lack author-provided accessible names; use their visible labels.
function combobox(label: string | RegExp): HTMLElement {
	const trigger = screen
		.getAllByRole("combobox")
		.find((element) =>
			typeof label === "string"
				? element.textContent === label
				: label.test(element.textContent ?? "")
		);
	if (!trigger) {
		throw new Error(`Missing combobox: ${label}`);
	}
	return trigger;
}

async function enterAmount(value = "12.50") {
	const input = screen.getByLabelText("Amount");
	const interaction = userEvent.setup();
	await interaction.clear(input);
	await interaction.click(input);
	await interaction.paste(value);
	return interaction;
}

describe("ExpenseForm", () => {
	it.each([false, true])(
		"blocks native duplicate submissions until settlement and allows retry after rejection (editing=%s)",
		async (editing) => {
			const first = pendingMutation();
			const retry = pendingMutation();
			const mutation = editing ? mocks.update : mocks.create;
			mutation
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(retry.promise);
			const onSuccess = vi.fn();
			render(
				<ExpenseForm
					defaultValues={{ amount: 24 }}
					expenseId={editing ? "edit" : undefined}
					onSuccess={onSuccess}
				/>
			);
			const button = screen.getByRole("button", {
				name: editing ? "Save Changes" : "Add Expense",
			});
			const form = button.closest("form");
			if (!form) {
				throw new Error("Missing form");
			}
			// Native submits bypass disabled buttons and can arrive in the same render.
			await act(() => {
				fireEvent.submit(form);
				fireEvent.submit(form);
			});
			await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
			expect(button).toBeDisabled();
			await act(() => {
				fireEvent.submit(form);
			});
			expect(mutation).toHaveBeenCalledTimes(1);
			expect(onSuccess).not.toHaveBeenCalled();
			await act(() => first.reject(new Error("offline")));
			await waitFor(() =>
				expect(mocks.error).toHaveBeenCalledWith(
					editing ? "Failed to update expense" : "Failed to add expense"
				)
			);
			expect(screen.getByLabelText("Amount")).toHaveValue("24");
			expect(button).toBeEnabled();
			await act(() => {
				fireEvent.submit(form);
				fireEvent.submit(form);
			});
			await waitFor(() => expect(mutation).toHaveBeenCalledTimes(2));
			await act(() => {
				fireEvent.submit(form);
			});
			expect(mutation).toHaveBeenCalledTimes(2);
			expect(onSuccess).not.toHaveBeenCalled();
			await act(() => retry.resolve());
			await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		}
	);

	it("uses the user's default account before the recent account and submits a complete expense", async () => {
		const onSuccess = vi.fn();
		render(<ExpenseForm onSuccess={onSuccess} />);
		expect(combobox("Cash")).toBeInTheDocument();
		expect(combobox(FOOD_LABEL)).toBeInTheDocument();
		expect(screen.getByText("Active")).toBeInTheDocument();
		const interaction = await enterAmount();
		await interaction.type(screen.getByLabelText(NOTE_LABEL), "Lunch");
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				accountId,
				amount: 12.5,
				categoryId,
				date: "2026-07-10",
				spentOn: "Lunch",
				tagIds: [],
			})
		);
		expect(mocks.success).toHaveBeenCalledWith("Expense added successfully");
		expect(onSuccess).toHaveBeenCalledOnce();
		expect(screen.getByLabelText("Amount")).toHaveValue("");
	});

	it.each([
		["missing default", undefined, false, "Credit card"],
		["archived default", accountId, true, "Credit card"],
		["archived recent", undefined, false, "No account selected"],
	] as const)(
		"resolves smart defaults for %s",
		(_label, defaultId, archived, expected) => {
			fixture(api.users.get, { ...user, defaultAccountId: defaultId });
			fixture(
				api.accounts.list,
				accounts.map((account) => ({
					...account,
					isArchived:
						account._id === accountId
							? archived
							: expected === "No account selected",
				}))
			);
			render(<ExpenseForm />);
			expect(combobox(expected)).toBeInTheDocument();
		}
	);

	it("waits for user/account/recent defaults and never replaces an explicit selection", async () => {
		fixture(api.users.get, undefined);
		fixture(api.accounts.list, undefined);
		fixture(api.expenses.listRecent, undefined);
		const view = render(<ExpenseForm />);
		expect(combobox("No account selected")).toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.click(combobox("No account selected"));
		expect(screen.queryByRole("option")).not.toBeInTheDocument();
		await interaction.keyboard("{Escape}");
		fixture(api.users.get, { ...user, defaultAccountId: undefined });
		fixture(api.accounts.list, accounts);
		view.rerender(<ExpenseForm />);
		expect(combobox("No account selected")).toBeInTheDocument();
		await interaction.click(combobox("No account selected"));
		await interaction.click(screen.getByRole("option", { name: CASH_LABEL }));
		fixture(api.expenses.listRecent, recent);
		view.rerender(<ExpenseForm />);
		expect(combobox("Cash")).toBeInTheDocument();
	});

	it("filters accounts by type, selects liabilities, and clears an optional account", async () => {
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(combobox("Cash"));
		await interaction.type(
			screen.getByPlaceholderText("Search accounts..."),
			"credit"
		);
		expect(screen.getByText(MONEY_OWED_LABEL)).toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: CASH_LABEL })
		).not.toBeInTheDocument();
		await interaction.click(screen.getByRole("option", { name: CREDIT_LABEL }));
		expect(combobox("Credit card")).toBeInTheDocument();
		await interaction.click(combobox("Credit card"));
		await interaction.clear(screen.getByPlaceholderText("Search accounts..."));
		await interaction.type(
			screen.getByPlaceholderText("Search accounts..."),
			"missing"
		);
		expect(screen.getByText("No matching accounts.")).toBeInTheDocument();
		await interaction.click(
			screen.getByRole("option", { name: NO_ACCOUNT_LABEL })
		);
		await enterAmount("20");
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ accountId: undefined })
			)
		);
	});

	it("offers account creation when the account list is empty", async () => {
		fixture(api.accounts.list, []);
		fixture(api.expenses.listRecent, []);
		render(<ExpenseForm />);
		await userEvent.setup().click(combobox("No account selected"));
		expect(screen.getByText("No accounts yet")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Create account" })
		).toHaveAttribute("href", "/accounts/new");
	});

	it("groups/searches categories and submits an untyped category", async () => {
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(combobox(FOOD_LABEL));
		expect(screen.getByText("Needs")).toBeInTheDocument();
		expect(screen.getByText("Other")).toBeInTheDocument();
		expect(screen.getByText("$300.00")).toBeInTheDocument();
		await interaction.type(
			screen.getByPlaceholderText("Search categories..."),
			"misc"
		);
		expect(
			screen.queryByRole("option", { name: FOOD_LABEL })
		).not.toBeInTheDocument();
		await interaction.click(screen.getByRole("option", { name: MISC_LABEL }));
		await enterAmount("30");
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ categoryId: otherCategoryId })
			)
		);
	});

	it("selects a typed category, supports uncategorized, and routes to category creation", async () => {
		fixture(api.expenses.listRecent, []);
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(combobox(UNCATEGORIZED_LABEL));
		await interaction.click(screen.getByRole("option", { name: FOOD_LABEL }));
		await interaction.click(combobox(FOOD_LABEL));
		await interaction.click(
			screen.getByRole("option", { name: UNCATEGORIZED_LABEL })
		);
		await interaction.click(combobox(UNCATEGORIZED_LABEL));
		await interaction.type(
			screen.getByPlaceholderText("Search categories..."),
			"missing"
		);
		expect(
			screen.queryByRole("option", { name: FOOD_LABEL })
		).not.toBeInTheDocument();
		await interaction.click(
			screen.getByRole("option", { name: "Create new category" })
		);
		expect(mocks.push).toHaveBeenCalledWith("/categories/new?id=july");
	});

	it("disables saving until a cycle loads, then offers creation when no cycle exists", () => {
		fixture(api.cycles.getCurrent, undefined);
		const view = render(<ExpenseForm />);
		expect(screen.getByRole("button", { name: "Add Expense" })).toBeDisabled();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.categories.list),
			"skip"
		);
		fixture(api.cycles.getCurrent, null);
		view.rerender(<ExpenseForm />);
		expect(screen.getByText("No cycle for this date")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Create" })).toHaveAttribute(
			"href",
			"/cycles/new"
		);
		fireEvent.submit(
			screen
				.getByRole("button", { name: "Add Expense" })
				.closest("form") as HTMLFormElement
		);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("rejects missing/nonpositive amounts and restricts input to two decimal places", async () => {
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Please enter a valid amount")
		);
		await interaction.type(screen.getByLabelText("Amount"), "0");
		await interaction.tab();
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		expect(mocks.create).not.toHaveBeenCalled();
		await interaction.clear(screen.getByLabelText("Amount"));
		await interaction.click(screen.getByLabelText("Amount"));
		await interaction.paste("12.34");
		await interaction.type(screen.getByLabelText("Amount"), "5x");
		expect(screen.getByLabelText("Amount")).toHaveValue("12.34");
	});

	it("changes the date through the calendar and updates both cycle lookup and payload", async () => {
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "July 10th, 2026" })
		);
		await interaction.click(
			screen.getByRole("button", { name: JULY_15_LABEL })
		);
		await interaction.keyboard("{Escape}");
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.cycles.getCurrent),
			{ date: "2026-07-15" }
		);
		await enterAmount();
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ date: "2026-07-15" })
			)
		);
	});

	it.each([
		[new Date(2026, 0, 1), OLD_DATE_WARNING],
		[new Date(2026, 8, 1), "This is a future expense."],
	])(
		"warns but still saves unusually dated and large expenses (%s)",
		async (date, warning) => {
			render(<ExpenseForm defaultValues={{ amount: 10_001, date }} />);
			await userEvent
				.setup()
				.click(screen.getByRole("button", { name: "Add Expense" }));
			await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
			expect(mocks.warning).toHaveBeenCalledWith(
				"That's a big expense! Double-check the amount."
			);
			if (typeof warning === "string") {
				expect(mocks.warning).toHaveBeenCalledWith(warning);
			} else {
				expect(mocks.warning).toHaveBeenCalledWith(
					expect.stringMatching(warning)
				);
			}
		}
	);

	it("selects/searches/removes tags and sends their IDs", async () => {
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(combobox("Add tags..."));
		await interaction.click(screen.getByRole("option", { name: "Work" }));
		await interaction.type(
			screen.getByPlaceholderText("Search tags..."),
			"work"
		);
		expect(screen.getByText("Selected")).toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: CREATE_LABEL })
		).not.toBeInTheDocument();
		await interaction.click(screen.getByRole("option", { name: "Work" }));
		await interaction.clear(screen.getByPlaceholderText("Search tags..."));
		await interaction.click(screen.getByRole("option", { name: "Travel" }));
		await interaction.click(screen.getByRole("option", { name: "Work" }));
		await interaction.keyboard("{Escape}");
		expect(combobox("2 tags selected")).toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Remove tag Travel" })
		);
		expect(combobox("1 tag selected")).toBeInTheDocument();
		await enterAmount();
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ tagIds: [workId] })
			)
		);
	});

	it("creates a tag inline and includes its new ID in the expense", async () => {
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(combobox("Add tags..."));
		await interaction.type(
			screen.getByPlaceholderText("Search tags..."),
			"Project"
		);
		await interaction.click(
			screen.getByRole("option", { name: 'Create "Project"' })
		);
		await waitFor(() =>
			expect(mocks.createTag).toHaveBeenCalledWith({ name: "Project" })
		);
		expect(mocks.success).toHaveBeenCalledWith("Tag created");
		expect(screen.getByPlaceholderText("Search tags...")).toHaveValue("");
		await interaction.keyboard("{Escape}");
		await enterAmount();
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ tagIds: ["new-tag"] })
			)
		);
	});

	it("reports tag creation errors and preserves the search for retry", async () => {
		const error = new Error("offline");
		mocks.createTag.mockRejectedValue(error);
		fixture(api.tags.list, []);
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		await interaction.click(combobox("Add tags..."));
		expect(
			screen.getByText("No tags yet. Create your first tag.")
		).toBeInTheDocument();
		await interaction.type(
			screen.getByPlaceholderText("Search tags..."),
			"New"
		);
		await interaction.click(
			screen.getByRole("option", { name: 'Create "New"' })
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to create tag")
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "tags",
			operation: "create",
		});
		expect(screen.getByPlaceholderText("Search tags...")).toHaveValue("New");
	});

	it("keeps selections when adding another while clearing amount and note", async () => {
		const onSuccess = vi.fn();
		render(
			<ExpenseForm defaultValues={{ tagIds: [workId] }} onSuccess={onSuccess} />
		);
		const interaction = await enterAmount();
		await interaction.type(screen.getByLabelText(NOTE_LABEL), "First");
		await interaction.click(
			screen.getByRole("switch", { name: "Add another expense" })
		);
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(screen.getByLabelText("Amount")).toHaveValue("")
		);
		expect(screen.getByLabelText(NOTE_LABEL)).toHaveValue("");
		expect(onSuccess).not.toHaveBeenCalled();
		expect(combobox("Cash")).toBeInTheDocument();
		expect(combobox(FOOD_LABEL)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove tag Work" })
		).toBeInTheDocument();
		await enterAmount("9");
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
		expect(mocks.create).toHaveBeenLastCalledWith({
			accountId,
			amount: 9,
			categoryId,
			date: "2026-07-10",
			spentOn: undefined,
			tagIds: [workId],
		});
	});

	it("edits supplied values rather than smart defaults and explicitly detaches an account", async () => {
		const onSuccess = vi.fn();
		render(
			<ExpenseForm
				defaultValues={{
					accountId: cardId,
					amount: 42,
					categoryId: otherCategoryId,
					date: new Date(2026, 6, 9),
					spentOn: "Taxi",
					tagIds: [travelId],
				}}
				expenseId="edit-1"
				onSuccess={onSuccess}
			/>
		);
		expect(screen.queryByRole("switch")).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.accounts.list),
			{ includeArchived: true }
		);
		const interaction = userEvent.setup();
		await interaction.click(combobox("Credit card"));
		await interaction.click(
			screen.getByRole("option", { name: NO_ACCOUNT_LABEL })
		);
		await interaction.click(combobox(MISC_LABEL));
		await interaction.click(
			screen.getByRole("option", { name: UNCATEGORIZED_LABEL })
		);
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith({
				accountId: null,
				amount: 42,
				categoryId: undefined,
				date: "2026-07-09",
				id: "edit-1",
				spentOn: "Taxi",
				tagIds: [travelId],
			})
		);
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.success).toHaveBeenCalledWith("Expense updated");
		expect(onSuccess).toHaveBeenCalledOnce();
	});

	it.each([false, true])(
		"preserves data and reports a failed mutation (editing=%s)",
		async (editing) => {
			const error = new Error("network unavailable");
			(editing ? mocks.update : mocks.create).mockRejectedValue(error);
			const onSuccess = vi.fn();
			render(
				<ExpenseForm
					defaultValues={{ amount: 24 }}
					expenseId={editing ? "edit" : undefined}
					onSuccess={onSuccess}
				/>
			);
			await userEvent.setup().click(
				screen.getByRole("button", {
					name: editing ? "Save Changes" : "Add Expense",
				})
			);
			await waitFor(() =>
				expect(mocks.error).toHaveBeenCalledWith(
					editing ? "Failed to update expense" : "Failed to add expense"
				)
			);
			expect(mocks.report).toHaveBeenCalledWith(error, {
				feature: "expenses",
				operation: editing ? "update" : "create",
			});
			expect(screen.getByLabelText("Amount")).toHaveValue("24");
			expect(onSuccess).not.toHaveBeenCalled();
		}
	);

	it("prevents duplicate mutations while a save is pending", async () => {
		let resolve: (value: unknown) => void = () => {
			throw new Error("Mutation has not started");
		};
		mocks.create.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		render(<ExpenseForm defaultValues={{ amount: 24 }} />);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Add Expense" }));
		await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
		const submit = screen.getByRole("button", { name: ADD_LABEL });
		// The button does not subscribe to isSubmitting; the form must guard duplicates.
		fireEvent.submit(submit.closest("form") as HTMLFormElement);
		expect(mocks.create).toHaveBeenCalledOnce();
		await act(async () => resolve("created"));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Expense added successfully")
		);
	});
});
