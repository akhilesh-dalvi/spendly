import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Expenses",
});

export default function ExpensesLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
