// @vitest-environment jsdom
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FunctionReference, getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TagsPage from "./tags/page";
import TypesPage from "./types/page";

const state = vi.hoisted(() => ({
	data: undefined as unknown,
	create: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: () => state.data,
	useMutation: (reference: FunctionReference<"mutation">) => {
		const name = getFunctionName(reference);
		if (name.endsWith("create") || name.endsWith("createType")) {
			return state.create;
		}
		if (name.endsWith("update") || name.endsWith("updateType")) {
			return state.update;
		}
		return state.remove;
	},
}));
vi.mock("sonner", () => ({
	toast: { success: state.success, error: state.error },
}));

const resources = [
	{
		label: "tags",
		Page: TagsPage,
		heading: "Tags",
		newButton: "New Tag",
		createButton: "Create Tag",
		nameLabel: "Tag Name",
		search: "Search tags...",
		empty: "No tags found",
		noMatch: "No matching tags",
		suggestion: "Work",
		createSuccess: "Tag created successfully",
		idKey: "tagId",
		createError: "Failed to create tag",
		editError: "Failed to update tag",
		deleteError: "Failed to delete tag",
	},
	{
		label: "types",
		Page: TypesPage,
		heading: "Category Types",
		newButton: "New Type",
		createButton: "Create Type",
		nameLabel: "Type Name",
		search: "Search types...",
		empty: "No category types found",
		noMatch: "No matching types",
		suggestion: "Savings",
		createSuccess: "Category type created successfully",
		idKey: "id",
		createError: "Failed to create category type",
		editError: "Failed to update category type",
		deleteError: "Failed to delete category type",
	},
] as const;
const records = [
	{
		_id: "first",
		name: "Travel",
		usageCount: 1,
		color: "#3b82f6",
		createdAt: Date.UTC(2026, 0, 1),
	},
	{
		_id: "second",
		name: "Unused",
		usageCount: 0,
		createdAt: Date.UTC(2026, 0, 2),
	},
	{
		_id: "third",
		name: "Recurring",
		usageCount: 2,
		color: "invalid",
		createdAt: Date.UTC(2026, 0, 3),
	},
];

beforeEach(() => {
	state.data = records;
	vi.resetAllMocks();
	state.create.mockResolvedValue("created");
	state.update.mockResolvedValue(undefined);
	state.remove.mockResolvedValue(undefined);
});

