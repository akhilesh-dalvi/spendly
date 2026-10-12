// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewAccountPage from "./page";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	create: vi.fn(),
	push: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	report: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	useMutation: () => mocks.create,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

const types = [
	{ _id: "type-cash", name: "Cash", balanceNature: "asset", isArchived: false },
];
beforeEach(() => {
	vi.clearAllMocks();
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0]) =>
			getFunctionName(reference) === "users:get" ? { currency: "INR" } : types
	);
	mocks.create.mockResolvedValue({ _id: "new-account" });
});

describe("NewAccountPage", () => {
	it("waits for user preferences before offering a form and supports navigating back", async () => {
		const user = userEvent.setup();
		mocks.query.mockReturnValue(undefined);
		render(<NewAccountPage />);
		expect(screen.getByRole("heading", { name: "New account" })).toBeVisible();
		expect(screen.queryByLabelText("Account name")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to accounts" }));
		expect(mocks.push).toHaveBeenCalledWith("/accounts");
	});

	it("creates with the user's currency and navigates to the returned account only after saving", async () => {
		const user = userEvent.setup();
		render(<NewAccountPage />);
		expect(screen.getByLabelText("Opening balance (INR)")).toBeVisible();
		await user.type(screen.getByLabelText("Account name"), "Travel cash");
		await user.clear(screen.getByLabelText("Opening balance (INR)"));
		await user.type(screen.getByLabelText("Opening balance (INR)"), "500");
		await user.click(screen.getByRole("button", { name: "Create account" }));
		await waitFor(() =>
			expect(mocks.push).toHaveBeenCalledWith("/accounts/new-account")
		);
		expect(mocks.create).toHaveBeenCalledWith({
			accountTypeId: "type-cash",
			name: "Travel cash",
			startingBalance: 500,
		});
	});

	it("falls back to USD and stays on the form after a failed create", async () => {
		const user = userEvent.setup();
		mocks.query.mockImplementation(
			(reference: Parameters<typeof getFunctionName>[0]) =>
				getFunctionName(reference) === "users:get" ? {} : types
		);
		mocks.create.mockRejectedValueOnce(new Error("offline"));
		render(<NewAccountPage />);
		expect(screen.getByLabelText("Opening balance (USD)")).toBeVisible();
		await user.type(screen.getByLabelText("Account name"), "Cash");
		await user.click(screen.getByRole("button", { name: "Create account" }));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to create account")
		);
		expect(mocks.push).not.toHaveBeenCalled();
		expect(screen.getByLabelText("Account name")).toHaveValue("Cash");
	});
});
