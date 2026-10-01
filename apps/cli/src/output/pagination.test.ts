import { describe, expect, it } from "vitest";
import {
	buildContinuationCommand,
	renderActiveFilters,
	renderPaginationFooter,
} from "./pagination.js";

describe("human pagination", () => {
	it("preserves stable filters in a copyable continuation command", () => {
		expect(
			buildContinuationCommand({
				args: {
					accountId: "account-wallet",
					limit: 25,
					tagIds: ["tag-essential", "tag work"],
				},
				command: ["expenses", "list"],
				nextCursor: "cursor next",
			})
		).toBe(
			"spendly expenses list --account-id account-wallet --tag-id tag-essential --tag-id 'tag work' --limit 25 --cursor 'cursor next'"
		);
	});

	it("renders resolved resource names in human filter summaries", () => {
		expect(
			renderActiveFilters(
				{
					accountId: "account-wallet",
					categoryId: "category-food",
					cycleId: "cycle-september",
					tagIds: ["tag-essential"],
				},
				{
					account: "Daily Wallet",
					category: "Food",
					cycle: "September",
					tags: ["Essential"],
				}
			)
		).toBe(
			"Filters: cycle: September; category: Food; account: Daily Wallet; tags: Essential"
		);
	});

	it("makes continuation state visible", () => {
		expect(
			renderPaginationFooter({
				continuationCommand: "spendly expenses list --cursor next",
				count: 25,
				hasMore: true,
			})
		).toBe(
			"Showing 25. More results are available.\nNext page: spendly expenses list --cursor next"
		);
	});
});
