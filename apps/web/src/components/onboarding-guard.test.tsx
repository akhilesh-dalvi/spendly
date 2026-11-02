// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGuard } from "./onboarding-guard";

const state = vi.hoisted(() => ({
	auth: { isLoaded: true, isSignedIn: true },
	onboarding: undefined as unknown,
	pathname: "/dashboard",
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
	])(
		"keeps private content hidden while auth or setup is loading %#",
		(auth) => {
			state.auth = auth;
			render(
				<OnboardingGuard>
					<p>Private dashboard</p>
				</OnboardingGuard>
			);
			expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
			expect(state.replace).not.toHaveBeenCalled();
		}
	);

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
			cycle: null,
			destination: "/onboarding/start",
			path: null,
			pathname: "/dashboard",
			step: "start",
		},
		{
			cycle: null,
			destination: "/onboarding/cycle",
			path: "free",
			pathname: "/expenses",
			step: "cycle",
		},
		{
			cycle: null,
			destination: "/onboarding/start",
			path: null,
			pathname: "/onboarding/cycle",
			step: "start",
		},
		{
			cycle: null,
			destination: "/onboarding/start",
			path: null,
			pathname: "/onboarding/categories",
			step: "start",
		},
		{
			cycle: null,
			destination: "/onboarding/cycle",
			path: "plan",
			pathname: "/onboarding/categories",
			step: "cycle",
		},
		{
			cycle: { _id: "cycle" },
			destination: "/onboarding/cycle",
			path: "free",
			pathname: "/onboarding/categories",
			step: "account",
		},
		{
			cycle: null,
			destination: "/onboarding/start",
			path: null,
			pathname: "/onboarding/accounts",
			step: "start",
		},
		{
			cycle: null,
			destination: "/onboarding/cycle",
			path: "plan",
			pathname: "/onboarding/accounts",
			step: "cycle",
		},
		{
			cycle: { _id: "cycle" },
			destination: "/dashboard",
			path: "free",
			pathname: "/onboarding/start",
			step: "complete",
		},
	])(
		"redirects an invalid $pathname setup to $destination",
		({ pathname, path, cycle, step, destination }) => {
			state.pathname = pathname;
			state.onboarding = { cycle, path, step };
			render(
				<OnboardingGuard>
					<p>Setup</p>
				</OnboardingGuard>
			);
			expect(state.replace).toHaveBeenCalledWith(destination);
		}
	);

	it.each([
		{
			cycle: { _id: "cycle" },
			path: "free",
			pathname: "/dashboard",
			step: "account",
		},
		{ cycle: null, path: null, pathname: "/dashboard", step: "complete" },
		{ cycle: null, path: null, pathname: "/onboarding/start", step: "start" },
		{
			cycle: { _id: "cycle" },
			path: "plan",
			pathname: "/onboarding/categories",
			step: "categories",
		},
		{
			cycle: { _id: "cycle" },
			path: "free",
			pathname: "/onboarding/accounts",
			step: "complete",
		},
	])(
		"allows a valid $pathname setup through without a redirect %#",
		({ pathname, ...onboarding }) => {
			state.pathname = pathname;
			state.onboarding = onboarding;
			render(
				<OnboardingGuard>
					<p>Allowed content</p>
				</OnboardingGuard>
			);
			expect(screen.getByText("Allowed content")).toBeVisible();
			expect(state.replace).not.toHaveBeenCalled();
		}
	);
});
