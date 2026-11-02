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
			name: "firefox",
			grep: compatibility,
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			grep: compatibility,
			use: { ...devices["Desktop Safari"] },
		},
		{
			name: "narrow-chromium",
			grep: compatibility,
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 390, height: 844 },
			},
		}
	);
}

export default defineConfig({
	testDir: "./web",
	testMatch: "**/*.spec.ts",
	globalSetup: "./src/playwright-setup.ts",
	fullyParallel: false,
	workers: 1,
	forbidOnly: true,
	retries: 0,
	timeout: 120_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],
	outputDir: ".e2e/results",
	use: {
		baseURL: config.baseUrl,
		timezoneId: "UTC",
		trace: "off",
		screenshot: "off",
		video: "off",
	},
	projects,
	webServer: {
		command: "pnpm --dir ../../apps/web dev",
		url: `${config.baseUrl}/sign-in`,
		env: webEnvironment(config),
		reuseExistingServer: false,
		timeout: 120_000,
		stdout: "ignore",
		stderr: "ignore",
	},
});
