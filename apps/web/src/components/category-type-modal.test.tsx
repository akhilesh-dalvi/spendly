// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryTypeModal } from "./category-type-modal";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.create }));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));

function ControlledModal({
	onSuccess,
	onOpenChange,
}: {
	onSuccess: (id: string) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<CategoryTypeModal
			existingTypeNames={["Needs"]}
			onOpenChange={(nextOpen) => {
				onOpenChange(nextOpen);
				setOpen(nextOpen);
			}}
			onSuccess={onSuccess}
			open={open}
			trigger={<button type="button">New type</button>}
		/>
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.create.mockResolvedValue({ _id: "type-business" });
});

describe("CategoryTypeModal", () => {
	it("opens from an uncontrolled trigger, creates through the real form and closes after success", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		render(
			<CategoryTypeModal
				onSuccess={onSuccess}
				trigger={<button type="button">New type</button>}
			/>
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "New type" }));
		expect(
			screen.getByRole("dialog", { name: "Add Category Type" })
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Business" }));
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(mocks.create).toHaveBeenCalledWith({
			name: "Business",
			color: "#14b8a6",
		});
		expect(onSuccess).toHaveBeenCalledWith("type-business");
	});

	it("propagates controlled opening and successful closing and forwards existing names", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const onSuccess = vi.fn();
		render(
			<ControlledModal onOpenChange={onOpenChange} onSuccess={onSuccess} />
		);
		await user.click(screen.getByRole("button", { name: "New type" }));
		expect(onOpenChange).toHaveBeenCalledWith(true);
		expect(
			screen.queryByRole("button", { name: "Needs" })
		).not.toBeInTheDocument();
		await user.type(screen.getByLabelText("Type Name"), "Travel");
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		await waitFor(() =>
			expect(onSuccess).toHaveBeenCalledWith("type-business")
		);
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("cancels via Escape without a write, and a failed save keeps the uncontrolled modal open", async () => {
		const user = userEvent.setup();
		mocks.create.mockRejectedValueOnce(new Error("offline"));
		render(
			<CategoryTypeModal trigger={<button type="button">New type</button>} />
		);
		await user.click(screen.getByRole("button", { name: "New type" }));
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(mocks.create).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "New type" }));
		await user.type(screen.getByLabelText("Type Name"), "Travel");
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("offline"));
		expect(screen.getByRole("dialog")).toBeVisible();
	});

	it("supports externally opened triggerless dialogs, with optional callbacks omitted", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<CategoryTypeModal open />);
		await user.type(screen.getByLabelText("Type Name"), "Travel");
		await user.click(screen.getByRole("button", { name: "Add Category Type" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Category type added")
		);
		// A controlled parent owns closure even when no onOpenChange is supplied.
		expect(screen.getByRole("dialog")).toBeVisible();
		rerender(<CategoryTypeModal open={false} />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
