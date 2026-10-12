import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
	CORE_NAV_ITEMS,
	isNavItemActive,
	isSubNavItemActive,
	type NavItem,
} from "./navigation-config";

describe("navigation route matching", () => {
	it.each([
		{ path: "/dashboard", item: CORE_NAV_ITEMS[0], active: true },
		{ path: "/dashboard/", item: CORE_NAV_ITEMS[0], active: true },
		{ path: "/dashboard/detail", item: CORE_NAV_ITEMS[0], active: false },
		{ path: "/expenses", item: CORE_NAV_ITEMS[1], active: true },
		{ path: "/expenses/item", item: CORE_NAV_ITEMS[1], active: true },
		{ path: "/expenses-other", item: CORE_NAV_ITEMS[1], active: false },
		{ path: "/", item: CORE_NAV_ITEMS[1], active: false },
	])("matches $path only within its navigation boundary", ({
		path,
		item,
		active,
	}) => {
		expect(isNavItemActive(path, item)).toBe(active);
	});

	it("marks parents active for child destinations but not unrelated routes", () => {
		const item: NavItem = {
			title: "Settings",
			url: "/settings",
			match: "exact",
			icon: Home,
			items: [
				{ title: "Profile", url: "/profile/", match: "prefix" },
				{ title: "Security", url: "/security", match: "exact" },
			],
		};
		expect(isNavItemActive("/profile/edit", item)).toBe(true);
		expect(isNavItemActive("/security", item)).toBe(true);
		expect(isNavItemActive("/security/detail", item)).toBe(false);
		expect(
			isSubNavItemActive(
				"/profile",
				item.items?.[0] ?? { title: "", url: "", match: "exact" }
			)
		).toBe(true);
	});
});
