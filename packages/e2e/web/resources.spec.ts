import { expect, test as publicTest } from "@playwright/test";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";
import { seedUser } from "../src/users";

const CYCLE_DETAIL_URL = /\/cycles\/[^/]+$/u;
const DASHBOARD_URL = /\/dashboard$/u;
const FEATURES_URL = /\/features$/u;
const DOCS_URL = /\/docs\/cli$/u;
const EXPENSE_DOCS_URL = /\/docs\/cli\/expenses$/u;

test("creates and edits a cycle and category with persisted planned totals through Web", async ({
	page,
	user,
}) => {
	const seed = await seedUser(user);
	// Leave the UI's default current-month dates free, rather than overlapping
	// seedUser's intentionally broad tracking cycle.
	await user.mutation(api.cycles.update, {
		endDate: "2019-01-31",
		id: seed.cycleId,
		startDate: "2019-01-01",
	});
	await page.goto("/cycles/new");
	await page.getByLabel("Cycle Name", { exact: true }).fill("Resource cycle");
	await page.getByRole("button", { exact: true, name: "Create Cycle" }).click();
	await expect(page).toHaveURL(CYCLE_DETAIL_URL);
	await expect(
		page.getByRole("heading", { exact: true, name: "Resource cycle" })
	).toBeVisible();
	const cycles = await user.query(api.cycles.list, {});
	const cycle = cycles.find((candidate) => candidate.name === "Resource cycle");
	if (!cycle) {
		throw new Error("UI-created resource cycle was not returned");
	}
	const today = new Date();
	const month = today.toISOString().slice(0, 7);
	const lastDay = new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
	).getUTCDate();
	expect(cycle).toMatchObject({
		endDate: `${month}-${lastDay}`,
		startDate: `${month}-01`,
	});
	await page.goto(`/cycles/${cycle._id}/edit`);
	await expect(page.getByLabel("Cycle Name", { exact: true })).toHaveValue(
		"Resource cycle"
	);
	await page
		.getByLabel("Cycle Name", { exact: true })
		.fill("Resource cycle revised");
	await page.getByRole("button", { exact: true, name: "Save Changes" }).click();
	await expect(page).toHaveURL(CYCLE_DETAIL_URL);
	await expect(
		page.getByRole("heading", { exact: true, name: "Resource cycle revised" })
	).toBeVisible();
	await page.goto(`/categories/new?id=${cycle._id}`);
	// These existing inputs have placeholders but their visual Labels are not
	// associated with controls; keep selectors semantic until the app fixes that.
	await page
		.getByPlaceholder("Category name", { exact: true })
		.fill("Resource groceries");
	await page.getByPlaceholder("0.00", { exact: true }).fill("125.50");
	await page.getByRole("button", { exact: true, name: "Add Category" }).click();
	await expect(page).toHaveURL(DASHBOARD_URL);
	const categories = await user.query(api.categories.list, {
		cycleId: cycle._id,
	});
	expect(categories).toHaveLength(1);
	const [category] = categories;
	if (!category) {
		throw new Error("UI-created resource category was not returned");
	}
	expect(category).toMatchObject({
		name: "Resource groceries",
		plannedAmount: 125.5,
	});
	await page.goto(`/categories/${category._id}`);
	await page.getByRole("button", { exact: true, name: "Edit" }).click();
	const editor = page.getByRole("dialog", {
		exact: true,
		name: "Edit Category: Resource groceries",
	});
	await expect(editor.getByPlaceholder("0.00", { exact: true })).toHaveValue(
		"125.5"
	);
	await editor
		.getByPlaceholder("Category name", { exact: true })
		.fill("Resource weekly groceries");
	await editor.getByPlaceholder("0.00", { exact: true }).fill("150.75");
	await editor
		.getByRole("button", { exact: true, name: "Save Changes" })
		.click();
	await expect(editor).toBeHidden();
	await expect(
		page.getByRole("heading", {
			exact: true,
			name: "Resource weekly groceries",
		})
	).toBeVisible();
	await expect(
		page
			.getByText("Planned", { exact: true })
			.locator("..")
			.getByRole("heading")
	).toHaveText("$150.75");
	await page.goto(`/cycles/${cycle._id}`);
	await page.reload();
	await expect(
		page.getByRole("heading", { exact: true, name: "Resource cycle revised" })
	).toBeVisible();
	await expect(
		page
			.getByText("Planned", { exact: true })
			.locator("..")
			.getByRole("heading")
	).toHaveText("$150.75");
	expect(
		await user.query(api.categories.get, { id: category._id })
	).toMatchObject({ name: "Resource weekly groceries", plannedAmount: 150.75 });
	await page.goto("/dashboard");
	await expect(
		page
			.getByRole("region", { exact: true, name: "Budget left" })
			.getByText("$0.00 spent of $150.75 planned", { exact: true })
	).toBeVisible();
});

