// biome-ignore-all lint/performance/noAwaitInLoops: Stateful E2E steps and fixture cleanup require ordered execution.
import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";
import { type E2EUser, seedUser } from "../src/users";

const WALLET_OPTION = /^E2E Wallet ·/u;
const SAVINGS_OPTION = /^E2E Savings ·/u;
const FOOD_OPTION = /^Report food$/u;
const CURRENT_OPTION = /^E2E tracking /u;
const PREVIOUS_OPTION = /^Report previous /u;

const seedReports = async (user: E2EUser) => {
	const seed = await seedUser(user);
	const food = await user.mutation(api.categories.create, {
		cycleId: seed.cycleId,
		name: "Report food",
		plannedAmount: 100,
	});
	const transport = await user.mutation(api.categories.create, {
		cycleId: seed.cycleId,
		name: "Report transport",
		plannedAmount: 200,
	});
	if (!(food && transport)) {
		throw new Error("Report categories were not created");
	}
	const tagId = await user.mutation(api.tags.create, { name: "Report work" });
	for (const input of [
		{
			accountId: seed.accountId,
			amount: 25,
			categoryId: food._id,
			spentOn: "Report lunch",
			tagIds: [tagId],
		},
		{
			accountId: seed.accountId,
			amount: 15,
			categoryId: food._id,
			spentOn: "Report dinner",
		},
		{
			accountId: seed.destinationId,
			amount: 60,
			categoryId: transport._id,
			spentOn: "Report train",
			tagIds: [tagId],
		},
		{ accountId: null, amount: 5, spentOn: "Report uncategorized" },
	]) {
		await user.mutation(api.expenses.create, { ...input, date: seed.date });
	}
	return { ...seed, foodId: food._id };
};

test("dashboard and category show exact fixture spending and planned totals @compatibility", {
	tag: "@smoke",
}, async ({ page, user }) => {
	const seed = await seedReports(user);
	await page.goto("/dashboard");
	const budget = page.getByRole("region", {
		exact: true,
		name: "Budget left",
	});
	await expect(budget.getByText("$195.00", { exact: true })).toBeVisible();
	await expect(
		budget.getByText("$105.00 spent of $300.00 planned", { exact: true })
	).toBeVisible();
	await expect(budget.getByText("35% spent", { exact: true })).toBeVisible();
	await expect(
		budget.getByRole("progressbar", { name: "Budget spent" })
	).toHaveAttribute("aria-valuenow", "35");
	await expect(
		page
			.getByRole("region", { name: "Tracked funds" })
			.getByText("$1,100.00", { exact: true })
	).toBeVisible();

	await page.goto(`/categories/${seed.foodId}`);
	await expect(
		page.getByRole("heading", { exact: true, name: "Report food" })
	).toBeVisible();
	for (const amount of ["$40.00", "$60.00", "$100.00"]) {
		await expect(
			page.getByRole("heading", { exact: true, name: amount })
		).toBeVisible();
	}
	await expect(page.getByText("2 total", { exact: true })).toBeVisible();
	await expect(
		page
			.getByRole("row")
			.filter({ hasText: "Report lunch" })
			.getByRole("cell", { exact: true, name: "$25.00" })
	).toBeVisible();
	await expect(
		page
			.getByRole("row")
			.filter({ hasText: "Report dinner" })
			.getByRole("cell", { exact: true, name: "$15.00" })
	).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("heading", { exact: true, name: "$40.00" })
	).toBeVisible();
});

test("expense filters intersect cycle, category, account and tag and recover from empty search results", async ({
	page,
	user,
}) => {
	await seedReports(user);
	await page.goto("/expenses");
	const total = page.getByText("Total spent", { exact: true }).locator("..");
	const count = page.getByText("Count", { exact: true }).locator("..");
	await expect(total).toHaveText("Total spent$105.00");
	await expect(count).toHaveText("Count4");
	await page.getByRole("combobox").filter({ hasText: "All cycles" }).click();
	await page.getByRole("option", { exact: true, name: "E2E tracking" }).click();
	await page
		.getByRole("combobox")
		.filter({ hasText: "All categories" })
		.click();
	await page.getByRole("option", { name: FOOD_OPTION }).click();
	await expect(total).toHaveText("Total spent$40.00");
	await expect(count).toHaveText("Count2");
	await page.getByRole("combobox").filter({ hasText: "All accounts" }).click();
	await page.getByRole("option", { name: WALLET_OPTION }).click();
	await page.getByRole("button", { exact: true, name: "Report work" }).click();
	await expect(count).toHaveText("Count1");
	await expect(total).toHaveText("Total spent$25.00");
	await expect(
		page.getByRole("row").filter({ hasText: "Report lunch" })
	).toHaveCount(1);
	await expect(
		page.getByRole("row").filter({ hasText: "Report dinner" })
	).toHaveCount(0);

	await page
		.getByPlaceholder("Search description...", { exact: true })
		.fill("no-matching-report-expense");
	await expect(
		page.getByRole("cell", { exact: true, name: "No results." })
	).toBeVisible();
	await expect(
		page.getByRole("row").filter({ hasText: "Report lunch" })
	).toHaveCount(0);
	await page
		.getByPlaceholder("Search description...", { exact: true })
		.fill("");
	await expect(
		page.getByRole("row").filter({ hasText: "Report lunch" })
	).toHaveCount(1);
	// An impossible account/category intersection uses the page-level empty
	// state, unlike text search's table-level empty state.
	await page.getByRole("combobox").filter({ hasText: "E2E Wallet" }).click();
	await page.getByRole("option", { name: SAVINGS_OPTION }).click();
	await expect(
		page.getByRole("heading", { exact: true, name: "No expenses found" })
	).toBeVisible();
	await expect(total).toHaveText("Total spent$0.00");
	await expect(count).toHaveText("Count0");
	await page.getByRole("button", { exact: true, name: "Clear all" }).click();
	await expect(count).toHaveText("Count4");
	await expect(total).toHaveText("Total spent$105.00");

	await page.getByRole("combobox").filter({ hasText: "All cycles" }).click();
	await page.getByRole("option", { exact: true, name: "E2E tracking" }).click();
	await page
		.getByRole("combobox")
		.filter({ hasText: "All categories" })
		.click();
	await page
		.getByRole("option", { exact: true, name: "Uncategorized" })
		.click();
	await expect(count).toHaveText("Count1");
	await expect(total).toHaveText("Total spent$5.00");
	await expect(
		page.getByRole("row").filter({ hasText: "Report uncategorized" })
	).toHaveCount(1);
});

