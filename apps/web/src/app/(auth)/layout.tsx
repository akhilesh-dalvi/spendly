import type { Metadata } from "next";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
	robots: noIndexRobots,
};

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-screen items-center justify-center">{children}</div>
	);
}
