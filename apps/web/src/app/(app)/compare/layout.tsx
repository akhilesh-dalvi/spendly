import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Compare",
});

export default function CompareLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
