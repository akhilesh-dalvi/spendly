import type { MetadataRoute } from "next";
import { cliDocsSource } from "@/lib/docs/source";
import { absoluteUrl } from "@/lib/seo";

const publicRoutes = [
	"/",
	"/features",
	"/pricing",
	"/about",
	"/faqs",
	"/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
	const lastModified = new Date();

	const getPriority = (route: (typeof publicRoutes)[number]): number => {
		if (route === "/") {
			return 1;
		}

		if (route === "/pricing" || route === "/about") {
			return 0.9;
		}

		return 0.8;
	};

	const marketingEntries: MetadataRoute.Sitemap = publicRoutes.map((route) => ({
		url: absoluteUrl(route),
		lastModified,
		changeFrequency: route === "/" ? "weekly" : "monthly",
		priority: getPriority(route),
	}));
	const cliDocsEntries: MetadataRoute.Sitemap = cliDocsSource
		.getPages()
		.map((page) => ({
			url: absoluteUrl(page.url),
			lastModified,
			changeFrequency: "monthly",
			priority: page.slugs.length === 0 ? 0.9 : 0.7,
		}));

	return [...marketingEntries, ...cliDocsEntries];
}
