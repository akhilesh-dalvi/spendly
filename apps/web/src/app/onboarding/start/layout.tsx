import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Get Started",
});

export default function OnboardingStartLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
