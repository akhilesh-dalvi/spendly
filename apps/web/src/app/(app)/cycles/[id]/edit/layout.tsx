import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Edit Cycle",
});

export default function EditCycleLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
