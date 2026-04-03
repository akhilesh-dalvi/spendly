import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "New Cycle",
});

export default function NewCycleLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
