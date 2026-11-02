import { defineConfig, devices, type Project } from "@playwright/test";
import { loadEnvironment, webEnvironment } from "./src/environment.ts";

const config = loadEnvironment();
const compatibility = /(?:^|\s)@compatibility(?:\s|$)/u;
const projects: Project[] = [
	{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
];
if (process.env.E2E_EXTENDED_BROWSERS === "true") {
	projects.push(
		{
			grep: compatibility,
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			grep: compatibility,
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
		{
			grep: compatibility,
			name: "narrow-chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { height: 844, width: 390 },
			},
		}
	);
}

export default defineConfig({
	expect: { timeout: 15_000 },
	forbidOnly: true,
	fullyParallel: false,
	globalSetup: "./src/playwright-setup.ts",
	outputDir: ".e2e/results",
	projects,
	reporter: [["list"]],
	retries: 0,
	testDir: "./web",
	testMatch: "**/*.spec.ts",
	timeout: 120_000,
	use: {
		baseURL: config.baseUrl,
		screenshot: "off",
		timezoneId: "UTC",
		trace: "off",
		video: "off",
	},
	webServer: {
		command: "pnpm --dir ../../apps/web dev",
		env: webEnvironment(config),
		reuseExistingServer: false,
		stderr: "ignore",
		stdout: "ignore",
		timeout: 120_000,
		url: `${config.baseUrl}/sign-in`,
	},
	workers: 1,
});
