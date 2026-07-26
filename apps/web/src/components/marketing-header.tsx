"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

const menuItems = [
	{ name: "Home", href: "/" },
	{ name: "Features", href: "/features" },
	{ name: "Pricing", href: "/pricing" },
	{ name: "About", href: "/about" },
	{ name: "FAQs", href: "/faqs" },
] as const;

export function MarketingHeader() {
	const [menuState, setMenuState] = useState(false);

	useEffect(() => {
		if (!menuState) {
			return;
		}

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setMenuState(false);
			}
		};

		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [menuState]);

	return (
		<header>
			<nav
				className="fixed top-0 right-0 left-0 z-40 w-full border-b border-dashed bg-white/95 backdrop-blur dark:bg-zinc-950/80"
				data-state={menuState ? "active" : "inactive"}
			>
				<div className="m-auto max-w-5xl px-6">
					<div className="flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
						<div className="flex w-full items-center justify-between lg:w-auto">
							<Link
								aria-label="home"
								className="flex items-center space-x-2"
								href="/"
								onClick={() => setMenuState(false)}
							>
								<Logo />
							</Link>

							<div className="flex items-center gap-2 lg:hidden">
								<SignedOut>
									<Button asChild size="sm">
										<Link href={"/sign-up" as Route}>Get Started</Link>
									</Button>
								</SignedOut>

								<SignedIn>
									<Button asChild size="sm">
										<Link href={"/dashboard" as Route}>Go to Dashboard</Link>
									</Button>
								</SignedIn>

								<button
									aria-controls="marketing-navigation"
									aria-expanded={menuState}
									aria-label={menuState ? "Close Menu" : "Open Menu"}
									className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5"
									onClick={() => setMenuState((currentState) => !currentState)}
									type="button"
								>
									<Menu className="m-auto size-6 in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 duration-200" />
									<X className="absolute inset-0 m-auto size-6 -rotate-180 in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 scale-0 in-data-[state=active]:opacity-100 opacity-0 duration-200" />
								</button>
							</div>
						</div>

						<div
							className="mb-6 in-data-[state=active]:block hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border bg-background p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent"
							id="marketing-navigation"
						>
							<div className="lg:pr-4">
								<ul className="space-y-6 text-base lg:flex lg:gap-8 lg:space-y-0 lg:text-sm">
									{menuItems.map((item) => (
										<li key={item.href}>
											<Link
												className="block text-muted-foreground duration-150 hover:text-accent-foreground"
												href={item.href as Route}
												onClick={() => setMenuState(false)}
											>
												<span>{item.name}</span>
											</Link>
										</li>
									))}
								</ul>
							</div>

							<div className="flex w-full flex-col space-y-3 sm:flex-row sm:items-center sm:gap-3 sm:space-y-0 md:w-fit lg:border-l lg:pl-6">
								<SignedOut>
									<SignInButton mode="modal">
										<Button size="sm" variant="outline">
											Login
										</Button>
									</SignInButton>

									<Button asChild size="sm">
										<Link href={"/sign-up" as Route}>Get Started</Link>
									</Button>
								</SignedOut>

								<SignedIn>
									<div className="flex items-center justify-start gap-3 sm:justify-center">
										<Button asChild size="sm">
											<Link href={"/dashboard" as Route}>Go to Dashboard</Link>
										</Button>
										<ModeToggle />
										<div className="flex items-center">
											<UserButton />
										</div>
									</div>
								</SignedIn>
							</div>
						</div>
					</div>
				</div>
			</nav>
		</header>
	);
}
