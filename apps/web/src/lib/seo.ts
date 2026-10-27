import { env } from "@spendly/env/web";
import type { Metadata } from "next";

const LOCAL_SITE_URL = "http://localhost:3001";

export const SITE_NAME = "Spendly";
export const DEFAULT_DESCRIPTION =
	"Track, plan, and compare spending across flexible cycles without judgment, rigid budget rules, or income tracking.";

export const siteUrl = new URL(env.NEXT_PUBLIC_SITE_URL ?? LOCAL_SITE_URL);

export const marketingRobots: NonNullable<Metadata["robots"]> = {
	follow: true,
	googleBot: {
		follow: true,
		index: true,
		"max-image-preview": "large",
		"max-snippet": -1,
		"max-video-preview": -1,
	},
	index: true,
};

export const noIndexRobots: NonNullable<Metadata["robots"]> = {
	follow: false,
	googleBot: {
		follow: false,
		index: false,
		"max-image-preview": "none",
		"max-snippet": 0,
		"max-video-preview": 0,
	},
	index: false,
};

export const absoluteUrl = (path: string): string =>
	new URL(path, siteUrl).toString();

interface MarketingMetadataInput {
	description: string;
	path: string;
	title: string;
}

interface AppMetadataInput {
	title: string;
}

export const createMarketingTitle = (title: string): string => {
	if (title === SITE_NAME) {
		return SITE_NAME;
	}

	return `${SITE_NAME} | ${title}`;
};

const createAppTitle = (title: string): string => `${title} | ${SITE_NAME}`;

export const createAppMetadata = ({ title }: AppMetadataInput): Metadata => ({
	openGraph: {
		title: createAppTitle(title),
	},
	title: createAppTitle(title),
	twitter: {
		title: createAppTitle(title),
	},
});

export const createMarketingMetadata = ({
	description,
	path,
	title,
}: MarketingMetadataInput): Metadata => ({
	alternates: {
		canonical: absoluteUrl(path),
	},
	description,
	openGraph: {
		description,
		siteName: SITE_NAME,
		title: createMarketingTitle(title),
		type: "website",
		url: absoluteUrl(path),
	},
	robots: marketingRobots,
	title: createMarketingTitle(title),
	twitter: {
		card: "summary_large_image",
		description,
		title: createMarketingTitle(title),
	},
});

interface StructuredDataInput {
	description: string;
	featureList: string[];
	path: string;
}

export const createSoftwareApplicationJsonLd = ({
	description,
	featureList,
	path,
}: StructuredDataInput) => ({
	"@context": "https://schema.org",
	"@type": "WebApplication",
	applicationCategory: "FinanceApplication",
	description,
	featureList,
	name: SITE_NAME,
	operatingSystem: "Web",
	url: absoluteUrl(path),
});
