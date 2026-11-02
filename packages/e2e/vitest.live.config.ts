import { defineConfig } from "vitest/config";
import { loadEnvironment } from "./src/environment.ts";

loadEnvironment();

export default defineConfig({
	test: {
		allowOnly: false,
		environment: "node",
		exclude: ["src/**", "web/**", ".e2e/**"],
		fileParallelism: false,
		globalSetup: ["./src/vitest-setup.ts"],
		hookTimeout: 120_000,
		include: ["cli/**/*.e2e.ts"],
		maxWorkers: 1,
		reporters: ["default"],
		retry: 0,
		testTimeout: 120_000,
	},
});
