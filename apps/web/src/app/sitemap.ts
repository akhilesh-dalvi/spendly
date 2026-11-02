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
		changeFrequency: route === "/" ? "weekly" : "monthly",
		lastModified,
		priority: getPriority(route),
		url: absoluteUrl(route),
	}));
	const cliDocsEntries: MetadataRoute.Sitemap = cliDocsSource
		.getPages()
		.map((page) => ({
			changeFrequency: "monthly",
			lastModified,
			priority: page.slugs.length === 0 ? 0.9 : 0.7,
			url: absoluteUrl(page.url),
		}));

	return [...marketingEntries, ...cliDocsEntries];
}
