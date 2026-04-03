import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Choose Categories",
});

export default function OnboardingCategoriesLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
