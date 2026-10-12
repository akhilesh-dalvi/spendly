// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountBalanceOverview } from "./account-balance-overview";
import { DashboardAccountsSummary } from "./dashboard-accounts-summary";
import { DashboardSummary } from "./dashboard-summary";

const service = vi.hoisted(() => ({ currency: "USD" }));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("convex/react", () => ({
	useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
		getFunctionName(ref) === "users:get"
			? { currency: service.currency }
			: undefined,
	useMutation: () => vi.fn(),
}));

beforeEach(() => {
	vi.setSystemTime(new Date("2026-06-15T12:00:00"));
	service.currency = "USD";
});
afterEach(() => vi.useRealTimers());

const emptyAccounts = { accounts: [], totals: [] };
const activeSummary = {
	totalSpent: 25,
	totalPlanned: 100,
	startDate: "2026-06-01",
	endDate: "2026-06-30",
	daysRemaining: 15,
};

describe("dashboard budget and tracked funds", () => {
	it("shows the remaining active budget, utilization and separately denominated balances", () => {
		service.currency = "INR";
		render(
			<DashboardSummary
				accountSummary={{
					accounts: [
						{ name: "Bank", accountTypeName: "Checking", isDefault: true },
						{ name: "Credit", accountTypeName: "Liability", isDefault: false },
					],
					totals: [
						{ currency: "USD", total: 1250 },
						{ currency: "INR", total: -500 },
					],
				}}
				summary={activeSummary}
			/>
		);
		const budget = screen.getByRole("region", { name: "Budget left" });
		expect(budget).toHaveTextContent("₹75.00");
		expect(budget).toHaveTextContent("₹25.00 spent of ₹100.00 planned");
		expect(budget).toHaveTextContent("25% spent");
		expect(budget).toHaveTextContent("Active");
		expect(budget).toHaveTextContent("15 days left");
		expect(
			screen.getByRole("progressbar", { name: "Budget spent" })
		).toHaveAttribute("aria-valuenow", "25");
		expect(
			screen.getByRole("progressbar", { name: "Budget spent" })
				.firstElementChild
		).toHaveStyle({ transform: "translateX(-75%)" });
		const funds = screen.getByRole("region", { name: "Tracked funds" });
		expect(funds).toHaveTextContent("$1,250.00");
		expect(funds).toHaveTextContent("-₹500.00");
		expect(funds).toHaveTextContent("Across 2 accounts");
		expect(funds).toHaveTextContent("Bank · Checking");
		expect(funds).toHaveTextContent("Balances stay separate2 currencies");
	});

	it.each([
		{
			label: "Over budget",
			spent: 150,
			planned: 100,
			value: "$50.00",
			progress: "100",
			percentage: "150% spent",
		},
		{
			label: "Over budget",
			spent: 20,
			planned: 0,
			value: "$20.00",
			progress: "100",
			percentage: null,
		},
		{
			label: "No budget planned",
			spent: 0,
			planned: 0,
			value: "—",
			progress: "0",
			percentage: null,
		},
	])("explains $label with spent=$spent and planned=$planned", ({
		label,
		spent,
		planned,
		value,
		progress,
		percentage,
	}) => {
		render(
			<DashboardSummary
				accountSummary={emptyAccounts}
				summary={{
					...activeSummary,
					totalSpent: spent,
					totalPlanned: planned,
					daysRemaining: null,
				}}
			/>
		);
		const budget = screen.getByRole("region", { name: label });
		expect(budget).toHaveTextContent(value);
		expect(budget).toHaveTextContent("0 days left");
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			progress
		);
		expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({
			transform: `translateX(-${100 - Number(progress)}%)`,
		});
		if (percentage) {
			expect(budget).toHaveTextContent(percentage);
		} else {
			expect(budget).not.toHaveTextContent("% spent");
		}
		expect(
			screen.getByRole("region", { name: "Tracked funds" })
		).toHaveTextContent("Across 0 accounts");
		expect(screen.getByText("No default")).toBeVisible();
	});

	it.each([
		{
			startDate: "2026-06-16",
			endDate: "2026-06-30",
			status: "Upcoming",
			detail: "Starts in 1 day",
			label: "Planned budget",
			value: "$100.00",
			daysRemaining: 14,
		},
		{
			startDate: "2026-06-18",
			endDate: "2026-06-30",
			status: "Upcoming",
			detail: "Starts in 3 days",
			label: "Planned budget",
			value: "$100.00",
			daysRemaining: 12,
		},
		{
			startDate: "2026-05-01",
			endDate: "2026-05-31",
			status: "Ended",
			detail: "Past cycle",
			label: "Unspent budget",
			value: "$75.00",
			daysRemaining: null,
		},
		{
			startDate: "2026-06-01",
			endDate: "2026-06-30",
			status: "Active",
			detail: "1 day left",
			label: "Budget left",
			value: "$75.00",
			daysRemaining: 1,
		},
		{
			startDate: "2026-06-01",
			endDate: "2026-06-30",
			status: "Active",
			detail: "0 days left",
			label: "Budget left",
			value: "$75.00",
			daysRemaining: -2,
		},
	])("distinguishes $status cycles: $detail", ({
		status,
		detail,
		label,
		value,
		...dates
	}) => {
		render(
			<DashboardSummary
				accountSummary={{
					accounts: [
						{ name: "Cash", accountTypeName: "Cash", isDefault: false },
					],
					totals: [{ currency: "USD", total: 0 }],
				}}
				summary={{ ...activeSummary, ...dates }}
			/>
		);
		expect(screen.getByRole("region", { name: label })).toHaveTextContent(
			value
		);
		expect(screen.getByText(status)).toBeVisible();
		expect(screen.getByText(detail)).toBeVisible();
		expect(screen.getByText("Across 1 account")).toBeVisible();
		expect(
			screen.queryByText("Balances stay separate")
		).not.toBeInTheDocument();
	});
});

