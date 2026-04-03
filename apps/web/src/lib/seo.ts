import { env } from "@spendly/env/web";
import type { Metadata } from "next";

const LOCAL_SITE_URL = "http://localhost:3001";

export const SITE_NAME = "Spendly";
export const DEFAULT_DESCRIPTION =
	"Track, plan, and compare spending across flexible cycles without judgment, rigid budget rules, or income tracking.";

export const siteUrl = new URL(env.NEXT_PUBLIC_SITE_URL ?? LOCAL_SITE_URL);

export const marketingRobots: NonNullable<Metadata["robots"]> = {
	index: true,
	follow: true,
	googleBot: {
		index: true,
		follow: true,
		"max-image-preview": "large",
		"max-snippet": -1,
		"max-video-preview": -1,
	},
};

export const noIndexRobots: NonNullable<Metadata["robots"]> = {
	index: false,
	follow: false,
	googleBot: {
		index: false,
		follow: false,
		"max-image-preview": "none",
		"max-snippet": 0,
		"max-video-preview": 0,
	},
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

export const createAppTitle = (title: string): string =>
	`${title} | ${SITE_NAME}`;

export const createAppMetadata = ({ title }: AppMetadataInput): Metadata => ({
	title: createAppTitle(title),
	openGraph: {
		title: createAppTitle(title),
	},
	twitter: {
		title: createAppTitle(title),
	},
});

export const createMarketingMetadata = ({
	description,
	path,
	title,
}: MarketingMetadataInput): Metadata => ({
	title: createMarketingTitle(title),
	description,
	alternates: {
		canonical: absoluteUrl(path),
	},
	openGraph: {
		title: createMarketingTitle(title),
		description,
		type: "website",
		url: absoluteUrl(path),
		siteName: SITE_NAME,
	},
	twitter: {
		card: "summary_large_image",
		title: createMarketingTitle(title),
		description,
	},
	robots: marketingRobots,
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
	name: SITE_NAME,
	url: absoluteUrl(path),
	description,
	applicationCategory: "FinanceApplication",
	operatingSystem: "Web",
	featureList,
});
