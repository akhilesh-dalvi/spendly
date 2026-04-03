import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Create Cycle",
});

export default function OnboardingCycleLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
