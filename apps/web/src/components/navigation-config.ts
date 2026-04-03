import {
	ArrowLeftRight,
	Calendar,
	CreditCard,
	LayoutDashboard,
	type LucideIcon,
	Settings,
} from "lucide-react";

export type NavMatchMode = "exact" | "prefix";

export interface NavSubItem {
	title: string;
	url: string;
	match: NavMatchMode;
}

export interface NavItem {
	title: string;
	url: string;
	icon: LucideIcon;
	match: NavMatchMode;
	items?: readonly NavSubItem[];
}

export const SETTINGS_SUB_ITEMS = [
	{
		title: "Profile",
		url: "/settings",
		match: "exact",
	},
	{
		title: "Category Types",
		url: "/settings/data/types",
		match: "prefix",
	},
	{
		title: "Tags",
		url: "/settings/data/tags",
		match: "prefix",
	},
] as const satisfies readonly NavSubItem[];

export const PRIMARY_NAV_ITEMS = [
	{
		title: "Dashboard",
		url: "/dashboard",
		icon: LayoutDashboard,
		match: "exact",
	},
	{
		title: "Expenses",
		url: "/expenses",
		icon: CreditCard,
		match: "prefix",
	},
	{
		title: "Cycles",
		url: "/cycles",
		icon: Calendar,
		match: "prefix",
	},
	{
		title: "Compare",
		url: "/compare",
		icon: ArrowLeftRight,
		match: "exact",
	},
	{
		title: "Settings",
		url: "/settings",
		icon: Settings,
		match: "exact",
		items: SETTINGS_SUB_ITEMS,
	},
] as const satisfies readonly NavItem[];

const normalizePathname = (pathname: string): string => {
	if (pathname.length > 1 && pathname.endsWith("/")) {
		return pathname.slice(0, -1);
	}

	return pathname;
};

const matchesPath = (
	pathname: string,
	url: string,
	match: NavMatchMode
): boolean => {
	const normalizedPathname = normalizePathname(pathname);
	const normalizedUrl = normalizePathname(url);

	if (match === "exact") {
		return normalizedPathname === normalizedUrl;
	}

	return (
		normalizedPathname === normalizedUrl ||
		normalizedPathname.startsWith(`${normalizedUrl}/`)
	);
};

export const isSubNavItemActive = (
	pathname: string,
	subItem: NavSubItem
): boolean => {
	return matchesPath(pathname, subItem.url, subItem.match);
};

export const isNavItemActive = (pathname: string, item: NavItem): boolean => {
	if (matchesPath(pathname, item.url, item.match)) {
		return true;
	}

	if (!item.items?.length) {
		return false;
	}

	for (const subItem of item.items) {
		if (isSubNavItemActive(pathname, subItem)) {
			return true;
		}
	}

	return false;
};
