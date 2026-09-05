import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/docs/mdx";
import { cliDocsSource } from "@/lib/docs/source";
import { absoluteUrl, createMarketingTitle } from "@/lib/seo";

interface CliDocsPageProps {
	params: Promise<{ slug?: string[] }>;
}

export const generateStaticParams = () => cliDocsSource.generateParams();

export async function generateMetadata({
	params,
}: CliDocsPageProps): Promise<Metadata> {
	const { slug } = await params;
	const page = cliDocsSource.getPage(slug);

	if (!page) {
		notFound();
	}

	const title = createMarketingTitle(`${page.data.title} — CLI docs`);

	return {
		title,
		description: page.data.description,
		alternates: { canonical: absoluteUrl(page.url) },
		openGraph: {
			title,
			description: page.data.description,
			type: "article",
			url: absoluteUrl(page.url),
		},
		twitter: {
			card: "summary",
			title,
			description: page.data.description,
		},
	};
}

export default async function CliDocsPage({ params }: CliDocsPageProps) {
	const { slug } = await params;
	const page = cliDocsSource.getPage(slug);

	if (!page) {
		notFound();
	}

	const MDX = page.data.body;

	return (
		<DocsPage full={page.data.full} toc={page.data.toc}>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<DocsBody>
				<MDX components={getMDXComponents()} />
			</DocsBody>
		</DocsPage>
	);
}
