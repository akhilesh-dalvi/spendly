import { expect, test } from "@playwright/test";

// No Clerk sessions, Convex data, or third-party requests: this suite exercises
// public production pages and the real signed-out boundary, not an auth bypass.
test.beforeEach(async ({ context, baseURL }) => {
	await context.route("**/*", async (route) => {
		if (new URL(route.request().url()).origin === baseURL) {
			// Clerk development keys otherwise redirect document requests to its
			// hosted browser handshake. A fetch-style request stays genuinely
			// signed out, without contacting Clerk or inventing a session.
			if (route.request().isNavigationRequest()) {
				const response = await route.fetch({
					headers: { ...route.request().headers(), "sec-fetch-dest": "empty" },
					maxRedirects: 0,
				});
				await route.fulfill({ response });
			} else {
				await route.continue();
			}
		} else {
			await route.abort("blockedbyclient");
		}
	});
	await context.routeWebSocket("**/*", (socket) => socket.close());
});

const docs = [
	["", "Quick start"],
	["ai-agents", "AI agents"],
	["expenses", "Expenses"],
	["accounts", "Accounts"],
	["cycles", "Cycles"],
	["categories", "Categories"],
	["tags", "Tags"],
	["troubleshooting", "Troubleshooting"],
] as const;

for (const [slug, title] of docs) {
	test(`public CLI docs: ${title}`, async ({ page }) => {
		const path = slug ? `/docs/cli/${slug}` : "/docs/cli";
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(
			page.getByRole("heading", { level: 1, name: title, exact: true })
		).toBeVisible();
		await expect(page).toHaveTitle(`Spendly | ${title} — CLI docs`);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			`https://spendly.example.com${path}`
		);
	});
}

test("docs navigation works in the browser", async ({ page }) => {
	await page.goto("/docs/cli");
	await page
		.getByRole("link", { name: "AI agents", exact: true })
		.first()
		.click();
	await expect(page).toHaveURL("/docs/cli/ai-agents");
	await expect(
		page.getByRole("heading", { level: 1, name: "AI agents" })
	).toBeVisible();
});

const accountsResult = /accounts/i;

test("docs search hydrates and returns local results", async ({ page }) => {
	await page.goto("/docs/cli");
	await page
		.getByRole("button", { name: "Open Search", exact: true })
		.last()
		.press("ControlOrMeta+k");
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByRole("combobox", { name: "Search" }).fill("accounts");
	await expect(dialog.getByRole("option").first()).toBeVisible();
	await expect(dialog.getByRole("listbox")).toContainText(accountsResult);
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

const redirects = [
	["installation", "/docs/cli#install"],
	["authentication", "/docs/cli#sign-in"],
	["agent-skill", "/docs/cli/ai-agents"],
	["cli-contract", "/docs/cli/ai-agents#machine-readable-cli-contract"],
	["transfers", "/docs/cli/accounts#transfer-funds"],
	["privacy", "/docs/cli/ai-agents#trusted-computer-and-privacy-boundary"],
] as const;

for (const [slug, destination] of redirects) {
	test(`legacy docs redirect: ${slug}`, async ({ page, request }) => {
		const path = `/docs/cli/${slug}`;
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status()).toBe(308);
		expect(response.headers().location).toBe(destination);

		// Validate the real redirect above, then render its destination locally.
		// Chromium does not re-route redirect hops through request interception.
		await page.goto(destination);
		await expect(page).toHaveURL(destination);
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		const fragment = new URL(page.url()).hash;
		if (fragment) {
			await expect(page.locator(fragment)).toBeVisible();
		}
	});
}

for (const path of ["/dashboard", "/expenses", "/accounts", "/onboarding"]) {
	test(`signed-out app route redirects to login: ${path}`, async ({
		page,
		request,
		baseURL,
	}) => {
		// Assert the server boundary without following any hosted auth endpoint.
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status()).toBe(307);
		const location = response.headers().location;
		expect(location).toBeTruthy();
		const redirect = new URL(location, baseURL);
		expect(redirect.origin).toBe(baseURL);
		expect(redirect.pathname).toBe("/sign-in");
		expect(redirect.searchParams.get("redirect_url")).toBe(`${baseURL}${path}`);

		const navigation = await page.goto(redirect.href);
		expect(navigation?.status()).toBe(200);
		await expect(page).toHaveURL(redirect.href);
		// The hosted Clerk widget cannot load with synthetic keys/network blocked.
		// Do not claim authenticated UI or login-widget coverage here.
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
	});
}
