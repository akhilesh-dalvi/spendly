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
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { CycleForm } from "./cycle-form";

const JULY_31_LABEL = /July 31st, 2026/;
const AUGUST_5_LABEL = /August 5th, 2026/;
const AUGUST_20_LABEL = /August 20th, 2026/;
const JUNE_20_LABEL = /June 20th, 2026/;
const JULY_5_LABEL = /July 5th, 2026/;
const JULY_18_LABEL = /July 18th, 2026/;

const mocks = vi.hoisted(() => ({
	categoriesByCycle: new Map<string, unknown>(),
	create: vi.fn(),
	error: vi.fn(),
	queries: new Map<string, unknown>(),
	query: vi.fn(),
	success: vi.fn(),
	update: vi.fn(),
}));
vi.mock("convex/react", async () => {
	const { getFunctionName: name } = await import("convex/server");
	return {
		useMutation: (ref: FunctionReference<"mutation">) =>
			name(ref) === name(api.cycles.create) ? mocks.create : mocks.update,
		useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
			mocks.query(name(ref), args);
			if (
				name(ref) === name(api.categories.list) &&
				typeof args === "object" &&
				args !== null &&
				"cycleId" in args &&
				typeof args.cycleId === "string" &&
				mocks.categoriesByCycle.has(args.cycleId)
			) {
				return mocks.categoriesByCycle.get(args.cycleId);
			}
			return args === "skip" ? undefined : mocks.queries.get(name(ref));
		},
	};
});
vi.mock("sonner", () => ({
	toast: { error: mocks.error, success: mocks.success },
}));
function fixture<T extends FunctionReference<"query">>(
	ref: T,
	value: FunctionReturnType<T> | undefined
) {
	mocks.queries.set(getFunctionName(ref), value);
}
const userId = "user" as Id<"users">;
const sourceId = "previous" as Id<"expense_cycles">;
const foodId = "food" as Id<"categories">;
const rentId = "rent" as Id<"categories">;
const source: FunctionReturnType<typeof api.cycles.list>[number] = {
	_creationTime: 0,
	_id: sourceId,
	createdAt: 0,
	endDate: "2026-07-01",
	name: "June budget",
	startDate: "2026-06-01",
	userId,
};
const categories: FunctionReturnType<typeof api.categories.list> = [
	{
		_creationTime: 0,
		_id: foodId,
		createdAt: 0,
		cycleId: sourceId,
		name: "Food",
		order: 0,
		plannedAmount: 300,
		typeColor: undefined,
		typeName: "Needs",
		userId,
	},
	{
		_creationTime: 0,
		_id: rentId,
		createdAt: 0,
		cycleId: sourceId,
		name: "Rent",
		order: 1,
		typeColor: undefined,
		typeName: undefined,
		userId,
	},
];
beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 6, 10, 12));
	mocks.queries.clear();
	mocks.categoriesByCycle.clear();
	mocks.create.mockReset().mockResolvedValue({ _id: "new-cycle" });
	mocks.update.mockReset().mockResolvedValue(null);
	fixture(api.cycles.list, [source]);
	fixture(api.categories.list, categories);
});
afterEach(() => vi.useRealTimers());
async function copyPrevious() {
	const interaction = userEvent.setup();
	await interaction.click(screen.getByRole("combobox"));
	await interaction.click(screen.getByRole("option", { name: "June budget" }));
	await screen.findByRole("checkbox", { name: "Food" });
	return interaction;
}

