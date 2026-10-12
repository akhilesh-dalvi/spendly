// @vitest-environment jsdom

import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAccount } from "@/lib/accounts";
import { AccountActionDialogs } from "./account-actions";

const mocks = vi.hoisted(() => ({
	adjust: vi.fn(),
	transfer: vi.fn(),
	push: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	report: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		getFunctionName(reference) === "accounts:updateBalance"
			? mocks.adjust
			: mocks.transfer,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error, info: mocks.info },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

const source: ResolvedAccount = {
	_id: "checking" as Id<"accounts">,
	_creationTime: 1,
	userId: "user-1" as Id<"users">,
	createdAt: 1,
	name: "Checking",
	accountTypeId: "type-1" as Id<"account_types">,
	accountTypeName: "Bank",
	accountTypeBalanceNature: "asset",
	accountTypeColor: null,
	accountTypeIcon: "landmark",
	startingBalance: 100,
	currentBalance: 100,
	isArchived: false,
};
const savings: ResolvedAccount = {
	...source,
	_id: "savings" as Id<"accounts">,
	name: "Savings",
	currentBalance: 40,
	currency: "USD",
	accountTypeColor: "#14B8A6",
	accountTypeIcon: null,
};
const otherCurrency: ResolvedAccount = {
	...savings,
	_id: "euro" as Id<"accounts">,
	name: "Euro wallet",
	currency: "EUR",
};
const archived: ResolvedAccount = {
	...savings,
	_id: "old" as Id<"accounts">,
	name: "Old savings",
	isArchived: true,
};
const accounts = [source, savings, otherCurrency, archived];
const CURRENT_BALANCE = /Current Spendly balance/;
const RESULTING_BALANCE = /The resulting balance will be/;
const INELIGIBLE_DESTINATIONS = /Checking|Euro wallet|Old savings/;
const renderActions = (
	account = source,
	presentation: "buttons" | "menu" = "buttons",
	candidates = accounts
) =>
	render(
		<AccountActionDialogs
			account={account}
			accounts={candidates}
			defaultCurrency="USD"
			presentation={presentation}
		/>
	);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.adjust.mockResolvedValue(undefined);
	mocks.transfer.mockResolvedValue(undefined);
});

