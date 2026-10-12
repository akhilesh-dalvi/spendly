// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGuard } from "./onboarding-guard";

const state = vi.hoisted(() => ({
	auth: { isLoaded: true, isSignedIn: true },
	pathname: "/dashboard",
	onboarding: undefined as unknown,
	replace: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => state.auth }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(() => state.onboarding) }));
vi.mock("next/navigation", () => ({
	usePathname: () => state.pathname,
	useRouter: () => ({ replace: state.replace }),
}));

beforeEach(() => {
	state.auth = { isLoaded: true, isSignedIn: true };
	state.pathname = "/dashboard";
	state.onboarding = undefined;
	vi.clearAllMocks();
});

describe("onboarding access guard", () => {
	it.each([
		{ isLoaded: false, isSignedIn: false },
		{ isLoaded: true, isSignedIn: true },
	])("keeps private content hidden while auth or setup is loading %#", (auth) => {
		state.auth = auth;
		render(
			<OnboardingGuard>
				<p>Private dashboard</p>
			</OnboardingGuard>
		);
		expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
		expect(state.replace).not.toHaveBeenCalled();
	});

	it("redirects signed-out visitors and skips private queries", () => {
		state.auth.isSignedIn = false;
		render(
			<OnboardingGuard>
				<p>Private dashboard</p>
			</OnboardingGuard>
		);
		expect(state.replace).toHaveBeenCalledWith("/sign-in");
		expect(useQuery).toHaveBeenCalledWith(expect.anything(), "skip");
		expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
	});

	it.each([
		{
			pathname: "/dashboard",
			path: null,
			cycle: null,
			step: "start",
			destination: "/onboarding/start",
		},
		{
			pathname: "/expenses",
			path: "free",
			cycle: null,
			step: "cycle",
			destination: "/onboarding/cycle",
		},
		{
			pathname: "/onboarding/cycle",
			path: null,
			cycle: null,
			step: "start",
			destination: "/onboarding/start",
		},
		{
			pathname: "/onboarding/categories",
			path: null,
			cycle: null,
			step: "start",
			destination: "/onboarding/start",
		},
		{
			pathname: "/onboarding/categories",
			path: "plan",
			cycle: null,
			step: "cycle",
			destination: "/onboarding/cycle",
		},
		{
			pathname: "/onboarding/categories",
			path: "free",
			cycle: { _id: "cycle" },
			step: "account",
			destination: "/onboarding/cycle",
		},
		{
			pathname: "/onboarding/accounts",
			path: null,
			cycle: null,
			step: "start",
			destination: "/onboarding/start",
		},
		{
			pathname: "/onboarding/accounts",
			path: "plan",
			cycle: null,
			step: "cycle",
			destination: "/onboarding/cycle",
		},
		{
			pathname: "/onboarding/start",
			path: "free",
			cycle: { _id: "cycle" },
			step: "complete",
			destination: "/dashboard",
		},
	])("redirects an invalid $pathname setup to $destination", ({
		pathname,
		path,
		cycle,
		step,
		destination,
	}) => {
		state.pathname = pathname;
		state.onboarding = { path, cycle, step };
		render(
			<OnboardingGuard>
				<p>Setup</p>
			</OnboardingGuard>
		);
		expect(state.replace).toHaveBeenCalledWith(destination);
	});

	it.each([
		{
			pathname: "/dashboard",
			path: "free",
			cycle: { _id: "cycle" },
			step: "account",
		},
		{ pathname: "/dashboard", path: null, cycle: null, step: "complete" },
		{ pathname: "/onboarding/start", path: null, cycle: null, step: "start" },
		{
			pathname: "/onboarding/categories",
			path: "plan",
			cycle: { _id: "cycle" },
			step: "categories",
		},
		{
			pathname: "/onboarding/accounts",
			path: "free",
			cycle: { _id: "cycle" },
			step: "complete",
		},
	])("allows a valid $pathname setup through without a redirect %#", ({
		pathname,
		...onboarding
	}) => {
		state.pathname = pathname;
		state.onboarding = onboarding;
		render(
			<OnboardingGuard>
				<p>Allowed content</p>
			</OnboardingGuard>
		);
		expect(screen.getByText("Allowed content")).toBeVisible();
		expect(state.replace).not.toHaveBeenCalled();
	});
});
