import type { Metadata } from "next";
import Link from "next/link";
import FooterSection from "@/components/footer";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";
import { faqPageGroups } from "./faq-page-data";

const faqsDescription =
	"Get practical answers about Spendly setup, cycle dates, optional planning, categories, tags, editable expense history, and comparing cycles.";

export const metadata: Metadata = createMarketingMetadata({
	description: faqsDescription,
	path: "/faqs",
	title: "FAQs",
});

const faqStructuredData = {
	"@context": "https://schema.org",
	"@type": "FAQPage",
	mainEntity: faqPageGroups.flatMap((group) =>
		group.items.map((item) => ({
			"@type": "Question",
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
			name: item.question,
		}))
	),
};

const productStructuredData = createSoftwareApplicationJsonLd({
	description: faqsDescription,
	featureList: [
		"Flexible, non-overlapping cycles with an exclusive end date",
		"Optional planned amounts per category, without spending blocks",
		"Editable past expenses and cycles",
		"Side-by-side comparison of 2-5 cycles",
	],
	path: "/faqs",
});

export default function FaqsPage() {
	return (
		<>
			<main className="flex-1" id="main-content">
				<div className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-16 md:py-24">
					<header className="flex flex-col gap-6">
						<h1 className="text-balance font-semibold text-4xl tracking-tight md:text-6xl">
							Frequently asked questions
						</h1>
						<p className="max-w-2xl text-base text-muted-foreground md:text-lg">
							How to get started, choose cycle dates, and make sense of your
							spending.
						</p>
						<nav aria-label="FAQ topics">
							<ul className="flex flex-wrap gap-x-6 gap-y-3">
								{faqPageGroups.map((group) => (
									<li key={group.id}>
										<a
											className="text-primary underline underline-offset-4"
											href={`#${group.id}`}
										>
											{group.title}
										</a>
									</li>
								))}
							</ul>
						</nav>
					</header>

					{faqPageGroups.map((group) => (
						<section
							aria-labelledby={`${group.id}-heading`}
							className="scroll-mt-24"
							id={group.id}
							key={group.id}
						>
							<h2
								className="mb-4 font-semibold text-2xl"
								id={`${group.id}-heading`}
							>
								{group.title}
							</h2>
							{group.id === "using-ai" ? (
								<p className="mb-4">
									<Link
										className="text-primary underline underline-offset-4"
										href="/docs/cli/ai-agents"
									>
										Set up the CLI and Spendly skill
									</Link>
								</p>
							) : null}
							<Accordion collapsible type="single">
								{group.items.map((item) => (
									<AccordionItem key={item.id} value={item.id}>
										<AccordionTrigger>{item.question}</AccordionTrigger>
										<AccordionContent>
											{item.steps ? (
												<ol className="flex list-decimal flex-col gap-2 pl-5 leading-relaxed">
													{item.steps.map((step) => (
														<li key={step.text}>
															{step.href ? (
																<a
																	className="text-primary underline underline-offset-4"
																	href={step.href}
																>
																	{step.text}
																</a>
															) : (
																step.text
															)}
														</li>
													))}
												</ol>
											) : (
												<p className="leading-relaxed">{item.answer}</p>
											)}
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						</section>
					))}

					<section
						aria-labelledby="more-help-heading"
						className="flex flex-col gap-4 rounded-2xl border bg-muted/20 p-6 md:p-8"
					>
						<h2 className="font-semibold text-2xl" id="more-help-heading">
							Still have a question?
						</h2>
						<ul className="flex list-disc flex-col gap-3 pl-5 text-muted-foreground">
							<li>
								Want to understand a feature?{" "}
								<Link
									className="text-primary underline underline-offset-4"
									href="/features"
								>
									Explore features
								</Link>{" "}
								for examples and a product overview.
							</li>
							<li>
								Something not working? Visit the{" "}
								<a
									className="text-primary underline underline-offset-4"
									href="https://github.com/akhilesh-dalvi/spendly"
								>
									GitHub repository
								</a>{" "}
								and open Issues. Check for an existing report before creating a
								new one. Include the steps you tried, what you expected, and
								what happened instead.
							</li>
						</ul>
						<p className="text-muted-foreground text-sm">
							Bug reports are public. Please leave out personal financial
							details and credentials.
						</p>
					</section>
				</div>
				<FooterSection />
			</main>
			<script type="application/ld+json">
				{JSON.stringify(faqStructuredData)}
			</script>
			<script type="application/ld+json">
				{JSON.stringify(productStructuredData)}
			</script>
		</>
	);
}
