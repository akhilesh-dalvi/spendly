import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Accounts",
});

export default function AccountsLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return children;
}
