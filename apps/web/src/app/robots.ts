import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
	return {
		host: absoluteUrl("/"),
		rules: [
			{
				allow: ["/", "/features"],
				disallow: [
					"/dashboard",
					"/expenses",
					"/cycles",
					"/compare",
					"/settings",
					"/onboarding",
					"/sign-in",
					"/sign-up",
					"/api",
				],
				userAgent: "*",
			},
		],
		sitemap: absoluteUrl("/sitemap.xml"),
	};
}