test("rapid comparison selections survive delayed navigation and browser history", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	const previous = await user.mutation(api.cycles.create, {
		endDate: "2019-12-31",
		name: "Report previous",
		startDate: "2019-01-01",
	});
	if (!previous) {
		throw new Error("Previous comparison cycle was not created");
	}
	await page.goto("/compare");
	const cyclePicker = page.getByRole("combobox", {
		exact: true,
		name: "Cycles to compare",
	});
	await expect(cyclePicker).toHaveText("Select cycles to compare");
	let resumeNavigation: () => void = () => undefined;
	const navigationGate = new Promise<void>((resolve) => {
		resumeNavigation = resolve;
	});
	// Delay only real RSC navigations, not financial queries or their responses.
	// Without synchronous query-state updates the second click loses the first.
	await page.route(
		(url) => url.pathname === "/compare" && url.searchParams.has("cycles"),
		async (route) => {
			if ((await route.request().headerValue("rsc")) === "1") {
				await navigationGate;
			}
			await route.continue();
		}
	);
	try {
		await cyclePicker.click();
		await page.getByRole("option", { name: CURRENT_OPTION }).click();
		await page.getByRole("option", { name: PREVIOUS_OPTION }).click();
		await expect(cyclePicker).toHaveText("2 cycles selected", {
			timeout: 5000,
		});
		expect(new URL(page.url()).searchParams.get("cycles")?.split(",")).toEqual([
			seed.cycleId,
			previous._id,
		]);
	} finally {
		resumeNavigation();
	}
	await page
		.getByPlaceholder("Search cycles...", { exact: true })
		.press("Escape");
	await page.reload();
	await expect(cyclePicker).toHaveText("2 cycles selected");
	await page.goBack();
	await expect(cyclePicker).toHaveText("1 cycle selected");
	expect(new URL(page.url()).searchParams.get("cycles")).toBe(seed.cycleId);
	await page.goForward();
	await expect(cyclePicker).toHaveText("2 cycles selected");
});

test("two selected cycles compare exact totals and persist selection in the URL", async ({
	page,
	user,
}) => {
	const seed = await seedReports(user);
	const previous = await user.mutation(api.cycles.create, {
		endDate: "2019-12-31",
		name: "Report previous",
		startDate: "2019-01-01",
	});
	if (!previous) {
		throw new Error("Previous report cycle was not created");
	}
	const food = await user.mutation(api.categories.create, {
		cycleId: previous._id,
		name: "Report food",
		plannedAmount: 80,
	});
	if (!food) {
		throw new Error("Previous report category was not created");
	}
	await user.mutation(api.expenses.create, {
		accountId: null,
		amount: 20,
		categoryId: food._id,
		date: "2019-06-15",
		spentOn: "Previous report lunch",
	});
	await page.goto("/compare");
	await expect(
		page.getByText(
			"Choose at least two cycles to view spending and category comparisons.",
			{ exact: true }
		)
	).toBeVisible();
	const cyclePicker = page.getByRole("combobox", {
		exact: true,
		name: "Cycles to compare",
	});
	await cyclePicker.click();
	await page.getByRole("option", { name: CURRENT_OPTION }).click();
	await page.getByRole("option", { name: PREVIOUS_OPTION }).click();
	await page
		.getByPlaceholder("Search cycles...", { exact: true })
		.press("Escape");
	await expect(cyclePicker).toHaveText("2 cycles selected");
	expect(new URL(page.url()).searchParams.get("cycles")?.split(",")).toEqual([
		seed.cycleId,
		previous._id,
	]);
	await expect(
		page.getByRole("heading", { exact: true, name: "$125.00" })
	).toBeVisible();
	await expect(
		page.getByRole("heading", { exact: true, name: "$380.00" })
	).toBeVisible();
	await expect(
		page.getByRole("heading", { exact: true, name: "$255.00" })
	).toBeVisible();
	await expect(
		page.getByText("$105.00 of $300.00", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText("$20.00 of $80.00", { exact: true })
	).toBeVisible();
	const foodBreakdown = page
		.getByRole("button")
		.filter({ hasText: "Report food" });
	await expect(
		foodBreakdown.getByText("$40.00 / $100.00", { exact: true })
	).toBeVisible();
	await expect(
		foodBreakdown.getByText("$20.00 / $80.00", { exact: true })
	).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("heading", { exact: true, name: "$125.00" })
	).toBeVisible();
	await page
		.getByRole("button", { exact: true, name: "Remove Report previous" })
		.click();
	await expect(
		page.getByText(
			"Choose at least two cycles to view spending and category comparisons.",
			{ exact: true }
		)
	).toBeVisible();
	expect(new URL(page.url()).searchParams.get("cycles")).toBe(seed.cycleId);
});
