import type { Metadata } from "next";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
	description: "Optionally add the account you use most often.",
	robots: noIndexRobots,
	title: "Add an account | Spendly",
};

export default function AccountsOnboardingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return children;
}
