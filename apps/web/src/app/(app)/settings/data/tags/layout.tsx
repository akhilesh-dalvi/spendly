import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Tags",
});

export default function TagsLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