describe("AccountActionDialogs", () => {
	it("does not expose money-changing actions on archived accounts", () => {
		renderActions(archived);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(mocks.adjust).not.toHaveBeenCalled();
		expect(mocks.transfer).not.toHaveBeenCalled();
	});

	it("opens the real dropdown, cancels adjustments and transfers without mutations", async () => {
		const user = userEvent.setup();
		renderActions(source, "menu");
		await user.click(
			screen.getByRole("button", { name: "Actions for Checking" })
		);
		await user.click(screen.getByRole("menuitem", { name: "Adjust balance" }));
		expect(
			screen.getByRole("dialog", { name: "Adjust Checking" })
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: "Actions for Checking" })
		);
		await user.click(screen.getByRole("menuitem", { name: "Transfer" }));
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(mocks.adjust).not.toHaveBeenCalled();
		expect(mocks.transfer).not.toHaveBeenCalled();
	});

	it("validates an empty balance, shows projected adjustments and records negative balances with trimmed notes", async () => {
		const user = userEvent.setup();
		renderActions();
		await user.click(screen.getByRole("button", { name: "Adjust balance" }));
		const balance = screen.getByLabelText("Actual balance (USD)");
		expect(balance).toHaveValue(100);
		await user.clear(balance);
		await user.click(screen.getByRole("button", { name: "Update balance" }));
		expect(screen.getByText("Enter a valid account balance.")).toBeVisible();
		expect(balance).toHaveAttribute("aria-invalid", "true");
		expect(mocks.adjust).not.toHaveBeenCalled();
		await user.type(balance, "150");
		expect(screen.getByText(CURRENT_BALANCE)).toHaveTextContent(
			"Adjustment +$50.00"
		);
		await user.clear(balance);
		await user.type(balance, "-20.25");
		expect(
			screen.getByText("This account will have a negative balance")
		).toBeVisible();
		expect(screen.getByText(RESULTING_BALANCE)).toHaveTextContent("-$20.25");
		fireEvent.change(screen.getByLabelText("Date"), {
			target: { value: "2026-03-04" },
		});
		await user.type(screen.getByLabelText("Note"), "  Bank correction  ");
		await user.click(screen.getByRole("button", { name: "Update balance" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(mocks.adjust).toHaveBeenCalledWith({
			accountId: source._id,
			date: "2026-03-04",
			newBalance: -20.25,
			note: "Bank correction",
		});
		expect(mocks.success).toHaveBeenCalledWith("Balance updated", {
			description: "Checking now matches -$20.25.",
		});
	});

	it("closes unchanged balances with an informational toast instead of a ledger write", async () => {
		const user = userEvent.setup();
		renderActions();
		await user.click(screen.getByRole("button", { name: "Adjust balance" }));
		await user.click(screen.getByRole("button", { name: "Update balance" }));
		expect(mocks.info).toHaveBeenCalledWith(
			"The account balance already matches"
		);
		expect(mocks.adjust).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("disables adjustment actions while pending and recovers after an actionable failure", async () => {
		const user = userEvent.setup();
		let reject: (error: Error) => void = () => undefined;
		mocks.adjust.mockReturnValueOnce(
			new Promise((_, rejectPromise) => {
				reject = rejectPromise;
			})
		);
		renderActions();
		await user.click(screen.getByRole("button", { name: "Adjust balance" }));
		await user.clear(screen.getByLabelText("Actual balance (USD)"));
		await user.type(screen.getByLabelText("Actual balance (USD)"), "0");
		await user.click(screen.getByRole("button", { name: "Update balance" }));
		expect(mocks.adjust).toHaveBeenCalledWith(
			expect.objectContaining({ newBalance: 0, note: undefined })
		);
		expect(
			screen.getByRole("button", { name: "Update balance" })
		).toBeDisabled();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		const error = new Error("ACCOUNT_ARCHIVED");
		reject(error);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				"This account is archived. Reactivate it before changing its balance."
			)
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "accounts",
			operation: "adjust-balance",
		});
		expect(
			screen.getByRole("button", { name: "Update balance" })
		).toBeEnabled();
		expect(screen.getByRole("dialog")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Update balance" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
	});

	it("requires a positive amount and eligible destination, warns about overdrafts and records a transfer", async () => {
		const user = userEvent.setup();
		renderActions();
		await user.click(screen.getByRole("button", { name: "Transfer" }));
		await user.click(screen.getByRole("button", { name: "Record transfer" }));
		expect(
			screen.getByText("Enter an amount greater than zero.")
		).toBeVisible();
		expect(screen.getByText("Choose a destination account.")).toBeVisible();
		expect(mocks.transfer).not.toHaveBeenCalled();
		await user.click(screen.getByLabelText("Destination account"));
		expect(screen.getAllByRole("option")).toHaveLength(1);
		expect(
			screen.getByRole("option", { name: "Savings · Bank · $40.00" })
		).toBeVisible();
		expect(
			screen.queryByRole("option", { name: INELIGIBLE_DESTINATIONS })
		).not.toBeInTheDocument();
		await user.click(
			screen.getByRole("option", { name: "Savings · Bank · $40.00" })
		);
		expect(
			screen.queryByText("Choose a destination account.")
		).not.toBeInTheDocument();
		await user.type(screen.getByLabelText("Amount (USD)"), "125.50");
		expect(
			screen.queryByText("Enter an amount greater than zero.")
		).not.toBeInTheDocument();
		expect(screen.getByText(RESULTING_BALANCE)).toHaveTextContent("-$25.50");
		fireEvent.change(screen.getByLabelText("Date"), {
			target: { value: "2026-02-05" },
		});
		await user.type(screen.getByLabelText("Note"), "  Emergency fund  ");
		await user.click(screen.getByRole("button", { name: "Record transfer" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(mocks.transfer).toHaveBeenCalledWith({
			amount: 125.5,
			date: "2026-02-05",
			fromAccountId: source._id,
			toAccountId: savings._id,
			note: "Emergency fund",
		});
		expect(mocks.success).toHaveBeenCalledWith(
			"Transfer recorded",
			expect.objectContaining({
				description: "$125.50 moved from Checking to Savings (Bank).",
				action: { label: "View Savings", onClick: expect.any(Function) },
			})
		);
		const toastOptions = mocks.success.mock.calls[0][1] as {
			action: { onClick: () => void };
		};
		toastOptions.action.onClick();
		expect(mocks.push).toHaveBeenCalledWith("/accounts/savings");
	});

	it("explains unavailable destinations and disables transfer when currencies differ or accounts are archived", async () => {
		const user = userEvent.setup();
		renderActions({ ...source, currency: "EUR" }, "buttons", [
			source,
			savings,
			archived,
		]);
		await user.click(screen.getByRole("button", { name: "Transfer" }));
		expect(
			screen.getByText("Create another active EUR account before transferring.")
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Record transfer" })
		).toBeDisabled();
		expect(screen.getByLabelText("Amount (EUR)")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.transfer).not.toHaveBeenCalled();
	});

	it("disables transfer actions while pending, omits blank notes and preserves fields after failure", async () => {
		const user = userEvent.setup();
		let reject: (error: Error) => void = () => undefined;
		mocks.transfer.mockReturnValueOnce(
			new Promise((_, rejectPromise) => {
				reject = rejectPromise;
			})
		);
		renderActions();
		await user.click(screen.getByRole("button", { name: "Transfer" }));
		await user.click(screen.getByLabelText("Destination account"));
		await user.click(
			screen.getByRole("option", { name: "Savings · Bank · $40.00" })
		);
		await user.type(screen.getByLabelText("Amount (USD)"), "10");
		await user.click(screen.getByRole("button", { name: "Record transfer" }));
		expect(mocks.transfer).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 10, note: undefined })
		);
		expect(
			screen.getByRole("button", { name: "Record transfer" })
		).toBeDisabled();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		const error = new Error("offline");
		reject(error);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to record the transfer")
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "accounts",
			operation: "transfer",
		});
		expect(
			screen.getByRole("button", { name: "Record transfer" })
		).toBeEnabled();
		expect(screen.getByLabelText("Amount (USD)")).toHaveValue(10);
		await user.click(screen.getByRole("button", { name: "Record transfer" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
	});
});
