import "@spendly/env/web";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const nextConfig: NextConfig = {
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

export default withMDX(nextConfig);
