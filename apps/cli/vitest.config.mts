import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.d.ts",
				"src/auth/keychain-smoke.ts",
			],
			include: ["src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			reportOnFailure: true,
			thresholds: {
				branches: 80,
				functions: 86.1,
				lines: 83.9,
				"src/commands/auth-actions.ts": {
					branches: 90,
					functions: 85,
					lines: 90,
					statements: 90,
				},
				statements: 85,
			},
		},
		environment: "node",
	},
});
