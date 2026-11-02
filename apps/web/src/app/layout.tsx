import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";
import {
	DEFAULT_DESCRIPTION,
	marketingRobots,
	SITE_NAME,
	siteUrl,
} from "@/lib/seo";

const geistSans = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
});

export const metadata: Metadata = {
	applicationName: SITE_NAME,
	description: DEFAULT_DESCRIPTION,
	icons: {
		apple: [
			{
				sizes: "180x180",
				type: "image/png",
				url: "/favicon/apple-touch-icon.png",
			},
		],
		icon: [
			{ url: "/favicon.ico" },
			{ sizes: "16x16", type: "image/png", url: "/favicon/favicon-16x16.png" },
			{ sizes: "32x32", type: "image/png", url: "/favicon/favicon-32x32.png" },
		],
	},
	manifest: "/manifest.webmanifest",
	metadataBase: siteUrl,
	openGraph: {
		description: DEFAULT_DESCRIPTION,
		siteName: SITE_NAME,
		title: SITE_NAME,
		type: "website",
		url: siteUrl,
	},
	robots: marketingRobots,
	title: SITE_NAME,
	twitter: {
		card: "summary_large_image",
		description: DEFAULT_DESCRIPTION,
		title: SITE_NAME,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ClerkProvider>
			<html
				className={`${geistSans.variable} ${geistMono.variable}`}
				lang="en"
				suppressHydrationWarning
			>
				<body className="antialiased">
					<Providers>{children}</Providers>
				</body>
			</html>
		</ClerkProvider>
	);
}
