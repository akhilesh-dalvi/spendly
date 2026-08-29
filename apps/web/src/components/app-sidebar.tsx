"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
	CORE_NAV_ITEMS,
	isNavItemActive,
	isSubNavItemActive,
	MANAGEMENT_NAV_ITEMS,
	type NavItem,
	type NavSubItem,
	SETTINGS_NAV_ITEM,
} from "@/components/navigation-config";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Logo } from "./logo";

const addActiveState = (pathname: string, items: readonly NavItem[]) => {
	return items.map((item: NavItem) => ({
		...item,
		isActive: isNavItemActive(pathname, item),
		items: item.items?.map((subItem: NavSubItem) => ({
			...subItem,
			isActive: isSubNavItemActive(pathname, subItem),
		})),
	}));
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const convexUser = useQuery(api.users.get);
	const { user: clerkUser } = useUser();
	const pathname = usePathname();

	const user = useMemo(() => {
		return {
			name: convexUser?.name ?? clerkUser?.fullName ?? "User",
			email:
				convexUser?.email ?? clerkUser?.primaryEmailAddress?.emailAddress ?? "",
			avatar: clerkUser?.imageUrl ?? "",
		};
	}, [convexUser, clerkUser]);

	const navigation = useMemo(() => {
		return {
			core: addActiveState(pathname, CORE_NAV_ITEMS),
			management: addActiveState(pathname, MANAGEMENT_NAV_ITEMS),
			settings: addActiveState(pathname, [SETTINGS_NAV_ITEM]),
		};
	}, [pathname]);

	return (
		<Sidebar variant="inset" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild size="lg">
							<Link href="/dashboard">
								<div className="flex flex-1 items-center gap-2 text-left leading-tight">
									<Logo />
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={navigation.core} />
				<NavMain items={navigation.management} label="Manage" />
			</SidebarContent>
			<SidebarFooter>
				<NavMain className="p-0" items={navigation.settings} />
				<NavUser user={user} />
			</SidebarFooter>
		</Sidebar>
	);
}
