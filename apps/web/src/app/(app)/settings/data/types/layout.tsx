import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Category Types",
});

export default function CategoryTypesLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
