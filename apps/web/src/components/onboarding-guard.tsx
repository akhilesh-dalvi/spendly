"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader } from "./loader";

interface GuardOnboardingState {
	cycle: { _id: string } | null;
	path: "free" | "plan" | null;
	step: "start" | "cycle" | "categories" | "account" | "complete";
}

const getMissingSetupRedirect = (
	pathname: string,
	state: GuardOnboardingState
): Route | null => {
	if (pathname === "/onboarding/cycle" && !state.path) {
		return "/onboarding/start";
	}
	if (
		pathname === "/onboarding/categories" &&
		!(state.path === "plan" && state.cycle)
	) {
		return state.path ? "/onboarding/cycle" : "/onboarding/start";
	}
	if (pathname === "/onboarding/accounts" && !state.cycle) {
		return state.path ? "/onboarding/cycle" : "/onboarding/start";
	}
	return null;
};

const getOnboardingRedirect = (
	pathname: string,
	state: GuardOnboardingState
): Route | null => {
	const isOnboardingRoute = pathname.startsWith("/onboarding");
	if (!(isOnboardingRoute || state.cycle) && state.step !== "complete") {
		return state.path ? "/onboarding/cycle" : "/onboarding/start";
	}
	if (!isOnboardingRoute) {
		return null;
	}
	if (state.step === "complete" && pathname !== "/onboarding/accounts") {
		return "/dashboard";
	}
	return getMissingSetupRedirect(pathname, state);
};

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { isSignedIn, isLoaded } = useAuth();
	const onboardingState = useQuery(
		api.users.getOnboardingState,
		isSignedIn ? {} : "skip"
	);

	useEffect(() => {
		if (isLoaded && !isSignedIn) {
			router.replace("/sign-in" as Route);
			return;
		}
		if (!(isLoaded && isSignedIn && onboardingState)) {
			return;
		}

		const destination = getOnboardingRedirect(pathname, onboardingState);
		if (destination) {
			router.replace(destination);
		}
	}, [isLoaded, isSignedIn, onboardingState, pathname, router]);

	if (!isLoaded || onboardingState == null) {
		return (
			<div className="flex min-h-screen w-full items-center justify-center">
				<Loader />
			</div>
		);
	}

	return <>{children}</>;
}
