import { expect } from "@playwright/test";
import { api } from "../src/backend-api";
import { loadEnvironment } from "../src/environment";
import { test } from "../src/playwright-fixtures";
import { createUser, seedUser } from "../src/users";

const ONBOARDING_START_URL = /\/onboarding\/start$/u;
const SIGN_IN_URL = /\/sign-in(?:\?|$)/u;
const SIGN_IN_HEADING = /Sign in/u;

test("signs up through the real Clerk form and follows its onboarding redirect", async ({
	page,
}) => {
	// No `user` fixture: this email must not exist before form submission.
	const user = await createUser(page, loadEnvironment(), {
		creationMode: "sign-up",
	});
	try {
		await expect(page).toHaveURL(ONBOARDING_START_URL);
		await expect(
			page.getByRole("heading", {
				name: "Set up the way you already think about money.",
			})
		).toBeVisible();
		expect(await user.query(api.users.get, {})).toMatchObject({
			email: user.email,
		});
		expect(await user.query(api.users.getOnboardingState, {})).toMatchObject({
			step: "start",
			path: null,
			cycle: null,
		});
		expect(await user.query(api.cycles.list, {})).toEqual([]);
		await page.reload();
		await expect(page).toHaveURL(ONBOARDING_START_URL);
		await expect(
			page.getByRole("button", { name: "Save and continue", exact: true })
		).toBeVisible();
	} finally {
		await user.dispose();
	}
});

test("signs in through the real Clerk UI and redirects a fresh user from a protected route to onboarding", async ({
	page,
	user,
}) => {
	expect(await user.query(api.users.getOnboardingState, {})).toMatchObject({
		step: "start",
		path: null,
		cycle: null,
	});
	await page.goto("/expenses/new");
	await expect(page).toHaveURL(ONBOARDING_START_URL);
	await expect(
		page.getByRole("heading", {
			name: "Set up the way you already think about money.",
		})
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Save and continue", exact: true })
	).toBeVisible();
});

test(
	"logs out through the user menu and protects direct account and expense routes",
	{ tag: "@smoke" },
	async ({ page, user }) => {
		const { accountId } = await seedUser(user);
		await page.goto(`/accounts/${accountId}`);
		await expect(
			page.getByRole("heading", { name: "E2E Wallet", exact: true })
		).toBeVisible();
		// Exercise Spendly's NavUser handler, not the Clerk test SDK's signOut.
		await page.getByRole("button").filter({ hasText: user.email }).click();
		await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
		await page.waitForFunction(() =>
			Boolean(window.Clerk?.loaded && !window.Clerk.session)
		);
		await page.goto(`/accounts/${accountId}`);
		await expect(page).toHaveURL(SIGN_IN_URL);
		expect(new URL(page.url()).searchParams.get("redirect_url")).toBe(
			`${user.config.baseUrl}/accounts/${accountId}`
		);
		await expect(
			page.getByRole("heading", { name: SIGN_IN_HEADING })
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "E2E Wallet", exact: true })
		).toBeHidden();
		await page.goto("/expenses/new");
		await expect(page).toHaveURL(SIGN_IN_URL);
		expect(new URL(page.url()).searchParams.get("redirect_url")).toBe(
			`${user.config.baseUrl}/expenses/new`
		);
		await expect(page.getByLabel("Amount", { exact: true })).toBeHidden();
		await page.reload();
		await expect(page).toHaveURL(SIGN_IN_URL);
		await expect(
			page.getByRole("heading", { name: SIGN_IN_HEADING })
		).toBeVisible();
	}
);
