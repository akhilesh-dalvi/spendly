"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
	isNavItemActive,
	PRIMARY_NAV_ITEMS,
} from "@/components/navigation-config";
import { cn } from "@/lib/utils";

export function MobileNav() {
	const pathname = usePathname();

	return (
		<nav className="fixed right-0 bottom-0 left-0 z-50 border-t bg-background px-4 pb-safe md:hidden">
			<ul className="flex h-16 items-center justify-around">
				{PRIMARY_NAV_ITEMS.map((item) => {
					const isActive = isNavItemActive(pathname, item);
					return (
						<li className="flex-1" key={item.title}>
							<Link
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"flex flex-col items-center gap-1 font-medium text-[10px] transition-colors",
									isActive
										? "text-primary"
										: "text-muted-foreground hover:text-foreground"
								)}
								href={item.url}
							>
								<item.icon
									aria-hidden="true"
									className={cn(
										"h-6 w-6",
										isActive ? "text-primary" : "text-muted-foreground"
									)}
								/>
								{item.title}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
