import {
	ArrowLeftRight,
	BookOpen,
	Calendar,
	CircleDollarSign,
	CreditCard,
	Layers,
	LayoutDashboard,
	type LucideIcon,
	Settings,
	Tag,
	WalletCards,
} from "lucide-react";

type NavMatchMode = "exact" | "prefix";

export interface NavSubItem {
	match: NavMatchMode;
	title: string;
	url: string;
}

export interface NavItem {
	icon: LucideIcon;
	items?: readonly NavSubItem[];
	match: NavMatchMode;
	title: string;
	url: string;
}

export const CORE_NAV_ITEMS = [
	{
		icon: LayoutDashboard,
		match: "exact",
		title: "Dashboard",
		url: "/dashboard",
	},
	{
		icon: CreditCard,
		match: "prefix",
		title: "Expenses",
		url: "/expenses",
	},
	{
		icon: Calendar,
		match: "prefix",
		title: "Cycles",
		url: "/cycles",
	},
	{
		icon: WalletCards,
		match: "prefix",
		title: "Accounts",
		url: "/accounts",
	},
	{
		icon: ArrowLeftRight,
		match: "exact",
		title: "Compare",
		url: "/compare",
	},
] as const satisfies readonly NavItem[];

export const MANAGEMENT_NAV_ITEMS = [
	{
		icon: Tag,
		match: "prefix",
		title: "Tags",
		url: "/data/tags",
	},
	{
		icon: Layers,
		match: "prefix",
		title: "Category Types",
		url: "/data/types",
	},
	{
		icon: CircleDollarSign,
		match: "prefix",
		title: "Account Types",
		url: "/data/account-types",
	},
] as const satisfies readonly NavItem[];

const SETTINGS_NAV_ITEM = {
	icon: Settings,
	match: "exact",
	title: "Settings",
	url: "/settings",
} as const satisfies NavItem;

export const CLI_DOCS_NAV_ITEM = {
	icon: BookOpen,
	match: "prefix",
	title: "CLI Docs",
	url: "/docs/cli",
} as const satisfies NavItem;

export const MOBILE_PRIMARY_NAV_ITEMS = [
	CORE_NAV_ITEMS[0],
	CORE_NAV_ITEMS[1],
	CORE_NAV_ITEMS[2],
	CORE_NAV_ITEMS[3],
] as const satisfies readonly NavItem[];

export const MOBILE_MORE_NAV_ITEMS = [
	CORE_NAV_ITEMS[4],
	...MANAGEMENT_NAV_ITEMS,
	SETTINGS_NAV_ITEM,
	CLI_DOCS_NAV_ITEM,
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
): boolean => matchesPath(pathname, subItem.url, subItem.match);

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
