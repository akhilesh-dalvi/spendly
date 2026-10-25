import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: { jsx: "automatic" },
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		environment: "node",
		setupFiles: ["./test/setup.ts"],
		env: {
			NEXT_PUBLIC_CONVEX_URL: "https://ci-placeholder.convex.cloud",
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
			NEXT_PUBLIC_SITE_URL: "https://spendly.example.com",
		},
		include: ["src/**/*.test.{ts,tsx}"],
		coverage: {
			provider: "v8",
			reportOnFailure: true,
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
			reporter: ["text", "json-summary", "html"],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 60,
				lines: 70,
				"src/lib/**/*.ts": {
					statements: 70,
					branches: 75,
					functions: 70,
					lines: 70,
				},
				"src/components/compare/utils.ts": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
			},
		},
	},
});
