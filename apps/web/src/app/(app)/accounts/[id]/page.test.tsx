// @vitest-environment jsdom

import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAccount } from "@/lib/accounts";
import AccountDetailPage from "./page";

const mocks = vi.hoisted(() => ({
	archive: vi.fn(),
	error: vi.fn(),
	loadMore: vi.fn(),
	paginated: vi.fn(),
	push: vi.fn(),
	query: vi.fn(),
	report: vi.fn(),
	setDefault: vi.fn(),
	success: vi.fn(),
	update: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		({
			"accounts:archive": mocks.archive,
			"users:updateDefaultAccount": mocks.setDefault,
		})[getFunctionName(reference)] ?? mocks.update,
	usePaginatedQuery: (...args: unknown[]) => mocks.paginated(...args),
	useQuery: (...args: unknown[]) => mocks.query(...args),
}));
vi.mock("next/navigation", () => ({
	useParams: () => ({ id: "account-1" }),
	useRouter: () => ({ push: mocks.push }),
}));
vi.mock("sonner", () => ({
	toast: { error: mocks.error, success: mocks.success },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

const account: ResolvedAccount = {
	_creationTime: 1,
	_id: "account-1" as Id<"accounts">,
	accountTypeBalanceNature: "asset",
	accountTypeColor: "#14B8A6",
	accountTypeIcon: "landmark",
	accountTypeId: "type-bank" as Id<"account_types">,
	accountTypeName: "Bank",
	createdAt: 1,
	currentBalance: 100,
	isArchived: false,
	name: "Checking",
	startingBalance: 80,
	userId: "user-1" as Id<"users">,
};
const accountTypes = [
	{
		_id: account.accountTypeId,
		balanceNature: "asset",
		isArchived: false,
		name: "Bank",
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
				"accountTypes:getUsage": { accountCount: 1 },
				"accountTypes:list": accountTypes,
				"users:get": user,
			})[getFunctionName(reference)]
	);
};

beforeEach(() => {
	vi.clearAllMocks();
	queryValues();
	mocks.paginated.mockReturnValue({
		loadMore: mocks.loadMore,
		results: [],
		status: "Exhausted",
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
			loadMore: mocks.loadMore,
			results: [],
			status: "LoadingFirstPage",
		});
		rerender(<AccountDetailPage />);
		expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
		mocks.paginated.mockReturnValue({
			loadMore: mocks.loadMore,
			results: [],
			status: "Exhausted",
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

	it.each([false, true])(
		"reactivates archived liability accounts and handles failure=%s",
		async (failure) => {
			const user = userEvent.setup();
			queryValues({
				...account,
				accountTypeBalanceNature: "liability",
				accountTypeColor: null,
				currency: "INR",
				isArchived: true,
				lastModifiedSource: "web",
				revision: 2,
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
					expect(mocks.error).toHaveBeenCalledWith(
						"Failed to reactivate account"
					)
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
		}
	);

	it("renders signed transaction amounts, note fallback, dates and requests another 50 ledger entries", async () => {
		const user = userEvent.setup();
		queryValues(account, { currency: "USD" });
		const results = [
			{
				_id: "opening",
				amount: 80,
				balanceAfter: 80,
				date: "2026-01-01",
				type: "opening_balance",
			},
			{
				_id: "expense",
				amount: -10,
				balanceAfter: 70,
				date: "2026-01-02",
				note: "Groceries",
				type: "expense",
			},
		];
		mocks.paginated.mockReturnValue({
			loadMore: mocks.loadMore,
			results,
			status: "CanLoadMore",
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
			loadMore: mocks.loadMore,
			results,
			status: "LoadingMore",
		});
		rerender(<AccountDetailPage />);
		expect(screen.getByRole("button", { name: "Load 50 more" })).toBeDisabled();
	});
});
