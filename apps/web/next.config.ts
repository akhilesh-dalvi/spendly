import "@spendly/env/web";
import { execFileSync } from "node:child_process";
import { withSentryConfig } from "@sentry/nextjs/config";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { getSentryEnvironment } from "./src/lib/sentry-environment";

const withMDX = createMDX();

function getRelease(): string | undefined {
	const configuredRelease =
		process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
		process.env.SENTRY_RELEASE ||
		process.env.VERCEL_GIT_COMMIT_SHA;
	if (configuredRelease) {
		return configuredRelease;
	}
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		// Source archives can build without Git; configure SENTRY_RELEASE in that case.
		return undefined;
	}
}

const release = getRelease();
const environment = getSentryEnvironment();

const nextConfig: NextConfig = {
	env: {
		NEXT_PUBLIC_SENTRY_DSN:
			process.env.NEXT_PUBLIC_SENTRY_DSN ||
			"https://f8009dfdb2098fccfae1da8c21688312@o4512191993872384.ingest.de.sentry.io/4512198269010000",
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: environment,
		...(release ? { NEXT_PUBLIC_SENTRY_RELEASE: release } : {}),
	},
	typedRoutes: true,
	reactCompiler: true,
	async redirects() {
		return [
			{
				source: "/docs/cli/installation",
				destination: "/docs/cli#install",
				permanent: true,
			},
			{
				source: "/docs/cli/authentication",
				destination: "/docs/cli#sign-in",
				permanent: true,
			},
			{
				source: "/docs/cli/agent-skill",
				destination: "/docs/cli/ai-agents",
				permanent: true,
			},
			{
				source: "/docs/cli/cli-contract",
				destination: "/docs/cli/ai-agents#machine-readable-cli-contract",
				permanent: true,
			},
			{
				source: "/docs/cli/transfers",
				destination: "/docs/cli/accounts#transfer-funds",
				permanent: true,
			},
			{
				source: "/docs/cli/privacy",
				destination:
					"/docs/cli/ai-agents#trusted-computer-and-privacy-boundary",
				permanent: true,
			},
		];
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "ik.imagekit.io",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
		],
	},
};

export default withSentryConfig(withMDX(nextConfig), {
	org: process.env.SENTRY_ORG || "akhilesh-rl",
	project: process.env.SENTRY_PROJECT || "spendly-web",
	authToken: process.env.SENTRY_AUTH_TOKEN,
	silent: !process.env.CI,
	widenClientFileUpload: true,
	sourcemaps: {
		disable: !process.env.SENTRY_AUTH_TOKEN,
		deleteSourcemapsAfterUpload: true,
	},
	release: {
		name: release,
		create: Boolean(process.env.SENTRY_AUTH_TOKEN),
		finalize: Boolean(process.env.SENTRY_AUTH_TOKEN),
	},
});
