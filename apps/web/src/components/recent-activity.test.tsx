// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { render, screen, within } from "@testing-library/react";
import {
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecentActivity } from "./recent-activity";

const AGENT_EXPENSE_LABEL = /Lunch agent/;

const mocks = vi.hoisted(() => ({ queries: new Map<string, unknown>() }));
vi.mock("convex/react", async () => {
	const { getFunctionName: name } = await import("convex/server");
	return {
		useQuery: (ref: FunctionReference<"query">, args?: unknown) =>
			args === "skip" ? undefined : mocks.queries.get(name(ref)),
	};
});
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
function fixture<T extends FunctionReference<"query">>(
	ref: T,
	value: FunctionReturnType<T>
) {
	mocks.queries.set(getFunctionName(ref), value);
}
type Expense = ComponentProps<typeof RecentActivity>["expenses"][number];
function expense(
	id: string,
	date: string,
	values: Partial<Expense> = {}
): Expense {
	return {
		_id: id,
		date,
		amount: 25,
		categoryId: "food",
		categoryName: "Food",
		spentOn: `Lunch ${id}`,
		...values,
	};
}
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	// Friday: Sunday is this week but is neither today nor yesterday.
	vi.setSystemTime(new Date(2026, 6, 10, 12));
	fixture(api.users.get, {
		_id: "user" as Id<"users">,
		_creationTime: 0,
		clerkId: "clerk",
		email: "test@example.com",
		createdAt: 0,
		currency: "USD",
	});
});
afterEach(() => vi.useRealTimers());

describe("RecentActivity", () => {
	it("offers a first-expense action and no history link when empty", () => {
		render(<RecentActivity expenses={[]} />);
		expect(screen.getByText("No transactions")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Add Expense" })).toHaveAttribute(
			"href",
			"/expenses/new"
		);
		expect(
			screen.queryByRole("link", { name: "View full history" })
		).not.toBeInTheDocument();
	});

	it("groups adjacent transactions into today, yesterday, this week and historical dates", () => {
		render(
			<RecentActivity
				expenses={[
					expense("today-1", "2026-07-10"),
					expense("today-2", "2026-07-10"),
					expense("yesterday", "2026-07-09"),
					expense("week", "2026-07-05"),
					expense("older", "2026-06-15"),
				]}
			/>
		);
		expect(
			screen.getAllByRole("heading").map((heading) => heading.textContent)
		).toEqual(["Today", "Yesterday", "This Week", "Jun 15, 2026"]);
		expect(screen.getAllByRole("list")).toHaveLength(4);
		expect(
			within(screen.getAllByRole("list")[0]).getAllByRole("listitem")
		).toHaveLength(2);
		expect(
			screen
				.getAllByRole("link")
				.slice(0, 5)
				.map((link) => link.getAttribute("href"))
		).toEqual([
			"/expenses/today-1",
			"/expenses/today-2",
			"/expenses/yesterday",
			"/expenses/week",
			"/expenses/older",
		]);
		expect(
			screen.getByRole("link", { name: "View full history" })
		).toHaveAttribute("href", "/expenses");
	});

	it("shows category/account details, descriptions, source attribution and formatted amounts", () => {
		render(
			<RecentActivity
				expenses={[
					expense("agent", "2026-07-10", {
						amount: 12.5,
						categoryIcon: "🍲",
						categoryTypeColor: "#123456",
						accountName: "Credit card",
						accountTypeName: "Credit",
						accountTypeIcon: "wallet",
						accountTypeColor: "#123456",
						revision: 2,
						createdSource: "web",
						lastModifiedSource: "cli_agent",
					}),
					expense("cli", "2026-07-09", {
						createdSource: "cli",
						accountName: "Cash",
					}),
				]}
			/>
		);
		expect(screen.getByText("$12.50")).toBeInTheDocument();
		expect(screen.getByText("Credit card · Credit")).toBeInTheDocument();
		expect(screen.getByText("Cash")).toBeInTheDocument();
		expect(
			screen.getByRole("img", {
				name: "Last edited by an AI agent via Spendly CLI",
			})
		).toBeInTheDocument();
		expect(
			screen.getByRole("img", { name: "Added via Spendly CLI" })
		).toBeInTheDocument();
		expect(screen.getByText("🍲")).toBeInTheDocument();
		const row = screen.getByRole("link", { name: AGENT_EXPENSE_LABEL });
		const time = row.querySelector("time");
		expect(time).toHaveAttribute("datetime", "2026-07-10");
		expect(time).toHaveAttribute(
			"title",
			expect.stringContaining("Jul 10, 2026")
		);
		expect(time?.textContent).toContain("ago");
	});

	it("provides honest fallbacks for missing description, category icon and account", () => {
		render(
			<RecentActivity
				expenses={[
					expense("uncategorized", "2026-07-10", {
						categoryId: null,
						categoryName: null,
						spentOn: null,
						createdSource: "web",
					}),
					expense("fallback-icon", "2026-07-09", {
						categoryIcon: null,
						spentOn: "",
					}),
				]}
			/>
		);
		expect(screen.getAllByText("No description")).toHaveLength(2);
		expect(screen.getByText("Uncategorized")).toBeInTheDocument();
		expect(screen.getByText("❓")).toBeInTheDocument();
		expect(screen.getByText("📦")).toBeInTheDocument();
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});
});