test("creates, renames and removes an unused global tag through Web", async ({
	page,
	user,
}) => {
	await seedUser(user);
	// Tags intentionally use a table on desktop and cards on mobile. Exercise
	// the desktop management path once; preferences cover narrow keyboard use.
	await page.setViewportSize({ height: 900, width: 1280 });
	await page.goto("/data/tags");
	await page.getByRole("button", { exact: true, name: "New Tag" }).click();
	const creator = page.getByRole("dialog", { exact: true, name: "Create Tag" });
	await creator
		.getByLabel("Tag Name", { exact: true })
		.fill("Resource errands");
	await creator
		.getByRole("button", { exact: true, name: "Create Tag" })
		.click();
	await expect(creator).toBeHidden();
	const row = page
		.getByRole("row")
		.filter({ has: page.getByText("Resource errands", { exact: true }) });
	await expect(row.getByText("0 expenses", { exact: true })).toBeVisible();
	await row.getByRole("button").click();
	await page.getByRole("menuitem", { exact: true, name: "Edit" }).click();
	const editor = page.getByRole("dialog", { exact: true, name: "Edit Tag" });
	await editor
		.getByLabel("Tag Name", { exact: true })
		.fill("Resource errands revised");
	await editor
		.getByRole("button", { exact: true, name: "Save Changes" })
		.click();
	await expect(editor).toBeHidden();
	await page.reload();
	const revised = page.getByRole("row").filter({
		has: page.getByText("Resource errands revised", { exact: true }),
	});
	await expect(revised).toBeVisible();
	const tags = await user.query(api.tags.list, {});
	expect(tags.map((tag) => tag.name)).toEqual(["Resource errands revised"]);
	await revised.getByRole("button").click();
	await page.getByRole("menuitem", { exact: true, name: "Delete" }).click();
	await expect(
		page.getByRole("heading", { exact: true, name: "No tags found" })
	).toBeVisible();
	expect(await user.query(api.tags.list, {})).toEqual([]);
});

