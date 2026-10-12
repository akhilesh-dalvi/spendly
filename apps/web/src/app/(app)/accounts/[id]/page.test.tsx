// @vitest-environment jsdom

import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAccount } from "@/lib/accounts";
import AccountDetailPage from "./page";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	paginated: vi.fn(),
	archive: vi.fn(),
	setDefault: vi.fn(),
	update: vi.fn(),
	loadMore: vi.fn(),
	push: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	report: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	usePaginatedQuery: (...args: unknown[]) => mocks.paginated(...args),
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		({
			"accounts:archive": mocks.archive,
			"users:updateDefaultAccount": mocks.setDefault,
		})[getFunctionName(reference)] ?? mocks.update,
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: mocks.push }),
	useParams: () => ({ id: "account-1" }),
}));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

const account: ResolvedAccount = {
	_id: "account-1" as Id<"accounts">,
	_creationTime: 1,
	userId: "user-1" as Id<"users">,
	createdAt: 1,
	name: "Checking",
	accountTypeId: "type-bank" as Id<"account_types">,
	accountTypeName: "Bank",
	accountTypeBalanceNature: "asset",
	accountTypeColor: "#14B8A6",
	accountTypeIcon: "landmark",
	startingBalance: 80,
	currentBalance: 100,
	isArchived: false,
};
const accountTypes = [
	{
		_id: account.accountTypeId,
		name: "Bank",
		balanceNature: "asset",
		isArchived: false,
	},
];
const queryValues = (
	currentAccount = account,
	user: { currency?: string; defaultAccountId?: string } = {}
) => {
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0]) =>
			({
				"accounts:get": currentAccount,
				"accounts:list": [currentAccount],
				"users:get": user,
				"accountTypes:list": accountTypes,
				"accountTypes:getUsage": { accountCount: 1 },
			})[getFunctionName(reference)]
	);
};

beforeEach(() => {
	vi.clearAllMocks();
	queryValues();
	mocks.paginated.mockReturnValue({
		results: [],
		status: "Exhausted",
		loadMore: mocks.loadMore,
	});
	mocks.archive.mockResolvedValue(undefined);
	mocks.setDefault.mockResolvedValue(undefined);
	mocks.update.mockResolvedValue(undefined);
});

