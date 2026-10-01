import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";

export default function DocumentationLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<RootProvider
			search={{ options: { api: "/api/docs/search" } }}
			theme={{ enabled: false }}
		>
			{children}
		</RootProvider>
	);
}
