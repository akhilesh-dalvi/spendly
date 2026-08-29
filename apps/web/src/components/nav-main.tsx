"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export function NavMain({
	className,
	items,
	label,
}: {
	className?: string;
	items: readonly {
		readonly title: string;
		readonly url: string;
		readonly icon: LucideIcon;
		readonly isActive: boolean;
		readonly items?: readonly {
			readonly title: string;
			readonly url: string;
			readonly isActive: boolean;
		}[];
	}[];
	label?: string;
}) {
	return (
		<SidebarGroup className={className}>
			{label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
			<SidebarMenu>
				{items.map((item) => (
					<Collapsible asChild defaultOpen={item.isActive} key={item.title}>
						<SidebarMenuItem>
							<SidebarMenuButton
								asChild
								isActive={item.isActive}
								tooltip={item.title}
							>
								<Link
									aria-current={item.isActive ? "page" : undefined}
									href={item.url as Route}
								>
									<item.icon />
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
							{item.items?.length ? (
								<>
									<CollapsibleTrigger asChild>
										<SidebarMenuAction className="data-[state=open]:rotate-90">
											<ChevronRight />
											<span className="sr-only">Toggle</span>
										</SidebarMenuAction>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<SidebarMenuSub>
											{item.items?.map((subItem) => (
												<SidebarMenuSubItem key={subItem.title}>
													<SidebarMenuSubButton
														asChild
														isActive={subItem.isActive}
													>
														<Link
															aria-current={
																subItem.isActive ? "page" : undefined
															}
															href={subItem.url as Route}
														>
															<span>{subItem.title}</span>
														</Link>
													</SidebarMenuSubButton>
												</SidebarMenuSubItem>
											))}
										</SidebarMenuSub>
									</CollapsibleContent>
								</>
							) : null}
						</SidebarMenuItem>
					</Collapsible>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
