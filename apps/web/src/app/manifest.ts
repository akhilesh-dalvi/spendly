import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		background_color: "#ffffff",
		description:
			"Flexible expense tracking for real-life cycles, optional planning, and calmer comparison.",
		display: "standalone",
		icons: [
			{
				sizes: "192x192",
				src: "/favicon/android-chrome-192x192.png",
				type: "image/png",
			},
			{
				sizes: "512x512",
				src: "/favicon/android-chrome-512x512.png",
				type: "image/png",
			},
		],
		name: "Spendly",
		short_name: "Spendly",
		start_url: "/",
		theme_color: "#000000",
	};
}
