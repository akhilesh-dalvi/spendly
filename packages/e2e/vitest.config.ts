import { defineConfig } from "vitest/config";

export default defineConfig({
	// An allowlist, not a broad glob: ordinary tests must never collect live specs.
	test: {
		allowOnly: false,
		environment: "node",
		exclude: ["cli/**", "web/**", ".e2e/**"],
		include: ["src/**/*.test.ts"],
	},
});
