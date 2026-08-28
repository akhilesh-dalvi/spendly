import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingGuard } from "@/components/onboarding-guard";
import { OnboardingShell } from "@/components/onboarding-shell";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
	robots: noIndexRobots,
};

export default function OnboardingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<OnboardingGuard>
				<OnboardingShell>{children}</OnboardingShell>
			</OnboardingGuard>
		</Suspense>
	);
}
