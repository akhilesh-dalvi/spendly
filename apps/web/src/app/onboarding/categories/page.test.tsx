// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingCategoriesPage from "./page";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	save: vi.fn(),
	advance: vi.fn(),
	push: vi.fn(),
	report: vi.fn(),
	requestedCycle: "",
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		getFunctionName(reference) === "categories:saveOnboardingCategories"
			? mocks.save
			: mocks.advance,
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: mocks.push }),
	useSearchParams: () =>
		new URLSearchParams(
			mocks.requestedCycle ? { cycleId: mocks.requestedCycle } : {}
		),
	usePathname: () => "/onboarding/categories",
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));
// The modal's form is covered separately; this seam tests the page's type callback wiring.
vi.mock("@/components/category-type-modal", () => ({
	CategoryTypeModal: ({
		open,
		onSuccess,
		onOpenChange,
	}: {
		open: boolean;
		onSuccess: (id: string) => void;
		onOpenChange: (open: boolean) => void;
	}) =>
		open ? (
			<div>
				<button
					onClick={() => {
						onSuccess("type-custom");
						onOpenChange(false);
					}}
					type="button"
				>
					Create custom type
				</button>
				<button onClick={() => onOpenChange(false)} type="button">
					Cancel type
				</button>
			</div>
		) : null,
}));

const cycleId = "cycle-own";
const types = [
	{ _id: "type-needs", name: "Needs" },
	{ _id: "type-wants", name: "Wants" },
	{ _id: "type-savings", name: "Savings" },
	{ _id: "type-custom", name: "Custom" },
];
const fixtures = new Map<string, unknown>();
const names = () => screen.getAllByRole("textbox", { name: "Category name" });
const amounts = () =>
	screen.getAllByRole("spinbutton", { name: "Planned amount" });
const saveButton = () =>
	screen.getByRole("button", { name: "Save categories and continue" });
const existing = [
	{
		_id: "category-rent",
		name: "Rent",
		categoryTypeId: "type-needs",
		plannedAmount: 100,
		icon: "🏠",
	},
	{ _id: "category-food", name: "Food", plannedAmount: 0 },
	{ _id: "category-books", name: "Books" },
	{
		_id: "category-hidden",
		name: "Secret",
		plannedAmount: 999,
		isHidden: true,
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requestedCycle = "";
	fixtures.clear();
	fixtures.set(getFunctionName(api.users.getOnboardingState), {
		cycle: { _id: cycleId },
		currency: "USD",
		path: "plan",
	});
	fixtures.set(getFunctionName(api.categories.listTypes), types);
	fixtures.set(getFunctionName(api.categories.list), []);
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0], args: unknown) =>
			args === "skip" ? undefined : fixtures.get(getFunctionName(reference))
	);
	mocks.save.mockResolvedValue(undefined);
	mocks.advance.mockResolvedValue(undefined);
});