describe("account-only dashboard", () => {
	it("shows the default account and multiple currencies without a cycle", () => {
		render(
			<DashboardAccountsSummary
				summary={{
					accounts: [
						{ name: "Travel", accountTypeName: "Wallet", isDefault: false },
						{ name: "Daily", accountTypeName: "Bank", isDefault: true },
					],
					totals: [
						{ currency: "USD", total: 200 },
						{ currency: "EUR", total: -40 },
					],
				}}
			/>
		);
		expect(screen.getByRole("heading", { name: "Daily" })).toBeVisible();
		expect(screen.getByText("Bank")).toBeVisible();
		expect(screen.getByRole("heading", { name: "$200.00" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "-€40.00" })).toBeVisible();
		expect(screen.getByText("Across 2 accounts")).toBeVisible();
		expect(
			screen.queryByText("Make every expense update a balance")
		).not.toBeInTheDocument();
	});

	it("offers account setup for an empty summary without inventing a default or balance", () => {
		render(
			<DashboardAccountsSummary showAccountOnboarding summary={emptyAccounts} />
		);
		expect(screen.getByRole("heading", { name: "Not set" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "—" })).toBeVisible();
		expect(screen.getByText("Across 0 accounts")).toBeVisible();
		expect(screen.getByRole("link", { name: "Add account" })).toHaveAttribute(
			"href",
			"/accounts/new"
		);
	});

	it("supports a single active account even when no default type is supplied", () => {
		const { container } = render(
			<AccountBalanceOverview
				activeAccountCount={1}
				defaultAccountName="Cash"
				totals={[{ currency: "USD", total: 15 }]}
			/>
		);
		expect(screen.getByText("Across 1 account")).toBeVisible();
		expect(screen.getByRole("heading", { name: "Cash" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "$15.00" })).toBeVisible();
		expect(within(container).queryByText("USD")).not.toBeInTheDocument();
	});
});
