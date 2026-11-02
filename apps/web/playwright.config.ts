import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: Boolean(process.env.CI),
	fullyParallel: true,
	outputDir: ".next/playwright/results",
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	reporter: [
		["list"],
		["html", { open: "never", outputFolder: ".next/playwright/report" }],
	],
	retries: process.env.CI ? 1 : 0,
	testDir: "./e2e",
	timeout: 30_000,
	use: {
		baseURL: "http://localhost:3100",
		screenshot: "only-on-failure",
		serviceWorkers: "block",
		trace: "retain-on-failure",
	},
	// Build first: the smoke suite deliberately never starts a development server.
	webServer: {
		command: "pnpm start --port 3100",
		env: {
			// Clerk middleware requires a nonempty key even for signed-out requests.
			// This is deliberately invalid for API calls; no session is fabricated.
			CLERK_SECRET_KEY: "sk_test_browser_smoke_not_a_real_secret",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
			NEXT_PUBLIC_CONVEX_URL: "https://ci-placeholder.convex.cloud",
			NEXT_PUBLIC_SENTRY_ENABLED: "false",
			NEXT_PUBLIC_SITE_URL: "https://spendly.example.com",
			SENTRY_AUTH_TOKEN: "",
		},
		reuseExistingServer: false,
		timeout: 60_000,
		url: "http://localhost:3100/docs/cli",
	},
	workers: 2,
});
