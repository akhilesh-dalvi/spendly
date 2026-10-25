import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		coverage: {
			provider: "v8",
			reportOnFailure: true,
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.d.ts",
				"src/auth/keychain-smoke.ts",
			],
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				statements: 85,
				branches: 80,
				functions: 86.1,
				lines: 83.9,
				"src/commands/auth-actions.ts": {
					statements: 90,
					branches: 90,
					functions: 85,
					lines: 90,
				},
			},
		},
	},
});
