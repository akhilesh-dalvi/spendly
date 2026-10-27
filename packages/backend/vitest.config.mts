import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: [
				"convex/**/*.test.ts",
				"convex/_generated/**",
				"convex/test.setup.ts",
			],
			include: ["convex/**/*.ts"],
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			reportOnFailure: true,
			thresholds: {
				branches: 75,
				"convex/aggregations.ts": {
					branches: 95,
					functions: 100,
					lines: 100,
					statements: 100,
				},
				"convex/domain/**/*.ts": {
					branches: 80,
					functions: 100,
					lines: 90,
					statements: 90,
				},
				functions: 81.3,
				lines: 82.6,
				statements: 82.4,
			},
		},
		environment: "edge-runtime",
		include: ["convex/**/*.test.ts"],
	},
});
