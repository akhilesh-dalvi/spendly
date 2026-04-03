import type { Metadata } from "next";
import { createAppMetadata } from "@/lib/seo";

export const metadata: Metadata = createAppMetadata({
	title: "Sign Up",
});

export default function SignUpLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
