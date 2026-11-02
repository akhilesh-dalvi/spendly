import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import { test } from "../src/playwright-fixtures";

const USD_OPTION = /\(USD\)$/u;
const FREE_CHOICE = /^Start tracking freely/u;
const PLAN_CHOICE = /^Plan & track/u;
const CATEGORIES_URL = /\/onboarding\/categories\?cycleId=/u;
const ACCOUNTS_URL = /\/onboarding\/accounts\?cycleId=/u;
const DASHBOARD_URL = /\/dashboard$/u;

for (const path of ["free", "plan"] as const) {
	test(
		`completes ${path} onboarding entirely through the UI, including calendar dates`,
		{
			tag: path === "free" ? ["@compatibility", "@smoke"] : [],
		},
		async ({ page, user }) => {
			await page.goto("/onboarding/start");
			await expect(
				page.getByRole("heading", {
					name: "Set up the way you already think about money.",
				})
			).toBeVisible();
			await page
				.getByRole("combobox", { name: "Primary currency", exact: true })
				.click();
			await page.getByRole("option", { name: USD_OPTION }).click();
			const choice = page.getByRole("button", {
				name: path === "free" ? FREE_CHOICE : PLAN_CHOICE,
			});
			await choice.click();
			await expect(choice).toHaveAttribute("aria-pressed", "true");
			await page
				.getByRole("button", { name: "Save and continue", exact: true })
				.click();
			await expect(page).toHaveURL(
				new RegExp(`/onboarding/cycle\\?mode=${path}$`, "u")
			);
			await expect(
				page.getByLabel("Cycle name", { exact: true })
			).not.toHaveValue("");
			if (path === "free") {
				await page.getByRole("button", { name: "Custom", exact: true }).click();
			}
			await page
				.getByLabel("Cycle name", { exact: true })
				.fill(`E2E ${path} onboarding`);

			// Use the browser's current month, without freezing or mocking its clock.
			const { year, month } = await page.evaluate(() => {
				const today = new Date();
				return { year: today.getFullYear(), month: today.getMonth() };
			});
			const start = new Date(year, month, 1);
			const end = new Date(year, month + 1, 1);
			const startMonth = start.toLocaleDateString("en-US", { month: "long" });
			const endMonth = end.toLocaleDateString("en-US", { month: "long" });
			const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
			const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`;
			await page.getByLabel("Cycle dates", { exact: true }).click();
			const currentMonth = page.getByRole("grid", {
				name: `${startMonth} ${year}`,
				exact: true,
			});
			// Clicking the existing range start collapses it to one day, then the
			// following month's first day supplies the exclusive end of the cycle.
			await currentMonth
				.getByRole("button", {
					name: new RegExp(`${startMonth} 1st, ${year}(?:, selected)?$`, "u"),
				})
				.click();
			await page
				.getByRole("button", { name: "Go to the Next Month", exact: true })
				.click();
			await page
				.getByRole("grid", {
					name: `${endMonth} ${end.getFullYear()}`,
					exact: true,
				})
				.getByRole("button", {
					name: new RegExp(
						`${endMonth} 1st, ${end.getFullYear()}(?:, selected)?$`,
						"u"
					),
				})
				.click();
			await page.keyboard.press("Escape");
			await page
				.getByRole("button", { name: "Create cycle and continue", exact: true })
				.click();

			await expect(page).toHaveURL(
				path === "plan" ? CATEGORIES_URL : ACCOUNTS_URL
			);
			const firstSavedState = await user.query(
				api.users.getOnboardingState,
				{}
			);
			if (!firstSavedState?.cycle) {
				throw new Error("Onboarding did not save a cycle");
			}
			const originalCycleId = firstSavedState.cycle._id;
			expect(
				(await user.query(api.cycles.list, {})).map((cycle) => cycle._id)
			).toEqual([originalCycleId]);
			await page.reload();
			await expect(page).toHaveURL(
				path === "plan" ? CATEGORIES_URL : ACCOUNTS_URL
			);
			// Browser Back must hydrate the saved cycle, not offer another create.
			await page.goBack();
			await expect(page.getByLabel("Cycle name", { exact: true })).toHaveValue(
				`E2E ${path} onboarding`
			);
			await page
				.getByRole("button", { name: "Save cycle and continue", exact: true })
				.click();
			expect(
				(await user.query(api.users.getOnboardingState, {}))?.cycle
			).toMatchObject({ _id: originalCycleId, startDate, endDate });
			expect(
				(await user.query(api.cycles.list, {})).map((cycle) => cycle._id)
			).toEqual([originalCycleId]);

			if (path === "plan") {
				await expect(page).toHaveURL(CATEGORIES_URL);
				// Repeated field labels are scoped by the row's uniquely named control.
				const groceries = page
					.getByRole("button", { name: "Remove Groceries", exact: true })
					.locator("..");
				await groceries
					.getByLabel("Planned amount", { exact: true })
					.fill("150");
				const utilities = page
					.getByRole("button", { name: "Remove Utilities", exact: true })
					.locator("..");
				await utilities.getByLabel("Planned amount", { exact: true }).fill("0");
				await page
					.getByRole("button", { name: "Remove Entertainment", exact: true })
					.click();
				await page
					.getByRole("button", { name: "Undo removal", exact: true })
					.click();
				await expect(
					page.getByRole("button", {
						name: "Remove Entertainment",
						exact: true,
					})
				).toBeVisible();
				await page
					.getByRole("button", { name: "Remove Entertainment", exact: true })
					.click();
				await page
					.getByRole("button", { name: "Add a custom category", exact: true })
					.click();
				const custom = page
					.getByRole("button", { name: "Remove category", exact: true })
					.locator("..");
				await custom
					.getByLabel("Planned amount", { exact: true })
					.fill("12.50");
				await custom
					.getByLabel("Category name", { exact: true })
					.fill("E2E planned lunch");
				await expect(
					page.getByRole("heading", { name: "$162.50", exact: true })
				).toBeVisible();
				await page
					.getByRole("button", {
						name: "Save categories and continue",
						exact: true,
					})
					.click();
			}

			await expect(page).toHaveURL(ACCOUNTS_URL);
			const state = await user.query(api.users.getOnboardingState, {});
			expect(state).toMatchObject({
				path,
				currency: "USD",
				step: "account",
				cycle: { name: `E2E ${path} onboarding`, startDate, endDate },
			});
			if (!state?.cycle) {
				throw new Error("Onboarding UI did not persist an expense cycle");
			}
			const cycleId = state.cycle._id;
			expect(cycleId).toBe(originalCycleId);
			const savedCategories = await user.query(api.categories.list, {
				cycleId,
			});
			const savedCategoryIds = savedCategories
				.map((category) => category._id)
				.sort();
			await page.reload();
			await expect(
				page.getByLabel("Account name", { exact: true })
			).toBeVisible();
			if (path === "plan") {
				// Revisit and resubmit persisted category rows, including zero/blank
				// amounts. IDs must survive hydration rather than inserting copies.
				await page.goBack();
				await expect(page).toHaveURL(CATEGORIES_URL);
				await page.reload();
				const groceries = page
					.getByRole("button", { name: "Remove Groceries", exact: true })
					.locator("..");
				await expect(
					groceries.getByLabel("Planned amount", { exact: true })
				).toHaveValue("150");
				await expect(
					page.getByRole("button", {
						name: "Remove E2E planned lunch",
						exact: true,
					})
				).toBeVisible();
				await expect(
					page.getByRole("button", {
						name: "Remove Entertainment",
						exact: true,
					})
				).toBeHidden();
				await page
					.getByRole("button", {
						name: "Save categories and continue",
						exact: true,
					})
					.click();
				await expect(page).toHaveURL(ACCOUNTS_URL);
				expect(
					(await user.query(api.categories.list, { cycleId }))
						.map((category) => category._id)
						.sort()
				).toEqual(savedCategoryIds);
			}
			// Leave optional setup and resume via the actual dashboard entry point.
			await page.goto("/dashboard");
			const resume = page.getByRole("region", {
				name: "Finish Spendly setup",
				exact: true,
			});
			await expect(resume).toBeVisible();
			await resume
				.getByRole("link", { name: "Resume setup", exact: true })
				.click();
			await expect(page).toHaveURL(ACCOUNTS_URL);
			expect(new URL(page.url()).searchParams.get("cycleId")).toBe(cycleId);
			expect(
				(await user.query(api.users.getOnboardingState, {}))?.cycle?._id
			).toBe(cycleId);
			expect(
				(await user.query(api.cycles.list, {})).map((cycle) => cycle._id)
			).toEqual([cycleId]);
			expect(
				(await user.query(api.categories.list, { cycleId }))
					.map((category) => category._id)
					.sort()
			).toEqual(savedCategoryIds);
			if (path === "free") {
				await page
					.getByLabel("Account name", { exact: true })
					.fill("E2E First wallet");
				const types = await user.query(api.accountTypes.list, {});
				const assetType = types.find((type) => type.balanceNature === "asset");
				if (!assetType) {
					throw new Error("Fresh user has no asset account type");
				}
				await page
					.getByRole("combobox", { name: "Account type", exact: true })
					.click();
				await page
					.getByRole("option", { name: assetType.name, exact: true })
					.click();
				await page.getByLabel("Opening balance", { exact: true }).fill("1000");
				await page
					.getByRole("button", {
						name: "Create account and finish",
						exact: true,
					})
					.click();
				await expect(
					page.getByRole("heading", {
						name: "Spendly is ready for your first expense.",
					})
				).toBeVisible();
				const accounts = await user.query(api.accounts.list, {});
				expect(accounts).toHaveLength(1);
				expect(accounts[0]).toMatchObject({
					name: "E2E First wallet",
					accountTypeId: assetType._id,
					currentBalance: 1000,
					startingBalance: 1000,
				});
				expect(await user.query(api.users.get, {})).toMatchObject({
					defaultAccountId: accounts[0]?._id,
					accountsOnboardingStatus: "completed",
					onboardingStep: "complete",
				});
				const ledger = await user.query(api.accounts.listTransactions, {});
				expect(ledger).toHaveLength(1);
				expect(ledger[0]).toMatchObject({
					type: "opening_balance",
					amount: 1000,
					balanceAfter: 1000,
					source: "web",
				});
				expect(await user.query(api.categories.list, { cycleId })).toEqual([]);
			} else {
				await page
					.getByRole("button", { name: "Skip account setup", exact: true })
					.click();
				await expect(
					page.getByRole("heading", {
						name: "Spendly is ready for your first expense.",
					})
				).toBeVisible();
				expect(await user.query(api.accounts.list, {})).toEqual([]);
				expect(await user.query(api.users.get, {})).toMatchObject({
					accountsOnboardingStatus: "skipped",
					onboardingStep: "complete",
				});
				const categories = await user.query(api.categories.list, { cycleId });
				expect(categories).toHaveLength(7);
				expect(
					categories.find((category) => category.name === "Groceries")
				).toMatchObject({ plannedAmount: 150 });
				expect(
					categories.find((category) => category.name === "Utilities")
				).toMatchObject({ plannedAmount: 0 });
				expect(
					categories.find((category) => category.name === "Rent")?.plannedAmount
				).toBeUndefined();
				expect(
					categories.find((category) => category.name === "E2E planned lunch")
				).toMatchObject({ plannedAmount: 12.5 });
				expect(
					categories.some((category) => category.name === "Entertainment")
				).toBe(false);
			}

			await page
				.getByRole("link", { name: "View dashboard", exact: true })
				.click();
			await expect(page).toHaveURL(DASHBOARD_URL);
			await page.reload();
			await expect(page).toHaveURL(DASHBOARD_URL);
			await expect
				.poll(
					async () => (await user.query(api.users.getOnboardingState, {}))?.step
				)
				.toBe("complete");
			expect(
				(await user.query(api.users.getOnboardingState, {}))?.cycle
			).toMatchObject({
				_id: cycleId,
				name: `E2E ${path} onboarding`,
				startDate,
				endDate,
			});
			expect(
				(await user.query(api.cycles.list, {})).map((cycle) => cycle._id)
			).toEqual([cycleId]);
			expect(
				(await user.query(api.categories.list, { cycleId }))
					.map((category) => category._id)
					.sort()
			).toEqual(savedCategoryIds);
			await expect(
				page.getByRole("region", { name: "Finish Spendly setup", exact: true })
			).toBeHidden();
			await page.goto("/expenses/new");
			await expect(
				page.getByRole("heading", { name: "Add New Expense" })
			).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Add Expense", exact: true })
			).toBeEnabled();
		}
	);
}
