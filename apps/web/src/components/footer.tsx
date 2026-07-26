import { SignedIn, SignedOut } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";

const links = [
	{
		title: "Home",
		href: "/",
	},
	{
		title: "Features",
		href: "/features",
	},
	{
		title: "Pricing",
		href: "/pricing",
	},
	{
		title: "About",
		href: "/about",
	},
	{
		title: "FAQs",
		href: "/faqs",
	},
	{
		title: "Terms",
		href: "/terms",
	},
];

export default function FooterSection() {
	return (
		<footer className="border-b bg-background py-12">
			<div className="mx-auto max-w-5xl px-6">
				<div className="flex flex-wrap items-center justify-between gap-6">
					<div className="order-last flex flex-col gap-1 text-center md:order-first md:text-left">
						<span className="font-semibold text-sm">Spendly</span>
						<span className="text-muted-foreground text-xs">
							A calmer way to track spending · © {new Date().getFullYear()}
						</span>
					</div>
					<div className="order-first flex flex-wrap justify-center gap-6 text-sm md:order-last">
						{links.map((link) => (
							<Link
								className="block text-muted-foreground duration-150 hover:text-primary"
								href={link.href as Route}
								key={link.href}
							>
								<span>{link.title}</span>
							</Link>
						))}
						<SignedOut>
							<Link
								className="block text-muted-foreground duration-150 hover:text-primary"
								href={"/sign-in" as Route}
							>
								<span>Sign In</span>
							</Link>
							<Link
								className="block text-muted-foreground duration-150 hover:text-primary"
								href={"/sign-up" as Route}
							>
								<span>Sign Up</span>
							</Link>
						</SignedOut>
						<SignedIn>
							<Link
								className="block text-muted-foreground duration-150 hover:text-primary"
								href={"/dashboard" as Route}
							>
								<span>Dashboard</span>
							</Link>
						</SignedIn>
					</div>
				</div>
			</div>
		</footer>
	);
}
