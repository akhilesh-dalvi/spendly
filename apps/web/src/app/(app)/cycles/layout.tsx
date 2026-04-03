import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Cycles",
});

export default function CyclesLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
