import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Account Types",
});

export default function AccountTypesLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
