import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 2,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	outputDir: ".next/playwright/results",
	reporter: [
		["list"],
		["html", { outputFolder: ".next/playwright/report", open: "never" }],
	],
	use: {
		baseURL: "http://localhost:3100",
		serviceWorkers: "block",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	// Build first: the smoke suite deliberately never starts a development server.
	webServer: {
		command: "pnpm start --port 3100",
		url: "http://localhost:3100/docs/cli",
		reuseExistingServer: false,
		timeout: 60_000,
		env: {
			NEXT_PUBLIC_CONVEX_URL: "https://ci-placeholder.convex.cloud",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
			NEXT_PUBLIC_SITE_URL: "https://spendly.example.com",
			NEXT_PUBLIC_SENTRY_ENABLED: "false",
			// Clerk middleware requires a nonempty key even for signed-out requests.
			// This is deliberately invalid for API calls; no session is fabricated.
			CLERK_SECRET_KEY: "sk_test_browser_smoke_not_a_real_secret",
			SENTRY_AUTH_TOKEN: "",
		},
	},
});
