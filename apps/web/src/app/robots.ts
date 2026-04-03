import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
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
			},
		],
		sitemap: absoluteUrl("/sitemap.xml"),
		host: absoluteUrl("/"),
	};
}
