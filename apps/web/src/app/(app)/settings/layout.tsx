import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Settings",
});

export default function SettingsLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
