import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "New Category",
});

export default function NewCategoryLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