for (const resource of resources) {
	describe(`${resource.label} management`, () => {
		it("distinguishes loading, empty collections, and no matching search results", async () => {
			state.data = undefined;
			const { rerender, container } = render(<resource.Page />);
			expect(
				screen.getByRole("heading", { name: resource.heading })
			).toBeVisible();
			expect(
				container.querySelector('[data-slot="skeleton"]')
			).toBeInTheDocument();
			state.data = [];
			rerender(<resource.Page />);
			expect(screen.getByText(resource.empty)).toBeVisible();
			state.data = records;
			rerender(<resource.Page />);
			await userEvent
				.setup()
				.type(screen.getByPlaceholderText(resource.search), "not present");
			expect(screen.getByText(resource.noMatch)).toBeVisible();
		});

		it("filters usage and case-insensitive search without changing overall totals", async () => {
			const user = userEvent.setup();
			render(<resource.Page />);
			await user.click(screen.getByRole("button", { name: "In use" }));
			expect(
				within(screen.getByRole("table")).queryByText("Unused")
			).not.toBeInTheDocument();
			await user.type(screen.getByPlaceholderText(resource.search), " TRAVEL ");
			expect(
				within(screen.getByRole("table")).getByText("Travel")
			).toBeVisible();
			expect(
				within(screen.getByRole("table")).queryByText("Recurring")
			).not.toBeInTheDocument();
			await user.clear(screen.getByPlaceholderText(resource.search));
			await user.click(screen.getByRole("button", { name: "All" }));
			expect(
				within(screen.getByRole("table")).getByText("Unused", {
					selector: "[data-slot=badge]",
				})
			).toBeVisible();
			for (const header of [resource.nameLabel, "Usage", "Created"]) {
				await user.click(screen.getByRole("button", { name: header }));
				await user.click(screen.getByRole("button", { name: header }));
			}
			expect(
				within(screen.getByRole("table")).getAllByRole("row")
			).toHaveLength(4);
		});

		it("requires a non-blank name, applies suggestions, and resets a dismissed creation form", async () => {
			const user = userEvent.setup();
			render(<resource.Page />);
			await user.click(
				screen.getByRole("button", { name: resource.newButton })
			);
			const dialog = screen.getByRole("dialog");
			const submit = within(dialog).getByRole("button", {
				name: resource.createButton,
			});
			expect(submit).toBeDisabled();
			fireEvent.submit(
				within(dialog).getByLabelText(resource.nameLabel).closest("form") ??
					dialog
			);
			expect(state.create).not.toHaveBeenCalled();
			await user.click(
				within(dialog).getByRole("button", {
					name: resource.suggestion,
				})
			);
			expect(within(dialog).getByLabelText(resource.nameLabel)).toHaveValue(
				resource.suggestion
			);
			await user.keyboard("{Escape}");
			await user.click(
				screen.getByRole("button", { name: resource.newButton })
			);
			expect(screen.getByLabelText(resource.nameLabel)).toHaveValue("");
		});

		it("creates a trimmed name with the selected color and closes the dialog only on success", async () => {
			const user = userEvent.setup();
			render(<resource.Page />);
			await user.click(
				screen.getByRole("button", { name: resource.newButton })
			);
			await user.type(
				screen.getByLabelText(resource.nameLabel),
				"  New item  "
			);
			if (resource.label === "types") {
				await user.click(
					screen.getByRole("button", { name: "Select #10b981 color" })
				);
			}
			await user.click(
				screen.getByRole("button", { name: resource.createButton })
			);
			await waitFor(() =>
				expect(state.create).toHaveBeenCalledWith(
					resource.label === "tags"
						? { name: "New item" }
						: { name: "New item", color: "#10b981" }
				)
			);
			expect(state.success).toHaveBeenCalledWith(resource.createSuccess);
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});

		it.each([
			new Error("ConvexError: Name already exists"),
			{ unexpected: true },
			// biome-ignore lint/suspicious/useErrorMessage: Verify the fallback for blank backend messages.
			new Error(" "),
		])("keeps creation input available after backend failure %#", async (failure) => {
			state.create.mockRejectedValue(failure);
			const user = userEvent.setup();
			render(<resource.Page />);
			await user.click(
				screen.getByRole("button", { name: resource.newButton })
			);
			await user.type(screen.getByLabelText(resource.nameLabel), "New item");
			await user.click(
				screen.getByRole("button", { name: resource.createButton })
			);
			await waitFor(() =>
				expect(state.error).toHaveBeenCalledWith(
					failure instanceof Error && failure.message.trim()
						? "Name already exists"
						: resource.createError
				)
			);
			expect(screen.getByLabelText(resource.nameLabel)).toHaveValue("New item");
			expect(
				screen.getByRole("button", { name: resource.createButton })
			).toBeEnabled();
		});

		it.each([
			false,
			true,
		])("edits an existing row and preserves input on failure=$0", async (failure) => {
			if (failure) {
				state.update.mockRejectedValue({ unexpected: true });
			}
			const user = userEvent.setup();
			render(<resource.Page />);
			const row = within(screen.getByRole("table"))
				.getByText("Unused", { selector: "[data-slot=badge]" })
				.closest("tr");
			if (!row) {
				throw new Error("Expected item row");
			}
			await user.click(within(row).getByRole("button"));
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			const input = screen.getByLabelText(resource.nameLabel);
			await user.clear(input);
			expect(
				screen.getByRole("button", { name: "Save Changes" })
			).toBeDisabled();
			fireEvent.submit(input.closest("form") ?? input);
			expect(state.update).not.toHaveBeenCalled();
			await user.type(input, "  Renamed  ");
			if (resource.label === "types") {
				fireEvent.change(screen.getByLabelText("Color"), {
					target: { value: "#ef4444" },
				});
			}
			await user.click(screen.getByRole("button", { name: "Save Changes" }));
			await waitFor(() =>
				expect(state.update).toHaveBeenCalledWith(
					expect.objectContaining({
						[resource.idKey]: "second",
						name: "Renamed",
					})
				)
			);
			if (failure) {
				expect(state.error).toHaveBeenCalledWith(resource.editError);
				expect(input).toHaveValue("  Renamed  ");
				await user.keyboard("{Escape}");
			} else {
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			}
		});

		it.each([
			false,
			true,
		])("deletes the intended row and handles failure=$0", async (failure) => {
			if (failure) {
				state.remove.mockRejectedValue({ unexpected: true });
			}
			const user = userEvent.setup();
			render(<resource.Page />);
			const row = within(screen.getByRole("table"))
				.getByText("Travel")
				.closest("tr");
			if (!row) {
				throw new Error("Expected item row");
			}
			await user.click(within(row).getByRole("button"));
			await user.click(screen.getByRole("menuitem", { name: "Delete" }));
			if (resource.label === "types") {
				expect(screen.getByRole("alertdialog")).toHaveTextContent(
					"used by 1 category"
				);
				await user.click(
					within(screen.getByRole("alertdialog")).getByRole("button", {
						name: "Delete",
					})
				);
			}
			await waitFor(() =>
				expect(state.remove).toHaveBeenCalledWith({ [resource.idKey]: "first" })
			);
			if (failure) {
				expect(state.error).toHaveBeenCalledWith(resource.deleteError);
			} else {
				expect(state.success).toHaveBeenCalled();
			}
		});
	});
}
