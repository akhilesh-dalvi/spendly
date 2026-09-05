import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { cliDocsLayoutOptions } from "@/lib/docs/layout";
import { cliDocsSource } from "@/lib/docs/source";

export default function CliDocsLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<DocsLayout
			{...cliDocsLayoutOptions}
			sidebar={{ defaultOpenLevel: 1, prefetch: false }}
			tree={cliDocsSource.pageTree}
		>
			{children}
		</DocsLayout>
	);
}
