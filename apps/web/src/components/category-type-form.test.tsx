// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryTypeForm } from "./category-type-form";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	error: vi.fn(),
	success: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.create }));
vi.mock("sonner", () => ({
	toast: { error: mocks.error, success: mocks.success },
}));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.create.mockResolvedValue({ _id: "type-needs" });
});

describe("CategoryTypeForm", () => {
	it("rejects empty submissions and creates a suggested type with its matching color", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		render(
			<CategoryTypeForm existingTypeNames={["Wants"]} onSuccess={onSuccess} />
		);
		expect(
			screen.queryByRole("button", { name: "Wants" })
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Add Category Type" })
		).toBeDisabled();
		const form = screen.getByLabelText("Type Name").closest("form");
		if (!form) {
			throw new Error("Missing category type form");
		}
		fireEvent.submit(form);
		expect(mocks.create).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Savings" }));
		expect(screen.getByLabelText("Type Name")).toHaveValue("Savings");
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("type-needs"));
		expect(mocks.create).toHaveBeenCalledWith({
			color: "#10b981",
			name: "Savings",
		});
		expect(mocks.success).toHaveBeenCalledWith("Category type added");
	});

	it("edits a custom name, selects a preset and hides suggestions when all names already exist", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<CategoryTypeForm
				existingTypeNames={[
					"Needs",
					"Wants",
					"Savings",
					"Fixed",
					"Variable",
					"Debt",
					"Investments",
					"Business",
				]}
			/>
		);
		expect(screen.queryByText("Suggestions")).not.toBeInTheDocument();
		await user.type(screen.getByLabelText("Type Name"), "Travel");
		// Preset swatches are currently unnamed; select the actual color control by its visual identity.
		const swatch = container.querySelector<HTMLButtonElement>(
			'button[style="background-color: rgb(239, 68, 68);"]'
		);
		if (!swatch) {
			throw new Error("Missing red preset");
		}
		await user.click(swatch);
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				color: "#ef4444",
				name: "Travel",
			})
		);
		expect(mocks.success).toHaveBeenCalledWith("Category type added");
	});

	it("opens the real custom color popover and previews the selected color in HEX and RGB", async () => {
		const user = userEvent.setup();
		const { container } = render(<CategoryTypeForm />);
		const trigger = container.querySelector<HTMLButtonElement>(
			'button[aria-haspopup="dialog"]'
		);
		if (!trigger) {
			throw new Error("Missing custom color trigger");
		}
		await user.click(trigger);
		expect(screen.getByDisplayValue("#3B82F6")).toBeVisible();
		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: "RGB" }));
		expect(screen.getByDisplayValue("59")).toBeVisible();
		expect(screen.getByDisplayValue("130")).toBeVisible();
		expect(screen.getByDisplayValue("246")).toBeVisible();
		await user.keyboard("{Escape}");
		expect(screen.queryByDisplayValue("246")).not.toBeInTheDocument();
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("holds the submit button disabled during a pending mutation and does not emit a missing result ID", async () => {
		const user = userEvent.setup();
		let finish: (value: null) => void = () => undefined;
		mocks.create.mockReturnValueOnce(
			new Promise<null>((resolve) => {
				finish = resolve;
			})
		);
		const onSuccess = vi.fn();
		render(<CategoryTypeForm onSuccess={onSuccess} />);
		await user.type(screen.getByLabelText("Type Name"), "Custom");
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
		finish(null);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Add Category Type" })
			).toBeEnabled()
		);
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it.each([
		[new Error("ConvexError: Type already exists"), "Type already exists"],
		["network down", "Failed to add category type"],
	])(
		"reports a mutation failure and preserves input for retry: %s",
		async (failure, expectedMessage) => {
			const user = userEvent.setup();
			mocks.create.mockRejectedValueOnce(failure);
			const onSuccess = vi.fn();
			render(<CategoryTypeForm onSuccess={onSuccess} />);
			await user.type(screen.getByLabelText("Type Name"), "Needs");
			await user.click(
				screen.getByRole("button", { name: "Add Category Type" })
			);
			await waitFor(() =>
				expect(mocks.error).toHaveBeenCalledWith(expectedMessage)
			);
			expect(onSuccess).not.toHaveBeenCalled();
			expect(screen.getByLabelText("Type Name")).toHaveValue("Needs");
			expect(
				screen.getByRole("button", { name: "Add Category Type" })
			).toBeEnabled();
			await user.click(
				screen.getByRole("button", { name: "Add Category Type" })
			);
			await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("type-needs"));
		}
	);
});
