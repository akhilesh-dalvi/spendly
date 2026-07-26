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
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	metadataBase: siteUrl,
	applicationName: SITE_NAME,
	title: SITE_NAME,
	description: DEFAULT_DESCRIPTION,
	manifest: "/manifest.webmanifest",
	icons: {
		icon: [
			{ url: "/favicon.ico" },
			{ url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
			{ url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
		],
		apple: [
			{
				url: "/favicon/apple-touch-icon.png",
				sizes: "180x180",
				type: "image/png",
			},
		],
	},
	openGraph: {
		title: SITE_NAME,
		description: DEFAULT_DESCRIPTION,
		type: "website",
		url: siteUrl,
		siteName: SITE_NAME,
	},
	twitter: {
		card: "summary_large_image",
		title: SITE_NAME,
		description: DEFAULT_DESCRIPTION,
	},
	robots: marketingRobots,
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
