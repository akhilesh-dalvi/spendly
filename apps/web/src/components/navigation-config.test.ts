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
		{ active: true, item: CORE_NAV_ITEMS[0], path: "/dashboard" },
		{ active: true, item: CORE_NAV_ITEMS[0], path: "/dashboard/" },
		{ active: false, item: CORE_NAV_ITEMS[0], path: "/dashboard/detail" },
		{ active: true, item: CORE_NAV_ITEMS[1], path: "/expenses" },
		{ active: true, item: CORE_NAV_ITEMS[1], path: "/expenses/item" },
		{ active: false, item: CORE_NAV_ITEMS[1], path: "/expenses-other" },
		{ active: false, item: CORE_NAV_ITEMS[1], path: "/" },
	])(
		"matches $path only within its navigation boundary",
		({ path, item, active }) => {
			expect(isNavItemActive(path, item)).toBe(active);
		}
	);

	it("marks parents active for child destinations but not unrelated routes", () => {
		const item: NavItem = {
			icon: Home,
			items: [
				{ match: "prefix", title: "Profile", url: "/profile/" },
				{ match: "exact", title: "Security", url: "/security" },
			],
			match: "exact",
			title: "Settings",
			url: "/settings",
		};
		expect(isNavItemActive("/profile/edit", item)).toBe(true);
		expect(isNavItemActive("/security", item)).toBe(true);
		expect(isNavItemActive("/security/detail", item)).toBe(false);
		expect(
			isSubNavItemActive(
				"/profile",
				item.items?.[0] ?? { match: "exact", title: "", url: "" }
			)
		).toBe(true);
	});
});
