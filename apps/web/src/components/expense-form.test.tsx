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
const NO_ACCOUNT_LABEL = /Unassigned/;
const MISC_LABEL = /Misc/;
const UNCATEGORIZED_LABEL = /Uncategorized/;
const JULY_10_LABEL = /July 10th, 2026/;
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

// Match the current selection independently of each field's accessible name.
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
	it("associates account, category and tag controls with their labels", () => {
		render(<ExpenseForm />);
		expect(screen.getByRole("combobox", { name: "Account (optional)" })).toBe(
			screen.getByLabelText("Account (optional)")
		);
		expect(screen.getByRole("combobox", { name: "Category" })).toBe(
			screen.getByLabelText("Category")
		);
		expect(screen.getByRole("combobox", { name: "Tags (optional)" })).toBe(
			screen.getByLabelText("Tags (optional)")
		);
	});

	it("applies the recent category only once and preserves an explicit uncategorized choice", async () => {
		fixture(api.expenses.listRecent, undefined);
		const view = render(<ExpenseForm defaultValues={{ amount: 24 }} />);
		expect(combobox(UNCATEGORIZED_LABEL)).toBeInTheDocument();
		fixture(api.expenses.listRecent, recent);
		view.rerender(<ExpenseForm defaultValues={{ amount: 24 }} />);
		const interaction = userEvent.setup();
		await interaction.click(combobox(FOOD_LABEL));
		await interaction.click(
			screen.getByRole("option", { name: UNCATEGORIZED_LABEL })
		);
		fixture(
			api.expenses.listRecent,
			recent.map((expense) => ({ ...expense, categoryId: otherCategoryId }))
		);
		view.rerender(<ExpenseForm defaultValues={{ amount: 24 }} />);
		expect(combobox(UNCATEGORIZED_LABEL)).toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ categoryId: undefined })
			)
		);
	});

	it("waits for categories and requires explicit removal of an incompatible category when editing", async () => {
		const values = { amount: 24, categoryId };
		const view = render(
			<ExpenseForm defaultValues={values} expenseId="edit" />
		);
		expect(combobox(FOOD_LABEL)).toBeInTheDocument();
		const nextCycleId = "august" as Id<"expense_cycles">;
		fixture(api.cycles.getCurrent, { ...cycle, _id: nextCycleId });
		fixture(api.categories.list, undefined);
		view.rerender(<ExpenseForm defaultValues={values} expenseId="edit" />);
		expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.categories.list),
			{ cycleId: nextCycleId }
		);
		fixture(api.categories.list, []);
		view.rerender(<ExpenseForm defaultValues={values} expenseId="edit" />);
		expect(
			screen.getByText("Previous category unavailable")
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "Remove previous category" })
		);
		expect(combobox(UNCATEGORIZED_LABEL)).toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith(
				expect.objectContaining({ categoryId: null })
			)
		);
	});

	it("allows note-only edits without a cycle and preserves amount, account, and tags", async () => {
		fixture(api.cycles.getCurrent, null);
		render(
			<ExpenseForm
				defaultValues={{
					accountId,
					amount: 42,
					date: new Date(2026, 6, 9),
					spentOn: "Taxi",
					tagIds: [travelId],
				}}
				expenseId="edit-1"
			/>
		);
		expect(
			screen.getByText("This expense won’t count toward a cycle budget.")
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
		expect(
			screen.queryByRole("button", { name: "Add Expense" })
		).not.toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.clear(screen.getByLabelText(NOTE_LABEL));
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith({
				accountId,
				amount: 42,
				categoryId: null,
				date: "2026-07-09",
				id: "edit-1",
				spentOn: null,
				tagIds: [travelId],
			})
		);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("does not silently remove a category when the date has no cycle, and restores it when returning", async () => {
		fixture(api.cycles.getCurrent, { ...cycle, endDate: "2026-07-15" });
		const values = {
			accountId,
			amount: 42,
			categoryId,
			date: new Date(2026, 6, 10),
			spentOn: "Taxi",
		};
		const view = render(
			<ExpenseForm defaultValues={values} expenseId="edit-1" />
		);
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "July 10th, 2026" })
		);
		await interaction.click(
			screen.getByRole("button", { name: JULY_15_LABEL })
		);
		await interaction.keyboard("{Escape}");
		fixture(api.cycles.getCurrent, null);
		view.rerender(<ExpenseForm defaultValues={values} expenseId="edit-1" />);
		expect(
			screen.getByText("Previous category unavailable")
		).toBeInTheDocument();
		const save = screen.getByRole("button", { name: "Save Changes" });
		expect(save).toBeDisabled();
		const form = save.closest("form");
		if (!form) {
			throw new Error("Missing expense form");
		}
		fireEvent.submit(form);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				"Resolve the previous category before saving."
			)
		);
		expect(mocks.update).not.toHaveBeenCalled();
		await interaction.click(
			screen.getByRole("button", { name: "July 15th, 2026" })
		);
		await interaction.click(
			screen.getByRole("button", { name: JULY_10_LABEL })
		);
		await interaction.keyboard("{Escape}");
		fixture(api.cycles.getCurrent, { ...cycle, endDate: "2026-07-15" });
		view.rerender(<ExpenseForm defaultValues={values} expenseId="edit-1" />);
		expect(combobox(FOOD_LABEL)).toBeInTheDocument();
		expect(
			screen.queryByText("Previous category unavailable")
		).not.toBeInTheDocument();
		expect(save).toBeEnabled();
	});

	it("saves outside all cycles only after explicitly removing the incompatible category", async () => {
		fixture(api.cycles.getCurrent, null);
		render(
			<ExpenseForm
				defaultValues={{ amount: 42, categoryId, spentOn: "Taxi" }}
				expenseId="edit-1"
			/>
		);
		const interaction = userEvent.setup();
		expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
		await interaction.click(
			screen.getByRole("button", { name: "Remove previous category" })
		);
		expect(
			screen.queryByText("Previous category unavailable")
		).not.toBeInTheDocument();
		expect(mocks.update).not.toHaveBeenCalled();
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith(
				expect.objectContaining({ categoryId: null, spentOn: undefined })
			)
		);
	});

	it("allows choosing a replacement category instead of removing the old one", async () => {
		const values = { amount: 42, categoryId };
		const view = render(
			<ExpenseForm defaultValues={values} expenseId="edit-1" />
		);
		fixture(api.categories.list, [categories[1]]);
		view.rerender(<ExpenseForm defaultValues={values} expenseId="edit-1" />);
		const category = screen.getByRole("combobox", { name: "Category" });
		expect(category).toHaveTextContent("Previous category (unavailable)");
		const interaction = userEvent.setup();
		await interaction.click(category);
		await interaction.click(screen.getByRole("option", { name: MISC_LABEL }));
		expect(
			screen.queryByText("Previous category unavailable")
		).not.toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith(
				expect.objectContaining({ categoryId: otherCategoryId })
			)
		);
	});

	it("waits for destination categories without assigning recent defaults when moving into a cycle", async () => {
		fixture(api.cycles.getCurrent, null);
		const view = render(
			<ExpenseForm defaultValues={{ amount: 42 }} expenseId="edit-1" />
		);
		fixture(api.cycles.getCurrent, cycle);
		fixture(api.categories.list, undefined);
		view.rerender(
			<ExpenseForm defaultValues={{ amount: 42 }} expenseId="edit-1" />
		);
		const save = screen.getByRole("button", { name: "Save Changes" });
		expect(save).toBeDisabled();
		const form = save.closest("form");
		if (!form) {
			throw new Error("Missing expense form");
		}
		fireEvent.submit(form);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				"Wait for cycle and categories to finish loading."
			)
		);
		expect(mocks.update).not.toHaveBeenCalled();
		fixture(api.categories.list, categories);
		view.rerender(
			<ExpenseForm defaultValues={{ amount: 42 }} expenseId="edit-1" />
		);
		expect(combobox(UNCATEGORIZED_LABEL)).toBeInTheDocument();
		await userEvent.setup().click(save);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith(
				expect.objectContaining({ categoryId: null })
			)
		);
	});

	it.each([undefined, null])(
		"waits for cycle resolution before allowing native or button saves (cycle=%s)",
		async (cycleResult) => {
			fixture(api.cycles.getCurrent, undefined);
			const view = render(
				<ExpenseForm defaultValues={{ amount: 24 }} expenseId="edit" />
			);
			const save = screen.getByRole("button", { name: "Save Changes" });
			expect(save).toBeDisabled();
			const form = save.closest("form");
			if (!form) {
				throw new Error("Missing expense form");
			}
			fireEvent.submit(form);
			await waitFor(() =>
				expect(mocks.error).toHaveBeenCalledWith(
					"Wait for cycle and categories to finish loading."
				)
			);
			expect(mocks.update).not.toHaveBeenCalled();
			fixture(api.cycles.getCurrent, cycleResult);
			view.rerender(
				<ExpenseForm defaultValues={{ amount: 24 }} expenseId="edit" />
			);
			if (cycleResult === null) {
				expect(save).toBeEnabled();
			} else {
				expect(save).toBeDisabled();
			}
		}
	);

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
		["archived recent", undefined, false, "Unassigned"],
	] as const)(
		"resolves smart defaults for %s",
		(_label, defaultId, archived, expected) => {
			fixture(api.users.get, { ...user, defaultAccountId: defaultId });
			fixture(
				api.accounts.list,
				accounts.map((account) => ({
					...account,
					isArchived:
						account._id === accountId ? archived : expected === "Unassigned",
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
		expect(combobox("Unassigned")).toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.click(combobox("Unassigned"));
		expect(screen.queryByRole("option")).not.toBeInTheDocument();
		await interaction.keyboard("{Escape}");
		fixture(api.users.get, { ...user, defaultAccountId: undefined });
		fixture(api.accounts.list, accounts);
		view.rerender(<ExpenseForm />);
		expect(combobox("Unassigned")).toBeInTheDocument();
		await interaction.click(combobox("Unassigned"));
		await interaction.click(screen.getByRole("option", { name: CASH_LABEL }));
		fixture(api.expenses.listRecent, recent);
		view.rerender(<ExpenseForm />);
		expect(combobox("Cash")).toBeInTheDocument();
	});

	it.each(["user", "recent", "changed-default"] as const)(
		"keeps an explicit Unassigned choice when %s defaults arrive and submits null",
		async (source) => {
			if (source === "user") {
				fixture(api.users.get, undefined);
			} else if (source === "recent") {
				fixture(api.users.get, { ...user, defaultAccountId: undefined });
				fixture(api.expenses.listRecent, undefined);
			}
			const view = render(<ExpenseForm defaultValues={{ tagIds: [workId] }} />);
			const interaction = await enterAmount();
			await interaction.type(screen.getByLabelText(NOTE_LABEL), "Lunch");
			await interaction.click(screen.getByLabelText("Account (optional)"));
			await interaction.click(
				screen.getByRole("option", { name: NO_ACCOUNT_LABEL })
			);
			if (source === "recent") {
				fixture(api.expenses.listRecent, recent);
			} else {
				fixture(api.users.get, {
					...user,
					defaultAccountId: source === "user" ? accountId : cardId,
				});
			}
			view.rerender(<ExpenseForm defaultValues={{ tagIds: [workId] }} />);
			expect(combobox("Unassigned")).toHaveAccessibleDescription(
				"Choose where this expense was paid from."
			);
			await interaction.click(
				screen.getByRole("button", { name: "Add Expense" })
			);
			await waitFor(() =>
				expect(mocks.create).toHaveBeenCalledWith({
					accountId: null,
					amount: 12.5,
					categoryId,
					date: "2026-07-10",
					spentOn: "Lunch",
					tagIds: [workId],
				})
			);
		}
	);

	it("keeps the account helper unchanged and explains balance effects only in the Unassigned option", async () => {
		render(<ExpenseForm />);
		const interaction = userEvent.setup();
		expect(combobox("Cash")).toHaveAccessibleDescription(
			"Choose where this expense was paid from."
		);
		await interaction.click(combobox("Cash"));
		const unassigned = screen.getByRole("option", { name: NO_ACCOUNT_LABEL });
		expect(unassigned).toHaveTextContent(
			"This expense won’t affect any account balance."
		);
		expect(
			screen.getAllByText("This expense won’t affect any account balance.")
		).toHaveLength(1);
		await interaction.click(unassigned);
		expect(combobox("Unassigned")).toHaveAccessibleDescription(
			"Choose where this expense was paid from."
		);
		expect(
			screen.queryByText("This expense won’t affect any account balance.")
		).not.toBeInTheDocument();
	});

	it("preserves an explicitly empty initial account despite available defaults", async () => {
		render(<ExpenseForm defaultValues={{ accountId: "", amount: 10 }} />);
		expect(combobox("Unassigned")).toBeInTheDocument();
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Add Expense" }));
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ accountId: null })
			)
		);
	});

	it("still applies untouched smart defaults after accounts finish loading", () => {
		fixture(api.accounts.list, undefined);
		const view = render(<ExpenseForm />);
		expect(combobox("Unassigned")).toBeInTheDocument();
		fixture(api.accounts.list, accounts);
		view.rerender(<ExpenseForm />);
		expect(combobox("Cash")).toBeInTheDocument();
	});

	it("retains Unassigned through a failed save, account refresh, retry, and Add another", async () => {
		mocks.create.mockRejectedValueOnce(new Error("offline"));
		const onSuccess = vi.fn();
		const view = render(<ExpenseForm onSuccess={onSuccess} />);
		const interaction = await enterAmount();
		await interaction.click(combobox("Cash"));
		await interaction.click(
			screen.getByRole("option", { name: NO_ACCOUNT_LABEL })
		);
		await interaction.click(
			screen.getByRole("switch", { name: "Add another expense" })
		);
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to add expense")
		);
		fixture(api.accounts.list, undefined);
		view.rerender(<ExpenseForm onSuccess={onSuccess} />);
		fixture(api.accounts.list, accounts);
		fixture(api.users.get, { ...user, defaultAccountId: cardId });
		view.rerender(<ExpenseForm onSuccess={onSuccess} />);
		expect(combobox("Unassigned")).toBeInTheDocument();
		expect(screen.getByLabelText("Amount")).toHaveValue("12.5");
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() =>
			expect(screen.getByLabelText("Amount")).toHaveValue("")
		);
		fixture(api.users.get, user);
		fixture(api.expenses.listRecent, [{ ...recent[0], accountId: undefined }]);
		view.rerender(<ExpenseForm onSuccess={onSuccess} />);
		expect(combobox("Unassigned")).toBeInTheDocument();
		await enterAmount("9");
		await interaction.click(
			screen.getByRole("button", { name: "Add Expense" })
		);
		await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
		for (const [payload] of mocks.create.mock.calls) {
			expect(payload).toMatchObject({ accountId: null });
		}
		expect(onSuccess).not.toHaveBeenCalled();
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
				expect.objectContaining({ accountId: null })
			)
		);
	});

	it("offers account creation when the account list is empty", async () => {
		fixture(api.accounts.list, []);
		fixture(api.expenses.listRecent, []);
		render(<ExpenseForm />);
		await userEvent.setup().click(combobox("Unassigned"));
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

	it.each([false, true])(
		"places a missing-cycle notice directly below Date without affecting account selection (editing=%s)",
		(editing) => {
			fixture(api.cycles.getCurrent, null);
			const props = {
				defaultValues: { amount: 12.5 },
				expenseId: editing ? "edit-1" : undefined,
			};
			const view = render(<ExpenseForm {...props} />);
			const date = screen.getByRole("button", { name: JULY_10_LABEL });
			const notice = screen.getByRole("status");
			expect(date.nextElementSibling).toBe(notice);
			expect(screen.getAllByText("No cycle for this date")).toHaveLength(1);
			expect(screen.getByLabelText("Account (optional)")).toBeEnabled();
			expect(
				screen.getByText("Categories are unavailable without a cycle.")
					.parentElement
			).not.toContainElement(notice);
			expect(screen.queryByRole("combobox", { name: "Category" })).toBeNull();
			if (editing) {
				expect(
					screen.getByRole("button", { name: "Save Changes" })
				).toBeEnabled();
			} else {
				expect(
					screen.getByRole("button", { name: "Add Expense" })
				).toBeDisabled();
				expect(
					screen.getByRole("link", { name: "Create cycle" })
				).toHaveAttribute("href", "/cycles/new");
			}
			fixture(api.cycles.getCurrent, cycle);
			view.rerender(<ExpenseForm {...props} />);
			expect(screen.queryByText("No cycle for this date")).toBeNull();
			expect(screen.getByRole("combobox", { name: "Category" })).toBeEnabled();
		}
	);

	it("uses theme-aware notice and action colors when creation has no cycle", () => {
		fixture(api.cycles.getCurrent, null);
		render(<ExpenseForm />);
		const notice = screen.getByText("No cycle for this date").parentElement
			?.parentElement;
		expect(notice).toHaveTextContent("No cycle for this date");
		expect(notice).toHaveTextContent(
			"Choose another date or create a cycle to continue."
		);
		expect(notice).toHaveClass("bg-card", "text-card-foreground");
		expect(screen.getByRole("status")).toBe(notice);
		const create = screen.getByRole("link", { name: "Create cycle" });
		expect(notice).toContainElement(create);
		expect(create).toHaveAttribute("href", "/cycles/new");
		expect(create).toHaveClass(
			"bg-primary",
			"text-primary-foreground",
			"hover:bg-primary/90"
		);
		expect(screen.getByRole("button", { name: "Add Expense" })).toBeDisabled();
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
		expect(screen.getByRole("link", { name: "Create cycle" })).toHaveAttribute(
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

	it.each(["", "   ", "\t \u00a0"])(
		"explicitly clears a saved note when the draft is %j without changing other fields",
		async (draft) => {
			render(
				<ExpenseForm
					defaultValues={{
						accountId,
						amount: 42,
						categoryId,
						date: new Date(2026, 6, 9),
						spentOn: "Taxi",
						tagIds: [travelId],
					}}
					expenseId="edit-1"
				/>
			);
			fireEvent.change(screen.getByLabelText(NOTE_LABEL), {
				target: { value: draft },
			});
			await userEvent
				.setup()
				.click(screen.getByRole("button", { name: "Save Changes" }));
			await waitFor(() =>
				expect(mocks.update).toHaveBeenCalledWith({
					accountId,
					amount: 42,
					categoryId,
					date: "2026-07-09",
					id: "edit-1",
					spentOn: null,
					tagIds: [travelId],
				})
			);
			expect(mocks.create).not.toHaveBeenCalled();
		}
	);

	it("keeps a failed clear draft for retry and disables Cancel while saving", async () => {
		const pending = pendingMutation();
		mocks.update.mockReturnValueOnce(pending.promise);
		const onCancel = vi.fn();
		render(
			<ExpenseForm
				defaultValues={{ amount: 42, spentOn: "Taxi" }}
				expenseId="edit-1"
				onCancel={onCancel}
			/>
		);
		const interaction = userEvent.setup();
		await interaction.clear(screen.getByLabelText(NOTE_LABEL));
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		await act(() => pending.reject(new Error("offline")));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to update expense")
		);
		expect(screen.getByLabelText(NOTE_LABEL)).toHaveValue("");
		expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
		expect(onCancel).not.toHaveBeenCalled();
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
		expect(mocks.update).toHaveBeenLastCalledWith(
			expect.objectContaining({ spentOn: null })
		);
	});

	it.each([undefined, "", "Taxi", " Legacy note "])(
		"omits an untouched note (%j) rather than rewriting it",
		async (spentOn) => {
			render(
				<ExpenseForm
					defaultValues={{ amount: 42, spentOn }}
					expenseId="edit-1"
				/>
			);
			await userEvent
				.setup()
				.click(screen.getByRole("button", { name: "Save Changes" }));
			await waitFor(() =>
				expect(mocks.update).toHaveBeenCalledWith(
					expect.objectContaining({ spentOn: undefined })
				)
			);
		}
	);

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
				categoryId: null,
				date: "2026-07-09",
				id: "edit-1",
				spentOn: undefined,
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
		expect(submit).toBeDisabled();
		// Native submission bypasses the disabled button; the form also guards it.
		fireEvent.submit(submit.closest("form") as HTMLFormElement);
		expect(mocks.create).toHaveBeenCalledOnce();
		await act(async () => resolve("created"));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Expense added successfully")
		);
	});
});
