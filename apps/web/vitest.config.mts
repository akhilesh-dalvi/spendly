import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: { jsx: "automatic" },
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		coverage: {
			exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
			include: ["src/**/*.{ts,tsx}"],
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			reportOnFailure: true,
			thresholds: {
				branches: 60,
				functions: 60,
				lines: 70,
				"src/components/compare/utils.ts": {
					branches: 100,
					functions: 100,
					lines: 100,
					statements: 100,
				},
				"src/lib/**/*.ts": {
					branches: 75,
					functions: 70,
					lines: 70,
					statements: 70,
				},
				statements: 70,
			},
		},
		env: {
			NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
			NEXT_PUBLIC_CONVEX_URL: "https://ci-placeholder.convex.cloud",
			NEXT_PUBLIC_SITE_URL: "https://spendly.example.com",
		},
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}"],
		setupFiles: ["./test/setup.ts"],
	},
});
