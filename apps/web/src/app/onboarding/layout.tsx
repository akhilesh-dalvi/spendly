import type { Metadata } from "next";
import { OnboardingGuard } from "@/components/onboarding-guard";
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
		<OnboardingGuard>
			<div className="flex min-h-screen flex-col items-center justify-center p-4">
				<div className="w-full space-y-4">{children}</div>
			</div>
		</OnboardingGuard>
	);
}
