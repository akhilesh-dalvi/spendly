import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Cycle Details",
});

export default function CycleDetailsLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
