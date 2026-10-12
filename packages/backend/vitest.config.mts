import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "edge-runtime",
		include: ["convex/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reportOnFailure: true,
			include: ["convex/**/*.ts"],
			exclude: [
				"convex/**/*.test.ts",
				"convex/_generated/**",
				"convex/test.setup.ts",
			],
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				statements: 82.4,
				branches: 75,
				functions: 81.3,
				lines: 82.6,
				"convex/domain/**/*.ts": {
					statements: 90,
					branches: 80,
					functions: 100,
					lines: 90,
				},
				"convex/aggregations.ts": {
					statements: 100,
					branches: 95,
					functions: 100,
					lines: 100,
				},
			},
		},
	},
});
