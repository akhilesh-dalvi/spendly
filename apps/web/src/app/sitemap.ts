import type { MetadataRoute } from "next";
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

	return publicRoutes.map((route) => ({
		url: absoluteUrl(route),
		lastModified,
		changeFrequency: route === "/" ? "weekly" : "monthly",
		priority: getPriority(route),
	}));
}