test("creates and edits a custom account type, then archives and reactivates it @compatibility", async ({
	page,
	user,
}) => {
	await seedUser(user);
	await page.goto("/data/account-types");
	await page.getByRole("button", { exact: true, name: "New type" }).click();
	const creator = page.getByRole("dialog", {
		exact: true,
		name: "Create account type",
	});
	await creator.getByLabel("Name", { exact: true }).fill("Resource reserve");
	await creator
		.getByRole("button", { exact: true, name: "Create type" })
		.click();
	await expect(creator).toBeHidden();
	await page
		.getByRole("button", { exact: true, name: "Manage Resource reserve" })
		.click();
	await page.getByRole("menuitem", { exact: true, name: "Edit" }).click();
	const editor = page.getByRole("dialog", {
		exact: true,
		name: "Edit account type",
	});
	await editor
		.getByLabel("Name", { exact: true })
		.fill("Resource reserve revised");
	await editor.getByLabel("Color", { exact: true }).fill("#14B8A6");
	await editor
		.getByRole("button", { exact: true, name: "Save changes" })
		.click();
	await expect(editor).toBeHidden();
	await page.reload();
	const types = await user.query(api.accountTypes.list, {});
	const type = types.find(
		(candidate) => candidate.name === "Resource reserve revised"
	);
	if (!type) {
		throw new Error("UI-created account type was not returned");
	}
	expect(type.balanceNature).toBe("asset");
	expect(type.color?.toUpperCase()).toBe("#14B8A6");
	await page
		.getByRole("button", {
			exact: true,
			name: "Manage Resource reserve revised",
		})
		.click();
	await page.getByRole("menuitem", { exact: true, name: "Archive" }).click();
	const confirmation = page.getByRole("alertdialog", {
		exact: true,
		name: "Archive Resource reserve revised?",
	});
	await confirmation
		.getByRole("button", { exact: true, name: "Archive type" })
		.click();
	await expect(confirmation).toBeHidden();
	const card = page.getByRole("listitem").filter({
		has: page.getByRole("button", {
			exact: true,
			name: "Manage Resource reserve revised",
		}),
	});
	await expect(card.getByText("Archived", { exact: true })).toBeVisible();
	expect(
		(await user.query(api.accountTypes.list, {})).some(
			(candidate) => candidate._id === type._id
		)
	).toBe(false);
	await card
		.getByRole("button", {
			exact: true,
			name: "Manage Resource reserve revised",
		})
		.click();
	await page.getByRole("menuitem", { exact: true, name: "Reactivate" }).click();
	await expect(
		card.getByText("Available for accounts", { exact: true })
	).toBeVisible();
	expect(
		(await user.query(api.accountTypes.list, {})).find(
			(candidate) => candidate._id === type._id
		)
	).toMatchObject({ isArchived: false });
	await page.reload();
	await expect(
		card.getByText("Available for accounts", { exact: true })
	).toBeVisible();
});

publicTest(
	"public marketing and CLI documentation internal links work with a narrow keyboard menu @compatibility",
	async ({ page }) => {
		await page.setViewportSize({ height: 844, width: 390 });
		await page.goto("/");
		await expect(
			page.getByRole("heading", {
				exact: true,
				level: 1,
				name: "Understand your spending. On your terms.",
			})
		).toBeVisible();
		const openMenu = page.getByRole("button", {
			exact: true,
			name: "Open Menu",
		});
		await openMenu.focus();
		await openMenu.press("Enter");
		await expect(
			page.getByRole("button", { exact: true, name: "Close Menu" })
		).toHaveAttribute("aria-expanded", "true");
		await page.keyboard.press("Escape");
		await expect(openMenu).toHaveAttribute("aria-expanded", "false");
		await openMenu.press("Enter");
		await page
			.getByRole("navigation")
			.getByRole("link", { exact: true, name: "Features" })
			.click();
		await expect(page).toHaveURL(FEATURES_URL);
		await expect(
			page.getByRole("heading", {
				exact: true,
				level: 1,
				name: "Record expenses. See what changed.",
			})
		).toBeVisible();
		await page.getByRole("button", { exact: true, name: "Open Menu" }).click();
		await page
			.getByRole("navigation")
			.getByRole("link", { exact: true, name: "CLI Docs" })
			.click();
		await expect(page).toHaveURL(DOCS_URL);
		await expect(
			page.getByRole("heading", { exact: true, level: 1, name: "Quick start" })
		).toBeVisible();
		const docsHeader = page.getByRole("banner");
		const openSidebar = docsHeader.getByRole("button", {
			exact: true,
			name: "Open Sidebar",
		});
		await openSidebar.focus();
		await openSidebar.press("Enter");
		await expect(
			docsHeader.getByRole("button", { exact: true, name: "Close Sidebar" })
		).toHaveAttribute("aria-expanded", "true");
		await page
			.getByRole("complementary")
			.getByRole("link", { exact: true, name: "Expenses" })
			.click();
		await expect(page).toHaveURL(EXPENSE_DOCS_URL);
		await expect(
			page.getByRole("heading", { exact: true, level: 1, name: "Expenses" })
		).toBeVisible();
		// The heading also contains an accessible copy-anchor button. Locate its
		// titled link, rather than assuming that button is absent from its name.
		const expenseActions = page
			.getByRole("heading", { level: 2 })
			.getByRole("link", { exact: true, name: "Other things you can do" });
		await expect(expenseActions).toBeVisible();
		await expect(expenseActions).toHaveText("Other things you can do");
	}
);