describe("onboarding category planning", () => {
	it.each([
		"state",
		"types",
		"categories",
	] as const)("waits for %s before initializing suggestions", (missing) => {
		const reference = {
			state: api.users.getOnboardingState,
			types: api.categories.listTypes,
			categories: api.categories.list,
		}[missing];
		const key = getFunctionName(reference);
		const value = fixtures.get(key);
		fixtures.set(key, undefined);
		const { rerender } = render(<OnboardingCategoriesPage />);
		expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		if (missing === "state") {
			expect(mocks.query).toHaveBeenCalledWith(api.categories.list, "skip");
		}
		fixtures.set(key, value);
		rerender(<OnboardingCategoriesPage />);
		expect(names().map((input) => (input as HTMLInputElement).value)).toEqual([
			"Rent",
			"Groceries",
			"Transport",
			"Utilities",
			"Shopping",
			"Entertainment",
			"Savings",
		]);
		expect(
			screen.getByRole("combobox", { name: "Category type for Rent" })
		).toHaveTextContent("Needs");
		expect(
			screen.getByRole("combobox", { name: "Category type for Shopping" })
		).toHaveTextContent("Wants");
		expect(
			screen.getByRole("combobox", { name: "Category type for Savings" })
		).toHaveTextContent("Savings");
		expect(screen.getByRole("heading", { name: "$0.00" })).toBeVisible();
	});

	it("initializes only visible existing categories, preserves zero and blank plans, and does not overwrite local edits on query refresh", async () => {
		const user = userEvent.setup();
		fixtures.set(getFunctionName(api.categories.list), existing);
		const { rerender } = render(<OnboardingCategoriesPage />);
		expect(names()).toHaveLength(3);
		expect(amounts()[0]).toHaveValue(100);
		expect(amounts()[1]).toHaveValue(0);
		expect(amounts()[2]).toHaveValue(null);
		expect(
			screen.getByRole("combobox", { name: "Icon for Food" })
		).toHaveTextContent("📦");
		expect(screen.queryByDisplayValue("Secret")).not.toBeInTheDocument();
		await user.clear(names()[0]);
		await user.type(names()[0], " My rent ");
		fixtures.set(getFunctionName(api.categories.list), [
			{ ...existing[0], name: "Server rent" },
		]);
		rerender(<OnboardingCategoriesPage />);
		expect(names()[0]).toHaveValue(" My rent ");
		await user.click(saveButton());
		await waitFor(() =>
			expect(mocks.push).toHaveBeenCalledWith(
				`/onboarding/accounts?cycleId=${cycleId}`
			)
		);
		expect(mocks.save).toHaveBeenCalledWith({
			cycleId,
			categories: [
				{
					categoryId: "category-rent",
					categoryTypeId: "type-needs",
					icon: "🏠",
					name: "My rent",
					plannedAmount: 100,
				},
				{
					categoryId: "category-food",
					categoryTypeId: undefined,
					icon: "📦",
					name: "Food",
					plannedAmount: 0,
				},
				{
					categoryId: "category-books",
					categoryTypeId: undefined,
					icon: "📦",
					name: "Books",
					plannedAmount: undefined,
				},
			],
		});
	});

	it("falls back to untyped suggestions when all existing categories are hidden and types are absent", () => {
		fixtures.set(getFunctionName(api.categories.list), [existing[3]]);
		fixtures.set(getFunctionName(api.categories.listTypes), []);
		render(<OnboardingCategoriesPage />);
		expect(names()).toHaveLength(7);
		expect(
			screen.getByRole("combobox", { name: "Category type for Rent" })
		).toHaveTextContent("No type");
		expect(screen.queryByDisplayValue("Secret")).not.toBeInTheDocument();
	});

	it("updates decimal plans, live group shares, optional type and the real emoji picker, then saves against the owned cycle", async () => {
		const user = userEvent.setup();
		mocks.requestedCycle = "cycle-foreign";
		render(<OnboardingCategoriesPage />);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"That cycle is not available"
		);
		expect(mocks.query).toHaveBeenCalledWith(api.categories.list, { cycleId });
		await user.type(amounts()[0], "75.25");
		await user.type(amounts()[4], "24.75");
		expect(screen.getByRole("heading", { name: "$100.00" })).toBeVisible();
		expect(screen.getByText("Needs · 75%")).toBeVisible();
		expect(screen.getByText("Wants · 25%")).toBeVisible();
		await user.click(
			screen.getByRole("combobox", { name: "Category type for Rent" })
		);
		await user.click(screen.getByRole("option", { name: "No type" }));
		expect(screen.queryByText("Needs · 75%")).not.toBeInTheDocument();
		await user.click(screen.getByRole("combobox", { name: "Icon for Rent" }));
		await user.type(screen.getByPlaceholderText("Search emojis..."), "garden");
		await user.click(screen.getByRole("button", { name: "🏡" }));
		await user.click(saveButton());
		expect(mocks.save.mock.calls[0][0]).toMatchObject({
			cycleId,
			categories: expect.arrayContaining([
				{
					categoryId: undefined,
					categoryTypeId: undefined,
					icon: "🏡",
					name: "Rent",
					plannedAmount: 75.25,
				},
			]),
		});
	});

	it("removes and restores in LIFO order, focuses a custom draft and excludes whitespace-only names from submission", async () => {
		const user = userEvent.setup();
		render(<OnboardingCategoriesPage />);
		await user.click(screen.getByRole("button", { name: "Remove Rent" }));
		await user.click(screen.getByRole("button", { name: "Remove Groceries" }));
		expect(
			screen.getByText(
				"Removed Groceries. You can restore it before continuing."
			)
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Undo removal" }));
		expect(names().at(-1)).toHaveValue("Groceries");
		await user.click(screen.getByRole("button", { name: "Undo removal" }));
		expect(names().at(-1)).toHaveValue("Rent");
		expect(
			screen.queryByRole("button", { name: "Undo removal" })
		).not.toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: "Add a custom category" })
		);
		await waitFor(() => expect(names().at(-1)).toHaveFocus());
		await user.click(screen.getByRole("button", { name: "Remove category" }));
		expect(
			screen.getByText(
				"Removed category. You can restore it before continuing."
			)
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Undo removal" }));
		await user.type(names().at(-1) as HTMLElement, "   ");
		expect(screen.getByText("7 categories")).toBeVisible();
		await user.click(saveButton());
		expect(mocks.save.mock.calls[0][0].categories).toHaveLength(7);
	});

	it("assigns newly created types to the target draft and supports cancelling type creation", async () => {
		const user = userEvent.setup();
		render(<OnboardingCategoriesPage />);
		await user.click(
			screen.getByRole("combobox", { name: "Category type for Rent" })
		);
		await user.click(screen.getByRole("option", { name: "Add category type" }));
		await user.click(screen.getByRole("button", { name: "Cancel type" }));
		expect(
			screen.getByRole("combobox", { name: "Category type for Rent" })
		).toHaveTextContent("Needs");
		await user.click(
			screen.getByRole("combobox", { name: "Category type for Rent" })
		);
		await user.click(screen.getByRole("option", { name: "Add category type" }));
		await user.click(
			screen.getByRole("button", { name: "Create custom type" })
		);
		expect(
			screen.getByRole("combobox", { name: "Category type for Rent" })
		).toHaveTextContent("Custom");
		await user.click(saveButton());
		expect(mocks.save.mock.calls[0][0].categories[0].categoryTypeId).toBe(
			"type-custom"
		);
	});

	it("rejects negative plans, focuses the invalid amount and clears errors on correction", async () => {
		const user = userEvent.setup();
		const { container } = render(<OnboardingCategoriesPage />);
		fireEvent.change(amounts()[0], { target: { value: "-1" } });
		// Exercise the page validation independently of the browser's min constraint.
		fireEvent.submit(container.querySelector("form") as HTMLFormElement);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Planned amounts must be zero or greater."
		);
		expect(amounts()[0]).toHaveFocus();
		expect(mocks.save).not.toHaveBeenCalled();
		await user.clear(amounts()[0]);
		await user.type(amounts()[0], "0");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		await user.click(saveButton());
		expect(mocks.save.mock.calls[0][0].categories[0].plannedAmount).toBe(0);
	});

	it("retains drafts and releases both controls after a save failure, allowing retry", async () => {
		const user = userEvent.setup();
		const error = new Error("offline");
		let rejectSave: (error: Error) => void = () => undefined;
		mocks.save.mockReturnValueOnce(
			new Promise((_resolve, reject) => {
				rejectSave = reject;
			})
		);
		render(<OnboardingCategoriesPage />);
		await user.type(amounts()[0], "12.34");
		await user.click(saveButton());
		expect(saveButton()).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "Skip category setup" })
		).toBeDisabled();
		rejectSave(error);
		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(
				"Your entries are still here"
			)
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "onboarding",
			operation: "create",
		});
		expect(amounts()[0]).toHaveValue(12.34);
		expect(saveButton()).toBeEnabled();
		expect(mocks.push).not.toHaveBeenCalled();
		await user.click(saveButton());
		await waitFor(() =>
			expect(mocks.push).toHaveBeenCalledWith(
				`/onboarding/accounts?cycleId=${cycleId}`
			)
		);
	});

	it("skips without saving invalid drafts, reports skip failure and retries successfully", async () => {
		const user = userEvent.setup();
		const error = new Error("offline");
		mocks.advance.mockRejectedValueOnce(error);
		render(<OnboardingCategoriesPage />);
		fireEvent.change(amounts()[0], { target: { value: "-1" } });
		await user.click(
			screen.getByRole("button", { name: "Skip category setup" })
		);
		await waitFor(() =>
			expect(screen.getByRole("alert")).toHaveTextContent(
				"We couldn't skip category setup"
			)
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "onboarding",
			operation: "skip",
		});
		expect(mocks.advance).toHaveBeenCalledWith({ step: "account" });
		expect(mocks.save).not.toHaveBeenCalled();
		await user.click(
			screen.getByRole("button", { name: "Skip category setup" })
		);
		await waitFor(() =>
			expect(mocks.push).toHaveBeenCalledWith(
				`/onboarding/accounts?cycleId=${cycleId}`
			)
		);
	});
});
