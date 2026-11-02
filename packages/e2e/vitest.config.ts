import { defineConfig } from "vitest/config";

export default defineConfig({
	// An allowlist, not a broad glob: ordinary tests must never collect live specs.
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		exclude: ["cli/**", "web/**", ".e2e/**"],
		allowOnly: false,
	},
});
