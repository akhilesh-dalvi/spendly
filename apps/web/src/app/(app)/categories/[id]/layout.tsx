import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Category Details",
});

export default function CategoryDetailsLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
