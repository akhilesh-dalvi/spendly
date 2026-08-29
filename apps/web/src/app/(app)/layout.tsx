import { UserButton } from "@clerk/nextjs";
import { Separator } from "@radix-ui/react-separator";
import type { Metadata } from "next";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { ModeToggle } from "@/components/mode-toggle";
import { OnboardingGuard } from "@/components/onboarding-guard";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { noIndexRobots } from "@/lib/seo";

export const metadata: Metadata = {
	robots: noIndexRobots,
};

export default function AppLayout({
	children,
	modal,
}: {
	children: React.ReactNode;
	modal: React.ReactNode;
}) {
	return (
		<OnboardingGuard>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset>
					<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
						<SidebarTrigger className="-ml-1" />
						<Separator className="mr-2 h-4" orientation="vertical" />
						<div className="ml-auto flex items-center gap-2">
							<UserButton />
							<ModeToggle />
						</div>
					</header>
					<div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 pt-3 pb-24 md:pb-3">
						{children}
						{modal}
					</div>
				</SidebarInset>
				<MobileNav />
			</SidebarProvider>
		</OnboardingGuard>
	);
}
