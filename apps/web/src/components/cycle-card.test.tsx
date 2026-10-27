// @vitest-environment jsdom

import { api } from "@spendly/backend/convex/_generated/api";
import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import {
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CycleCard } from "./cycle-card";

const mocks = vi.hoisted(() => ({
	queries: new Map<string, unknown>(),
	query: vi.fn(),
}));
vi.mock("convex/react", async () => {
	const { getFunctionName: name } = await import("convex/server");
	return {
		useQuery: (ref: FunctionReference<"query">, args?: unknown) => {
			mocks.query(name(ref), args);
			return args === "skip" ? undefined : mocks.queries.get(name(ref));
		},
	};
});
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
const userId = "user" as Id<"users">;
const cycle: Doc<"expense_cycles"> = {
	_creationTime: 0,
	_id: "july" as Id<"expense_cycles">,
	createdAt: 0,
	endDate: "2026-08-01",
	name: "July budget",
	startDate: "2026-07-01",
	userId,
};
function fixture<T extends FunctionReference<"query">>(
	ref: T,
	value: FunctionReturnType<T> | undefined
) {
	mocks.queries.set(getFunctionName(ref), value);
}
function summary(totalSpent: number, totalPlanned: number) {
	fixture(api.aggregations.getCycleSummary, {
		categoryStats: [],
		cycleId: cycle._id,
		cycleName: cycle.name,
		daysRemaining: 10,
		endDate: cycle.endDate,
		remaining: totalPlanned - totalSpent,
		startDate: cycle.startDate,
		totalPlanned,
		totalSpent,
		typeStats: [],
	});
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.queries.clear();
	fixture(api.users.get, {
		_creationTime: 0,
		_id: userId,
		clerkId: "clerk",
		createdAt: 0,
		currency: "USD",
		email: "test@example.com",
	});
	summary(25, 100);
});

describe("CycleCard", () => {
	it("links to the cycle and displays date range, spending, budget and history status", () => {
		const { container } = render(<CycleCard cycle={cycle} />);
		expect(screen.getByRole("link")).toHaveAttribute("href", "/cycles/july");
		expect(
			screen.getByRole("heading", { name: "July budget" })
		).toBeInTheDocument();
		expect(screen.getByText("Jul 1 – Aug 1, 2026")).toBeInTheDocument();
		expect(screen.getByText("History")).toBeInTheDocument();
		expect(screen.getByText("$25.00")).toBeInTheDocument();
		expect(screen.getByText("$100.00")).toBeInTheDocument();
		expect(
			container.querySelector('[style="width: 25%;"]')
		).toBeInTheDocument();
		expect(mocks.query).toHaveBeenCalledWith(
			getFunctionName(api.aggregations.getCycleSummary),
			{ cycleId: cycle._id }
		);
	});

	it.each(["current", "upcoming"] as const)("labels a %s cycle", (status) => {
		render(<CycleCard compact cycle={cycle} status={status} />);
		expect(
			screen.getByText(status === "current" ? "Active" : "Upcoming")
		).toBeInTheDocument();
	});

	it("marks the featured cycle active and caps overspending progress at 100%", () => {
		summary(120, 100);
		const { container } = render(<CycleCard cycle={cycle} variant="current" />);
		expect(screen.getByText("Active")).toBeInTheDocument();
		const progress = container.querySelector('[style="width: 100%;"]');
		expect(progress).toHaveClass("bg-destructive");
		expect(screen.getByText("$120.00")).toBeInTheDocument();
	});

	it("displays placeholders while the summary is loading, even with budget-only enabled", () => {
		fixture(api.aggregations.getCycleSummary, undefined);
		render(<CycleCard cycle={cycle} requireBudget />);
		expect(screen.getAllByText("—")).toHaveLength(2);
		expect(screen.getByRole("link")).toBeInTheDocument();
	});

	it("hides a confirmed zero-budget cycle only when budget-only is requested", () => {
		summary(10, 0);
		const view = render(<CycleCard cycle={cycle} requireBudget />);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		view.rerender(<CycleCard cycle={cycle} />);
		expect(screen.getByText("$0.00")).toBeInTheDocument();
		expect(
			view.container.querySelector('[style^="width:"]')
		).not.toBeInTheDocument();
	});

	it("can hide progress without hiding financial totals", () => {
		const { container } = render(
			<CycleCard cycle={cycle} showProgress={false} />
		);
		expect(screen.getByText("$100.00")).toBeInTheDocument();
		expect(
			container.querySelector('[style^="width:"]')
		).not.toBeInTheDocument();
	});
});
