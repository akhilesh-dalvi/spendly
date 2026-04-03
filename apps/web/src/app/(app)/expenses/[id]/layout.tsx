import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Expense Details",
});

export default function ExpenseDetailsLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
