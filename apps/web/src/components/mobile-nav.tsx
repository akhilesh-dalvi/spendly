"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
	isNavItemActive,
	MOBILE_MORE_NAV_ITEMS,
	MOBILE_PRIMARY_NAV_ITEMS,
} from "@/components/navigation-config";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function MobileNav() {
	const pathname = usePathname();
	const isMoreActive = MOBILE_MORE_NAV_ITEMS.some((item) =>
		isNavItemActive(pathname, item)
	);

	return (
		<nav className="fixed right-0 bottom-0 left-0 z-50 border-t bg-background px-4 pb-safe md:hidden">
			<ul className="flex h-16 items-center justify-around">
				{MOBILE_PRIMARY_NAV_ITEMS.map((item) => {
					const isActive = isNavItemActive(pathname, item);
					return (
						<li className="h-full flex-1" key={item.title}>
							<Link
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"flex h-full flex-col items-center justify-center gap-1 font-medium text-[10px] transition-colors",
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
				<li className="h-full flex-1">
					<DropdownMenu>
						<DropdownMenuTrigger
							aria-current={isMoreActive ? "page" : undefined}
							className={cn(
								"flex h-full w-full flex-col items-center justify-center gap-1 rounded-md font-medium text-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
								isMoreActive
									? "text-primary"
									: "text-muted-foreground hover:text-foreground"
							)}
						>
							<Ellipsis aria-hidden="true" className="h-6 w-6" />
							More
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="min-w-52"
							side="top"
							sideOffset={12}
						>
							{MOBILE_MORE_NAV_ITEMS.map((item) => {
								const isActive = isNavItemActive(pathname, item);

								return (
									<DropdownMenuItem asChild key={item.title}>
										<Link
											aria-current={isActive ? "page" : undefined}
											className={cn(isActive && "text-primary")}
											href={item.url}
										>
											<item.icon aria-hidden="true" />
											{item.title}
										</Link>
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</li>
			</ul>
		</nav>
	);
}
