// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CycleForm } from "./cycle-form";

const JULY_31_LABEL = /July 31st, 2026/;
const AUGUST_5_LABEL = /August 5th, 2026/;
const AUGUST_20_LABEL = /August 20th, 2026/;
const JUNE_20_LABEL = /June 20th, 2026/;
const JULY_5_LABEL = /July 5th, 2026/;
const JULY_18_LABEL = /July 18th, 2026/;

const mocks = vi.hoisted(() => ({
	queries: new Map<string, unknown>(),
	create: vi.fn(),
	update: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	query: vi.fn(),
}));
vi.mock("convex/react", async () => {
	const { getFunctionName: name } = await import("convex/server");
	return {
		useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
			mocks.query(name(ref), args);
			return args === "skip" ? undefined : mocks.queries.get(name(ref));
		},
		useMutation: (ref: FunctionReference<"mutation">) =>
			name(ref) === name(api.cycles.create) ? mocks.create : mocks.update,
	};
});
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
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
	_id: sourceId,
	_creationTime: 0,
	createdAt: 0,
	userId,
	name: "June budget",
	startDate: "2026-06-01",
	endDate: "2026-07-01",
};
const categories: FunctionReturnType<typeof api.categories.list> = [
	{
		_id: foodId,
		_creationTime: 0,
		userId,
		cycleId: sourceId,
		createdAt: 0,
		name: "Food",
		plannedAmount: 300,
		order: 0,
		typeName: "Needs",
		typeColor: undefined,
	},
	{
		_id: rentId,
		_creationTime: 0,
		userId,
		cycleId: sourceId,
		createdAt: 0,
		name: "Rent",
		order: 1,
		typeName: undefined,
		typeColor: undefined,
	},
];
beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 6, 10, 12));
	mocks.queries.clear();
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
				name: "July 2026",
				startDate: "2026-07-01",
				endDate: "2026-07-31",
				copyFromCycleId: undefined,
				includePlannedAmounts: true,
				copyCategoryIds: undefined,
				categoryPlannedOverrides: undefined,
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
					name: "August 2026",
					startDate: "2026-08-05",
					endDate: "2026-08-20",
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
					copyFromCycleId: sourceId,
					includePlannedAmounts: true,
					copyCategoryIds: [foodId],
					categoryPlannedOverrides: [{ id: foodId, plannedAmount: 450 }],
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
					copyFromCycleId: sourceId,
					copyCategoryIds: undefined,
					categoryPlannedOverrides: undefined,
				})
			)
		);
	});

	it("clears and restores prefills after category selection updates, then sends empty overrides", async () => {
		render(<CycleForm />);
		const interaction = await copyPrevious();
		await interaction.click(
			screen.getByRole("checkbox", { name: "Prefill planned amounts" })
		);
		// The effect needs a parent state update to react.
		await interaction.click(screen.getByRole("checkbox", { name: "Rent" }));
		expect(screen.getAllByPlaceholderText("Planned amount")[0]).toHaveValue("");
		await interaction.click(
			screen.getByRole("checkbox", { name: "Prefill planned amounts" })
		);
		await interaction.click(screen.getByRole("checkbox", { name: "Rent" }));
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
					includePlannedAmounts: false,
					categoryPlannedOverrides: [{ id: foodId, plannedAmount: undefined }],
				})
			)
		);
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

	it.each([
		undefined,
		[],
	])("does not offer copy controls before any previous cycles are available (%s)", (cycles) => {
		fixture(api.cycles.list, cycles);
		render(<CycleForm />);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Create Cycle" })).toBeEnabled();
	});

	it("edits the existing cycle and preserves its custom name while changing dates", async () => {
		const onSuccess = vi.fn();
		render(
			<CycleForm
				cycleId={sourceId}
				defaultValues={{
					name: "Pay period",
					startDate: "2026-06-01",
					endDate: "2026-06-20",
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
				id: sourceId,
				name: "Pay period",
				startDate: "2026-07-05",
				endDate: "2026-07-18",
			})
		);
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.success).toHaveBeenCalledWith("Cycle updated successfully");
		expect(onSuccess).toHaveBeenCalledWith(sourceId);
	});

	it.each([
		new Error("ConvexError: Overlapping cycles"),
		"offline",
	])("surfaces save errors and retains the draft (%s)", async (error) => {
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
	});

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
		// The loading UI is stale; the form must still prevent duplicate submission.
		await interaction.click(submit);
		expect(mocks.create).toHaveBeenCalledOnce();
		await act(async () => resolve({ _id: "new-cycle" }));
		expect(onSuccess).toHaveBeenCalledWith("new-cycle");
	});
});
