// @vitest-environment jsdom

import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAccount } from "@/lib/accounts";
import AccountsPage from "./page";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	mutate: vi.fn(),
	push: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	useMutation: () => mocks.mutate,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const checking: ResolvedAccount = {
	_id: "checking" as Id<"accounts">,
	_creationTime: 1,
	userId: "user-1" as Id<"users">,
	createdAt: 1,
	name: "Checking",
	accountTypeId: "type-bank" as Id<"account_types">,
	accountTypeName: "Bank",
	accountTypeBalanceNature: "asset",
	accountTypeColor: "#14B8A6",
	accountTypeIcon: "landmark",
	startingBalance: 50,
	currentBalance: 100,
	isArchived: false,
};
const credit: ResolvedAccount = {
	...checking,
	_id: "credit" as Id<"accounts">,
	name: "Credit card",
	accountTypeBalanceNature: "liability",
	currentBalance: -20,
	currency: "USD",
	accountTypeColor: null,
	accountTypeIcon: null,
	revision: 2,
	lastModifiedSource: "web",
};
const euro: ResolvedAccount = {
	...checking,
	_id: "euro" as Id<"accounts">,
	name: "Euro wallet",
	currency: "EUR",
	currentBalance: 30,
};
const archived: ResolvedAccount = {
	...checking,
	_id: "old" as Id<"accounts">,
	name: "Old cash",
	currentBalance: 500,
	isArchived: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0]) =>
			getFunctionName(reference) === "accounts:list"
				? [checking, credit, euro, archived]
				: { defaultAccountId: checking._id }
	);
});

describe("AccountsPage", () => {
	it("waits for both account data and user settings before exposing balances", () => {
		mocks.query.mockReturnValue(undefined);
		const { rerender } = render(<AccountsPage />);
		expect(screen.queryByText("Current balance")).not.toBeInTheDocument();
		mocks.query.mockImplementation(
			(reference: Parameters<typeof getFunctionName>[0]) =>
				getFunctionName(reference) === "accounts:list" ? [checking] : undefined
		);
		rerender(<AccountsPage />);
		expect(
			screen.queryByRole("heading", { name: "Accounts" })
		).not.toBeInTheDocument();
	});

	it("separates currencies and excludes archived balances from totals while retaining history links", async () => {
		const user = userEvent.setup();
		render(<AccountsPage />);
		expect(screen.getByRole("heading", { name: "$80.00" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "€30.00" })).toBeVisible();
		expect(screen.getByText("Across 3 accounts")).toBeVisible();
		expect(screen.getByText("Default")).toBeVisible();
		expect(screen.getByText("Money owed", { exact: false })).toBeVisible();
		expect(screen.getByRole("link", { name: "Add account" })).toHaveAttribute(
			"href",
			"/accounts/new"
		);
		expect(
			screen.getByRole("link", { name: "Back to dashboard" })
		).toHaveAttribute("href", "/dashboard");
		const archivedSection = screen
			.getByRole("heading", { name: "Archived" })
			.closest("section");
		if (!archivedSection) {
			throw new Error("Missing archived accounts section");
		}
		expect(within(archivedSection).getByText("$500.00")).toBeVisible();
		expect(
			within(archivedSection).getByRole("link", { name: "View" })
		).toHaveAttribute("href", "/accounts/old");
		expect(
			within(archivedSection).queryByRole("button")
		).not.toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: "Actions for Checking" })
		);
		await user.click(screen.getByRole("menuitem", { name: "Adjust balance" }));
		expect(screen.getByLabelText("Actual balance (USD)")).toHaveValue(100);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.mutate).not.toHaveBeenCalled();
	});

	it("offers an actionable empty state, no stale archived section and an unset default", () => {
		mocks.query.mockImplementation(
			(reference: Parameters<typeof getFunctionName>[0]) =>
				getFunctionName(reference) === "accounts:list"
					? []
					: { currency: "INR" }
		);
		render(<AccountsPage />);
		expect(screen.getByText("No accounts yet")).toBeVisible();
		expect(
			screen.getByRole("link", { name: "Create your first account" })
		).toHaveAttribute("href", "/accounts/new");
		expect(screen.getByText("Not set")).toBeVisible();
		expect(
			screen.queryByRole("heading", { name: "Archived" })
		).not.toBeInTheDocument();
	});
});
