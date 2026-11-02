import { defineConfig } from "vitest/config";
import { loadEnvironment } from "./src/environment.ts";

loadEnvironment();

export default defineConfig({
	test: {
		environment: "node",
		include: ["cli/**/*.e2e.ts"],
		exclude: ["src/**", "web/**", ".e2e/**"],
		allowOnly: false,
		globalSetup: ["./src/vitest-setup.ts"],
		fileParallelism: false,
		maxWorkers: 1,
		testTimeout: 120_000,
		hookTimeout: 120_000,
		retry: 0,
		reporters: ["default"],
	},
});
