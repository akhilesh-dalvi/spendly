"use client";
import {
	SignedIn,
	SignedOut,
	SignInButton,
	SignUpButton,
	UserButton,
} from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeToggle } from "./mode-toggle";

const APP_ROUTES = [
	"/dashboard",
	"/expenses",
	"/cycles",
	"/compare",
	"/data",
	"/settings",
	"/onboarding",
];

export function Header() {
	const pathname = usePathname();
	const isAppRoute = APP_ROUTES.some((route) => pathname.startsWith(route));

	return (
		<header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background px-4">
			<div className="flex items-center gap-2">
				{isAppRoute && (
					<>
						<SidebarTrigger />
						<Separator className="mr-2 h-4" orientation="vertical" />
					</>
				)}
				<div className="flex items-center gap-2 md:hidden">
					<span className="text-pretty font-bold @3xl:text-5xl text-3xl text-foreground leading-tight tracking-tight">
						Spendly
					</span>
				</div>
			</div>
			<div className="hidden md:block" />
			<div className="flex items-center gap-2">
				<SignedOut>
					<div className="flex items-center gap-2">
						<SignInButton mode="modal">
							<button
								className="font-medium text-sm transition-colors hover:text-primary"
								type="button"
							>
								Sign In
							</button>
						</SignInButton>
						<SignUpButton mode="modal">
							<button
								className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
								type="button"
							>
								Sign Up
							</button>
						</SignUpButton>
					</div>
				</SignedOut>
				<SignedIn>
					<UserButton />
				</SignedIn>
				<ModeToggle />
			</div>
		</header>
	);
}