describe("CycleForm", () => {
	it("creates a cycle with the current month's defaults and returns the new ID", async () => {
		const onSuccess = vi.fn();
		render(<CycleForm onSuccess={onSuccess} />);
		expect(screen.getByLabelText("Cycle Name")).toHaveValue("July 2026");
		expect(
			screen.getByRole("button", { name: "Jul 01, 2026 - Jul 31, 2026" })
		).toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.categories.list),
			"skip"
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Create Cycle" }));
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				categoryPlannedOverrides: undefined,
				copyCategoryIds: undefined,
				copyFromCycleId: undefined,
				endDate: "2026-07-31",
				includePlannedAmounts: true,
				name: "July 2026",
				startDate: "2026-07-01",
			})
		);
		expect(mocks.success).toHaveBeenCalledWith("Cycle created successfully");
		expect(onSuccess).toHaveBeenCalledWith("new-cycle");
	});

	it("validates a missing name without sending a mutation", async () => {
		render(<CycleForm />);
		const interaction = userEvent.setup();
		await interaction.clear(screen.getByLabelText("Cycle Name"));
		await interaction.tab();
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		expect(screen.getByLabelText("Cycle Name")).toHaveValue("");
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("changes a date range using the real calendar and suggests the start month's name", async () => {
		render(<CycleForm />);
		const interaction = userEvent.setup();
		await interaction.clear(screen.getByLabelText("Cycle Name"));
		await interaction.type(screen.getByLabelText("Cycle Name"), "My budget");
		await interaction.click(
			screen.getByRole("button", { name: "Jul 01, 2026 - Jul 31, 2026" })
		);
		await interaction.click(
			screen.getAllByRole("button", { name: JULY_31_LABEL })[0]
		);
		await interaction.click(
			screen.getAllByRole("button", { name: JULY_31_LABEL })[0]
		);
		await interaction.click(
			screen.getByRole("button", { name: AUGUST_5_LABEL })
		);
		await interaction.click(
			screen.getByRole("button", { name: AUGUST_20_LABEL })
		);
		await interaction.keyboard("{Escape}");
		expect(screen.getByLabelText("Cycle Name")).toHaveValue("August 2026");
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					endDate: "2026-08-20",
					name: "August 2026",
					startDate: "2026-08-05",
				})
			)
		);
	});

	it("copies selected categories with editable planned overrides", async () => {
		const onSuccess = vi.fn();
		render(<CycleForm onSuccess={onSuccess} />);
		const interaction = await copyPrevious();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.categories.list),
			{ cycleId: sourceId }
		);
		expect(
			screen.getByRole("checkbox", { name: "Select all categories" })
		).toBeChecked();
		expect(screen.getByText("Needs")).toBeInTheDocument();
		const [food, rent] = screen.getAllByPlaceholderText("Planned amount");
		expect(food).toHaveValue("300");
		expect(rent).toHaveValue("");
		await interaction.clear(food);
		await interaction.type(food, "450");
		await interaction.click(screen.getByRole("checkbox", { name: "Rent" }));
		expect(rent).toBeDisabled();
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					categoryPlannedOverrides: [{ id: foodId, plannedAmount: 450 }],
					copyCategoryIds: [foodId],
					copyFromCycleId: sourceId,
					includePlannedAmounts: true,
				})
			)
		);
		expect(onSuccess).toHaveBeenCalledWith("new-cycle");
	});

	it("toggles select-all and individual categories and can copy without categories", async () => {
		render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Select all categories" })
		);
		expect(screen.getByRole("checkbox", { name: "Food" })).not.toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Rent" })).not.toBeChecked();
		await interaction.click(screen.getByRole("checkbox", { name: "Food" }));
		expect(screen.getByRole("checkbox", { name: "Food" })).toBeChecked();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Select all categories" })
		);
		expect(screen.getByRole("checkbox", { name: "Rent" })).toBeChecked();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Select all categories" })
		);
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					categoryPlannedOverrides: undefined,
					copyCategoryIds: [],
					copyFromCycleId: sourceId,
				})
			)
		);
	});

	it("clears and restores prefills immediately without changing category selection", async () => {
		render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Prefill planned amounts" })
		);
		expect(screen.getAllByPlaceholderText("Planned amount")[0]).toHaveValue("");
		await interaction.click(
			screen.getByRole("checkbox", { name: "Prefill planned amounts" })
		);
		expect(screen.getAllByPlaceholderText("Planned amount")[0]).toHaveValue(
			"300"
		);
		await interaction.click(
			screen.getByRole("checkbox", { name: "Prefill planned amounts" })
		);
		await interaction.click(screen.getByRole("checkbox", { name: "Rent" }));
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					categoryPlannedOverrides: [{ id: foodId, plannedAmount: undefined }],
					includePlannedAmounts: false,
				})
			)
		);
	});

	it.each(["all", "individual"] as const)(
		"keeps the source visible when deselecting every category via %s",
		async (mode) => {
			render(<CycleForm />);
			const interaction = await copyPrevious();
			expect(screen.getByText("2 of 2 selected")).toBeVisible();
			if (mode === "all") {
				await interaction.click(
					screen.getByRole("checkbox", { name: "Select all categories" })
				);
			} else {
				await interaction.click(screen.getByRole("checkbox", { name: "Food" }));
				await interaction.click(screen.getByRole("checkbox", { name: "Rent" }));
			}
			expect(screen.getByRole("combobox")).toHaveTextContent("June budget");
			expect(
				screen.getByText("0 of 2 selected — No categories will be copied.")
			).toHaveAttribute("aria-live", "polite");
			for (const input of screen.getAllByPlaceholderText("Planned amount")) {
				expect(input).toBeDisabled();
			}
			await interaction.click(
				screen.getByRole("button", { name: "Create Cycle" })
			);
			await waitFor(() =>
				expect(mocks.create).toHaveBeenCalledWith(
					expect.objectContaining({
						categoryPlannedOverrides: undefined,
						copyCategoryIds: [],
						copyFromCycleId: sourceId,
					})
				)
			);
		}
	);

	it("does not reselect categories after refresh, including new categories and temporary loading", async () => {
		const view = render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Select all categories" })
		);
		fixture(api.categories.list, undefined);
		view.rerender(<CycleForm />);
		expect(screen.getByRole("button", { name: "Create Cycle" })).toBeDisabled();
		fixture(api.categories.list, [
			...categories.map((category) => ({ ...category })),
			{
				...categories[0],
				_id: "new" as Id<"categories">,
				name: "New category",
			},
		]);
		view.rerender(<CycleForm />);
		expect(
			await screen.findByText("0 of 3 selected — No categories will be copied.")
		).toBeVisible();
		expect(
			screen.getByRole("checkbox", { name: "New category" })
		).not.toBeChecked();
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ copyCategoryIds: [] })
			)
		);
	});

	it("preserves a partial selection and custom plan on refresh, pruning removed categories", async () => {
		const view = render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(screen.getByRole("checkbox", { name: "Rent" }));
		const [food] = screen.getAllByPlaceholderText("Planned amount");
		await interaction.clear(food);
		await interaction.type(food, "0");
		fixture(
			api.categories.list,
			categories.map((category) => ({ ...category, plannedAmount: 999 }))
		);
		view.rerender(<CycleForm />);
		expect(screen.getByRole("checkbox", { name: "Rent" })).not.toBeChecked();
		expect(food).toHaveValue("0");
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					categoryPlannedOverrides: [{ id: foodId, plannedAmount: 0 }],
					copyCategoryIds: [foodId],
				})
			)
		);
		fixture(api.categories.list, [categories[1]]);
		view.rerender(<CycleForm />);
		expect(
			screen.getByText("0 of 1 selected — No categories will be copied.")
		).toBeVisible();
	});

	it("preserves a cleared plan on refresh and prefills a newly selected category", async () => {
		const view = render(<CycleForm />);
		const interaction = await copyPrevious();
		const [food] = screen.getAllByPlaceholderText("Planned amount");
		await interaction.clear(food);
		const newId = "new-food" as Id<"categories">;
		fixture(api.categories.list, [
			...categories.map((category) => ({ ...category, plannedAmount: 999 })),
			{ ...categories[0], _id: newId, name: "New food", plannedAmount: 25 },
		]);
		view.rerender(<CycleForm />);
		expect(food).toHaveValue("");
		expect(
			screen.getByRole("checkbox", { name: "New food" })
		).not.toBeChecked();
		await interaction.click(screen.getByRole("checkbox", { name: "New food" }));
		expect(screen.getAllByPlaceholderText("Planned amount")[2]).toHaveValue(
			"25"
		);
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					categoryPlannedOverrides: [
						{ id: foodId, plannedAmount: undefined },
						{ id: rentId, plannedAmount: undefined },
						{ id: newId, plannedAmount: 25 },
					],
				})
			)
		);
	});

	it("waits for late source categories before selecting all, even on native submit", async () => {
		fixture(api.categories.list, undefined);
		const view = render(<CycleForm />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("combobox"));
		await interaction.click(
			screen.getByRole("option", { name: "June budget" })
		);
		const submit = screen.getByRole("button", { name: "Create Cycle" });
		expect(submit).toBeDisabled();
		expect(screen.getByText("Loading source categories…")).toBeVisible();
		const form = submit.closest("form");
		if (!form) {
			throw new Error("Missing cycle form");
		}
		await act(async () => fireEvent.submit(form));
		expect(mocks.create).not.toHaveBeenCalled();
		fixture(api.categories.list, categories);
		view.rerender(<CycleForm />);
		expect(await screen.findByRole("checkbox", { name: "Food" })).toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Rent" })).toBeChecked();
		await interaction.click(submit);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ copyCategoryIds: [foodId, rentId] })
			)
		);
	});

	it("initializes each newly chosen source without carrying a zero selection across sources", async () => {
		const otherId = "other" as Id<"expense_cycles">;
		fixture(api.cycles.list, [
			source,
			{ ...source, _id: otherId, name: "Other source" },
		]);
		mocks.categoriesByCycle.set(otherId, undefined);
		const view = render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Select all categories" })
		);
		await interaction.click(screen.getByRole("combobox"));
		await interaction.click(
			screen.getByRole("option", { name: "Other source" })
		);
		expect(screen.getByRole("button", { name: "Create Cycle" })).toBeDisabled();
		mocks.categoriesByCycle.set(otherId, [
			{
				...categories[0],
				_id: "other-food" as Id<"categories">,
				cycleId: otherId,
				name: "Other food",
				plannedAmount: 0,
			},
		]);
		view.rerender(<CycleForm />);
		expect(
			await screen.findByRole("checkbox", { name: "Other food" })
		).toBeChecked();
		expect(screen.getByPlaceholderText("Planned amount")).toHaveValue("0");
		await interaction.click(screen.getByRole("combobox"));
		await interaction.click(
			screen.getByRole("option", { name: "Do not copy" })
		);
		await copyPrevious();
		expect(screen.getByRole("checkbox", { name: "Food" })).toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Rent" })).toBeChecked();
	});

	it("submits an explicit empty selection for an empty source, even after categories arrive", async () => {
		fixture(api.categories.list, []);
		const view = render(<CycleForm />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("combobox"));
		await interaction.click(
			screen.getByRole("option", { name: "June budget" })
		);
		fixture(api.categories.list, categories);
		view.rerender(<CycleForm />);
		expect(
			screen.getByText("0 of 2 selected — No categories will be copied.")
		).toBeVisible();
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					copyCategoryIds: [],
					copyFromCycleId: sourceId,
				})
			)
		);
	});

	it("retains copy-none on a failed save and retry", async () => {
		mocks.create.mockRejectedValueOnce(new Error("Offline"));
		render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Select all categories" })
		);
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Offline"));
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
		for (const [payload] of mocks.create.mock.calls) {
			expect(payload).toMatchObject({
				copyCategoryIds: [],
				copyFromCycleId: sourceId,
			});
		}
	});

	it.each(["Escape", "Close"] as const)(
		"dismisses a copy-none dialog via %s without saving",
		async (dismiss) => {
			render(
				<Dialog>
					<DialogTrigger>New Cycle</DialogTrigger>
					<DialogContent aria-describedby={undefined}>
						<DialogTitle>Create Cycle</DialogTitle>
						<CycleForm />
					</DialogContent>
				</Dialog>
			);
			const interaction = userEvent.setup();
			await interaction.click(
				screen.getByRole("button", { name: "New Cycle" })
			);
			await copyPrevious();
			await interaction.click(
				screen.getByRole("checkbox", { name: "Select all categories" })
			);
			if (dismiss === "Escape") {
				await interaction.keyboard("{Escape}");
			} else {
				await interaction.click(screen.getByRole("button", { name: "Close" }));
			}
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			expect(mocks.create).not.toHaveBeenCalled();
			expect(mocks.update).not.toHaveBeenCalled();
			await interaction.click(
				screen.getByRole("button", { name: "New Cycle" })
			);
			expect(screen.getByRole("combobox")).toHaveTextContent("Do not copy");
			await copyPrevious();
			expect(screen.getByRole("checkbox", { name: "Food" })).toBeChecked();
		}
	);

	it("discards a zero-selection draft on unmount without mutations", async () => {
		const view = render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Select all categories" })
		);
		view.unmount();
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
		render(<CycleForm />);
		await copyPrevious();
		expect(screen.getByRole("checkbox", { name: "Food" })).toBeChecked();
	});

	it("handles an empty source cycle and switching back to no-copy", async () => {
		fixture(api.categories.list, []);
		render(<CycleForm />);
		const interaction = userEvent.setup();
		await interaction.click(screen.getByRole("combobox"));
		await interaction.click(
			screen.getByRole("option", { name: "June budget" })
		);
		expect(
			screen.getByText("This cycle has no categories to copy.")
		).toBeInTheDocument();
		await interaction.click(screen.getByRole("combobox"));
		await interaction.click(
			screen.getByRole("option", { name: "Do not copy" })
		);
		expect(
			screen.queryByText("This cycle has no categories to copy.")
		).not.toBeInTheDocument();
		await interaction.click(
			screen.getByRole("button", { name: "Create Cycle" })
		);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith(
				expect.objectContaining({ copyFromCycleId: undefined })
			)
		);
	});

	it.each([undefined, []])(
		"does not offer copy controls before any previous cycles are available (%s)",
		(cycles) => {
			fixture(api.cycles.list, cycles);
			render(<CycleForm />);
			expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Create Cycle" })
			).toBeEnabled();
		}
	);

	it("edits the existing cycle and preserves its custom name while changing dates", async () => {
		const onSuccess = vi.fn();
		render(
			<CycleForm
				cycleId={sourceId}
				defaultValues={{
					endDate: "2026-06-20",
					name: "Pay period",
					startDate: "2026-06-01",
				}}
				onSuccess={onSuccess}
			/>
		);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		const interaction = userEvent.setup();
		await interaction.click(
			screen.getByRole("button", { name: "Jun 01, 2026 - Jun 20, 2026" })
		);
		await interaction.click(
			screen.getByRole("button", { name: JUNE_20_LABEL })
		);
		await interaction.click(
			screen.getByRole("button", { name: JUNE_20_LABEL })
		);
		await interaction.click(screen.getByRole("button", { name: JULY_5_LABEL }));
		await interaction.click(
			screen.getByRole("button", { name: JULY_18_LABEL })
		);
		await interaction.keyboard("{Escape}");
		expect(screen.getByLabelText("Cycle Name")).toHaveValue("Pay period");
		await interaction.click(
			screen.getByRole("button", { name: "Save Changes" })
		);
		await waitFor(() =>
			expect(mocks.update).toHaveBeenCalledWith({
				endDate: "2026-07-18",
				id: sourceId,
				name: "Pay period",
				startDate: "2026-07-05",
			})
		);
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.success).toHaveBeenCalledWith("Cycle updated successfully");
		expect(onSuccess).toHaveBeenCalledWith(sourceId);
	});

	it.each([new Error("ConvexError: Overlapping cycles"), "offline"])(
		"surfaces save errors and retains the draft (%s)",
		async (error) => {
			mocks.create.mockRejectedValue(error);
			const onSuccess = vi.fn();
			render(<CycleForm onSuccess={onSuccess} />);
			await userEvent
				.setup()
				.click(screen.getByRole("button", { name: "Create Cycle" }));
			await waitFor(() =>
				expect(mocks.error).toHaveBeenCalledWith(
					error instanceof Error ? "Overlapping cycles" : "Failed to save cycle"
				)
			);
			expect(onSuccess).not.toHaveBeenCalled();
			expect(screen.getByLabelText("Cycle Name")).toHaveValue("July 2026");
		}
	);

	it("does not navigate when creation returns no saved document", async () => {
		mocks.create.mockResolvedValue(null);
		const onSuccess = vi.fn();
		render(<CycleForm onSuccess={onSuccess} />);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Create Cycle" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Cycle created successfully")
		);
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it("allows retry after creation fails", async () => {
		mocks.create
			.mockRejectedValueOnce(new Error("ConvexError: Overlapping cycles"))
			.mockResolvedValueOnce({ _id: "retried-cycle" });
		const onSuccess = vi.fn();
		render(<CycleForm onSuccess={onSuccess} />);
		const interaction = userEvent.setup();
		const submit = screen.getByRole("button", { name: "Create Cycle" });
		await interaction.click(submit);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Overlapping cycles")
		);
		expect(onSuccess).not.toHaveBeenCalled();
		await interaction.click(submit);
		await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
		expect(onSuccess).toHaveBeenCalledExactlyOnceWith("retried-cycle");
	});

	it("guards against a second update until the first settles", async () => {
		let resolve: (value: unknown) => void = () => {
			throw new Error("Mutation has not started");
		};
		mocks.update.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const onSuccess = vi.fn();
		render(<CycleForm cycleId={sourceId} onSuccess={onSuccess} />);
		const interaction = userEvent.setup();
		const submit = screen.getByRole("button", { name: "Save Changes" });
		await interaction.click(submit);
		await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
		expect(submit).toBeDisabled();
		const formElement = submit.closest("form");
		if (!formElement) {
			throw new Error("Cycle form was not rendered");
		}
		// Native submits must be protected even when they bypass the disabled button.
		await act(async () => fireEvent.submit(formElement));
		expect(mocks.update).toHaveBeenCalledOnce();
		expect(onSuccess).not.toHaveBeenCalled();
		await act(async () => resolve(null));
		expect(onSuccess).toHaveBeenCalledExactlyOnceWith(sourceId);
	});

	it("guards against a second submit until creation settles", async () => {
		let resolve: (value: unknown) => void = () => {
			throw new Error("Mutation has not started");
		};
		mocks.create.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const onSuccess = vi.fn();
		render(<CycleForm onSuccess={onSuccess} />);
		const interaction = userEvent.setup();
		const submit = screen.getByRole("button", { name: "Create Cycle" });
		await interaction.click(submit);
		await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
		expect(submit).toBeDisabled();
		const formElement = submit.closest("form");
		if (!formElement) {
			throw new Error("Cycle form was not rendered");
		}
		// A programmatic submit can bypass disabled UI and must not start another save.
		await act(async () => fireEvent.submit(formElement));
		expect(mocks.create).toHaveBeenCalledOnce();
		await act(async () => resolve({ _id: "new-cycle" }));
		expect(onSuccess).toHaveBeenCalledWith("new-cycle");
	});
});
