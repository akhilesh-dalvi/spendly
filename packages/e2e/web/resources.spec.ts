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
		id: seed.cycleId,
		startDate: "2019-01-01",
		endDate: "2019-01-31",
	});
	await page.goto("/cycles/new");
	await page.getByLabel("Cycle Name", { exact: true }).fill("Resource cycle");
	await page.getByRole("button", { name: "Create Cycle", exact: true }).click();
	await expect(page).toHaveURL(CYCLE_DETAIL_URL);
	await expect(
		page.getByRole("heading", { name: "Resource cycle", exact: true })
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
		startDate: `${month}-01`,
		endDate: `${month}-${lastDay}`,
	});
	await page.goto(`/cycles/${cycle._id}/edit`);
	await expect(page.getByLabel("Cycle Name", { exact: true })).toHaveValue(
		"Resource cycle"
	);
	await page
		.getByLabel("Cycle Name", { exact: true })
		.fill("Resource cycle revised");
	await page.getByRole("button", { name: "Save Changes", exact: true }).click();
	await expect(page).toHaveURL(CYCLE_DETAIL_URL);
	await expect(
		page.getByRole("heading", { name: "Resource cycle revised", exact: true })
	).toBeVisible();
	await page.goto(`/categories/new?id=${cycle._id}`);
	// These existing inputs have placeholders but their visual Labels are not
	// associated with controls; keep selectors semantic until the app fixes that.
	await page
		.getByPlaceholder("Category name", { exact: true })
		.fill("Resource groceries");
	await page.getByPlaceholder("0.00", { exact: true }).fill("125.50");
	await page.getByRole("button", { name: "Add Category", exact: true }).click();
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
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	const editor = page.getByRole("dialog", {
		name: "Edit Category: Resource groceries",
		exact: true,
	});
	await expect(editor.getByPlaceholder("0.00", { exact: true })).toHaveValue(
		"125.5"
	);
	await editor
		.getByPlaceholder("Category name", { exact: true })
		.fill("Resource weekly groceries");
	await editor.getByPlaceholder("0.00", { exact: true }).fill("150.75");
	await editor
		.getByRole("button", { name: "Save Changes", exact: true })
		.click();
	await expect(editor).toBeHidden();
	await expect(
		page.getByRole("heading", {
			name: "Resource weekly groceries",
			exact: true,
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
		page.getByRole("heading", { name: "Resource cycle revised", exact: true })
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
			.getByRole("region", { name: "Budget left", exact: true })
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
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/data/tags");
	await page.getByRole("button", { name: "New Tag", exact: true }).click();
	const creator = page.getByRole("dialog", { name: "Create Tag", exact: true });
	await creator
		.getByLabel("Tag Name", { exact: true })
		.fill("Resource errands");
	await creator
		.getByRole("button", { name: "Create Tag", exact: true })
		.click();
	await expect(creator).toBeHidden();
	const row = page
		.getByRole("row")
		.filter({ has: page.getByText("Resource errands", { exact: true }) });
	await expect(row.getByText("0 expenses", { exact: true })).toBeVisible();
	await row.getByRole("button").click();
	await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
	const editor = page.getByRole("dialog", { name: "Edit Tag", exact: true });
	await editor
		.getByLabel("Tag Name", { exact: true })
		.fill("Resource errands revised");
	await editor
		.getByRole("button", { name: "Save Changes", exact: true })
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
	await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "No tags found", exact: true })
	).toBeVisible();
	expect(await user.query(api.tags.list, {})).toEqual([]);
});

test("creates and edits a custom account type, then archives and reactivates it @compatibility", async ({
	page,
	user,
}) => {
	await seedUser(user);
	await page.goto("/data/account-types");
	await page.getByRole("button", { name: "New type", exact: true }).click();
	const creator = page.getByRole("dialog", {
		name: "Create account type",
		exact: true,
	});
	await creator.getByLabel("Name", { exact: true }).fill("Resource reserve");
	await creator
		.getByRole("button", { name: "Create type", exact: true })
		.click();
	await expect(creator).toBeHidden();
	await page
		.getByRole("button", { name: "Manage Resource reserve", exact: true })
		.click();
	await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
	const editor = page.getByRole("dialog", {
		name: "Edit account type",
		exact: true,
	});
	await editor
		.getByLabel("Name", { exact: true })
		.fill("Resource reserve revised");
	await editor.getByLabel("Color", { exact: true }).fill("#14B8A6");
	await editor
		.getByRole("button", { name: "Save changes", exact: true })
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
			name: "Manage Resource reserve revised",
			exact: true,
		})
		.click();
	await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
	const confirmation = page.getByRole("alertdialog", {
		name: "Archive Resource reserve revised?",
		exact: true,
	});
	await confirmation
		.getByRole("button", { name: "Archive type", exact: true })
		.click();
	await expect(confirmation).toBeHidden();
	const card = page.getByRole("listitem").filter({
		has: page.getByRole("button", {
			name: "Manage Resource reserve revised",
			exact: true,
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
			name: "Manage Resource reserve revised",
			exact: true,
		})
		.click();
	await page.getByRole("menuitem", { name: "Reactivate", exact: true }).click();
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
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: "Spendly gives you a calmer way to track spending.",
				exact: true,
			})
		).toBeVisible();
		const openMenu = page.getByRole("button", {
			name: "Open Menu",
			exact: true,
		});
		await openMenu.focus();
		await openMenu.press("Enter");
		await expect(
			page.getByRole("button", { name: "Close Menu", exact: true })
		).toHaveAttribute("aria-expanded", "true");
		await page.keyboard.press("Escape");
		await expect(openMenu).toHaveAttribute("aria-expanded", "false");
		await openMenu.press("Enter");
		await page
			.getByRole("navigation")
			.getByRole("link", { name: "Features", exact: true })
			.click();
		await expect(page).toHaveURL(FEATURES_URL);
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: "Expense tracking designed for observation, not enforcement.",
				exact: true,
			})
		).toBeVisible();
		await page.getByRole("button", { name: "Open Menu", exact: true }).click();
		await page
			.getByRole("navigation")
			.getByRole("link", { name: "CLI Docs", exact: true })
			.click();
		await expect(page).toHaveURL(DOCS_URL);
		await expect(
			page.getByRole("heading", { level: 1, name: "Quick start", exact: true })
		).toBeVisible();
		await page.getByRole("link", { name: "expenses", exact: true }).click();
		await expect(page).toHaveURL(EXPENSE_DOCS_URL);
		await expect(
			page.getByRole("heading", { level: 1, name: "Expenses", exact: true })
		).toBeVisible();
		// The heading also contains an accessible copy-anchor button. Locate its
		// titled link, rather than assuming that button is absent from its name.
		const findExpenses = page.getByRole("heading", { level: 2 }).filter({
			has: page.getByRole("link", { name: "Find expenses", exact: true }),
		});
		await expect(findExpenses).toBeVisible();
		await expect(findExpenses).toHaveText("Find expenses");
	}
);