describe("AccountDetailPage", () => {
	it("waits for initial ledger and account loading, then displays an actionable empty activity state", () => {
		mocks.query.mockReturnValue(undefined);
		const { rerender } = render(<AccountDetailPage />);
		expect(
			screen.queryByRole("button", { name: "Make default" })
		).not.toBeInTheDocument();
		queryValues();
		mocks.paginated.mockReturnValue({
			results: [],
			status: "LoadingFirstPage",
			loadMore: mocks.loadMore,
		});
		rerender(<AccountDetailPage />);
		expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
		mocks.paginated.mockReturnValue({
			results: [],
			status: "Exhausted",
			loadMore: mocks.loadMore,
		});
		rerender(<AccountDetailPage />);
		expect(screen.getByText("No activity yet")).toBeVisible();
		expect(screen.getByLabelText("Account name")).toHaveValue("Checking");
		expect(
			screen.queryByRole("button", { name: "Load 50 more" })
		).not.toBeInTheDocument();
	});

	it("navigates back and edits through the real form without changing the immutable opening snapshot", async () => {
		const user = userEvent.setup();
		render(<AccountDetailPage />);
		await user.click(screen.getByRole("button", { name: "Back to accounts" }));
		expect(mocks.push).toHaveBeenCalledWith("/accounts");
		expect(screen.getByText("$80.00")).toBeVisible();
		expect(screen.getByText("$100.00")).toBeVisible();
		await user.clear(screen.getByLabelText("Account name"));
		await user.type(screen.getByLabelText("Account name"), "Everyday");
		await user.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Account updated")
		);
		expect(mocks.update).toHaveBeenCalledWith({
			accountId: account._id,
			accountTypeId: account.accountTypeId,
			name: "Everyday",
		});
	});

	it("sets the default account with a guarded pending state, then shows disabled default status from updated preferences", async () => {
		const user = userEvent.setup();
		let finish: () => void = () => undefined;
		mocks.setDefault.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finish = resolve;
			})
		);
		const { rerender } = render(<AccountDetailPage />);
		await user.click(screen.getByRole("button", { name: "Make default" }));
		expect(mocks.setDefault).toHaveBeenCalledWith({ accountId: account._id });
		expect(screen.getByRole("button", { name: "Make default" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
		finish();
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith(
				"Checking is now your default account"
			)
		);
		queryValues(account, { defaultAccountId: account._id });
		rerender(<AccountDetailPage />);
		expect(
			screen.getByRole("button", { name: "Default account" })
		).toBeDisabled();
		expect(screen.getByText("Default", { exact: true })).toBeVisible();
	});

	it("reports a failed default update and re-enables actions without changing the displayed preference", async () => {
		const user = userEvent.setup();
		const error = new Error("offline");
		mocks.setDefault.mockRejectedValueOnce(error);
		render(<AccountDetailPage />);
		await user.click(screen.getByRole("button", { name: "Make default" }));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				"Failed to update the default account"
			)
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "accounts",
			operation: "set-default",
		});
		expect(screen.getByRole("button", { name: "Make default" })).toBeEnabled();
	});

	it("requires archive confirmation and supports cancellation without a mutation", async () => {
		const user = userEvent.setup();
		render(<AccountDetailPage />);
		await user.click(screen.getByRole("button", { name: "Archive" }));
		expect(
			screen.getByRole("alertdialog", { name: "Archive Checking?" })
		).toBeVisible();
		expect(
			screen.getByText(
				"The account will be hidden from new expenses and transfers. Existing history and balances will remain available."
			)
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.archive).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(screen.getByRole("button", { name: "Archive account" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Account archived")
		);
		expect(mocks.archive).toHaveBeenCalledWith({
			accountId: account._id,
			isArchived: true,
		});
	});

	it("reports archive failures with the operation boundary and allows another attempt", async () => {
		const user = userEvent.setup();
		const error = new Error("offline");
		mocks.archive.mockRejectedValueOnce(error);
		render(<AccountDetailPage />);
		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(screen.getByRole("button", { name: "Archive account" }));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to archive account")
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "accounts",
			operation: "archive",
		});
		expect(screen.getByRole("button", { name: "Archive" })).toBeEnabled();
	});

	it.each([
		false,
		true,
	])("reactivates archived liability accounts and handles failure=%s", async (failure) => {
		const user = userEvent.setup();
		queryValues({
			...account,
			isArchived: true,
			currency: "INR",
			accountTypeBalanceNature: "liability",
			accountTypeColor: null,
			revision: 2,
			lastModifiedSource: "web",
		});
		const error = new Error("offline");
		if (failure) {
			mocks.archive.mockRejectedValueOnce(error);
		}
		render(<AccountDetailPage />);
		expect(screen.getByText("Bank · Money owed · INR")).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Make default" })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Transfer" })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Reactivate" }));
		expect(mocks.archive).toHaveBeenCalledWith({
			accountId: account._id,
			isArchived: false,
		});
		if (failure) {
			await waitFor(() =>
				expect(mocks.error).toHaveBeenCalledWith("Failed to reactivate account")
			);
			expect(mocks.report).toHaveBeenCalledWith(error, {
				feature: "accounts",
				operation: "reactivate",
			});
		} else {
			await waitFor(() =>
				expect(mocks.success).toHaveBeenCalledWith("Account reactivated")
			);
		}
		expect(screen.getByRole("button", { name: "Reactivate" })).toBeEnabled();
	});

	it("renders signed transaction amounts, note fallback, dates and requests another 50 ledger entries", async () => {
		const user = userEvent.setup();
		queryValues(account, { currency: "USD" });
		const results = [
			{
				_id: "opening",
				type: "opening_balance",
				amount: 80,
				balanceAfter: 80,
				date: "2026-01-01",
			},
			{
				_id: "expense",
				type: "expense",
				amount: -10,
				balanceAfter: 70,
				date: "2026-01-02",
				note: "Groceries",
			},
		];
		mocks.paginated.mockReturnValue({
			results,
			status: "CanLoadMore",
			loadMore: mocks.loadMore,
		});
		const { rerender } = render(<AccountDetailPage />);
		expect(screen.getByText("Opening balance", { exact: true })).toBeVisible();
		expect(screen.getByText("Opening balance · Jan 1, 2026")).toBeVisible();
		expect(screen.getByText("Groceries")).toBeVisible();
		expect(screen.getByText("Expense · Jan 2, 2026")).toBeVisible();
		expect(screen.getByText("+$80.00")).toBeVisible();
		expect(screen.getByText("-$10.00")).toBeVisible();
		expect(screen.getByText("$70.00 balance")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Load 50 more" }));
		expect(mocks.loadMore).toHaveBeenCalledWith(50);
		expect(mocks.paginated).toHaveBeenCalledWith(
			expect.anything(),
			{ accountId: account._id },
			{ initialNumItems: 50 }
		);
		mocks.paginated.mockReturnValue({
			results,
			status: "LoadingMore",
			loadMore: mocks.loadMore,
		});
		rerender(<AccountDetailPage />);
		expect(screen.getByRole("button", { name: "Load 50 more" })).toBeDisabled();
	});
});
