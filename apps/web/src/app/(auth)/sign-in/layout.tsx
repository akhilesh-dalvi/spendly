import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Sign In",
});

export default function SignInLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
