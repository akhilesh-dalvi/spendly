"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader } from "./loader";

const PENDING_PLAN_SETUP_KEY = "spendly:pending-plan-setup";

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { isSignedIn, isLoaded } = useAuth();
	const cycles = useQuery(api.cycles.list);
	const isOnboardingCategoriesRoute =
		pathname === "/onboarding/categories" ||
		pathname.startsWith("/onboarding/categories/");

	useEffect(() => {
		const hasPendingPlanSetup =
			typeof window !== "undefined" &&
			window.sessionStorage.getItem(PENDING_PLAN_SETUP_KEY) === "true";

		// If Clerk has loaded and the user is not signed in, redirect to sign-in page
		if (isLoaded && !isSignedIn) {
			router.push("/sign-in" as Route);
			return;
		}

		// If Clerk has loaded, the user is signed in, and we've loaded the cycles
		// and there are none, and we're not already on the onboarding pages
		if (
			isLoaded &&
			isSignedIn &&
			cycles !== undefined &&
			cycles.length === 0 &&
			!pathname.startsWith("/onboarding")
		) {
			router.push("/onboarding/start" as Route);
			return;
		}

		// If user has cycles, prevent them from accessing onboarding pages
		if (
			isLoaded &&
			isSignedIn &&
			cycles !== undefined &&
			cycles.length > 0 &&
			pathname.startsWith("/onboarding") &&
			!isOnboardingCategoriesRoute &&
			!(pathname === "/onboarding/cycle" && hasPendingPlanSetup)
		) {
			router.push("/dashboard" as Route);
			return;
		}
	}, [
		cycles,
		isLoaded,
		isOnboardingCategoriesRoute,
		isSignedIn,
		pathname,
		router,
	]);

	// Show loader while Clerk is loading or cycles are loading
	if (!isLoaded || cycles === undefined) {
		return (
			<div className="flex h-screen w-full items-center justify-center">
				<Loader />
			</div>
		);
	}

	return <>{children}</>;
}
