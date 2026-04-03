import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "New Expense",
});

export default function NewExpenseLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
