import { SignedIn } from "@clerk/nextjs";
import type { Metadata, Route } from "next";
import Link from "next/link";
import CallToAction from "@/components/call-to-action";
import { faqItems } from "@/components/faq-data";
import FaqSection from "@/components/faq-section";
import FooterSection from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const faqsDescription =
	"Read Spendly FAQs about flexible cycles, optional planning, editable expense history, comparison mode, and how the app works.";

export const metadata: Metadata = createMarketingMetadata({
	title: "FAQs",
	description: faqsDescription,
	path: "/faqs",
});

const faqStructuredData = {
	"@context": "https://schema.org",
	"@type": "FAQPage",
	mainEntity: faqItems.map((item) => ({
		"@type": "Question",
		name: item.question,
		acceptedAnswer: {
			"@type": "Answer",
			text: item.answer,
		},
	})),
};

const productStructuredData = createSoftwareApplicationJsonLd({
	description: faqsDescription,
	path: "/faqs",
	featureList: [
		"Flexible cycles instead of forced calendar months",
		"Optional planned amounts with no hard enforcement",
		"Editable history across past and future cycles",
		"Comparison mode for observational review",
	],
});

export default function FaqsPage() {
	const dashboardHref = "/dashboard" as Route;
	const overviewHref = "/" as Route;
	const featuresHref = "/features" as Route;

	return (
		<>
			<main className="flex-1">
				<section className="border-b">
					<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 md:py-24">
						<div className="flex max-w-3xl flex-col gap-6">
							<Badge className="rounded-full px-3 py-1" variant="outline">
								Support and Product Questions
							</Badge>
							<div className="flex flex-col gap-4">
								<h1 className="max-w-4xl text-balance font-semibold text-4xl tracking-tight md:text-6xl">
									Answers about how Spendly works in real life.
								</h1>
								<p className="max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
									The essentials are here: how cycles work, what planning means,
									what stays editable, and what the app is intentionally not
									trying to do.
								</p>
							</div>
							<div className="flex flex-wrap gap-3">
								<SignedIn>
									<Button asChild size="lg">
										<Link href={dashboardHref}>Go to Dashboard</Link>
									</Button>
								</SignedIn>
								<Button asChild size="lg" variant="outline">
									<Link href={overviewHref}>Back to Overview</Link>
								</Button>
								<Button asChild size="lg" variant="ghost">
									<Link href={featuresHref}>See Features</Link>
								</Button>
							</div>
						</div>

						<Card className="max-w-3xl border-border/70 bg-muted/20">
							<CardHeader>
								<CardTitle className="text-xl">
									A quick way to use this page
								</CardTitle>
								<CardDescription>
									Start with the questions below if you are deciding whether
									Spendly fits your workflow.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								{[
									"Check cycles if calendar months do not match your life.",
									"Check planning if you want tracking without rigid budgets.",
									"Check editability if you often fix records after the fact.",
								].map((item, index) => (
									<div className="flex flex-col gap-4" key={item}>
										<div className="flex items-start gap-3">
											<Badge className="rounded-full" variant="outline">
												0{index + 1}
											</Badge>
											<p className="text-muted-foreground text-sm">{item}</p>
										</div>
										{index < 2 ? <Separator /> : null}
									</div>
								))}
							</CardContent>
						</Card>
					</div>
				</section>

				<FaqSection
					description="Short answers to the questions people usually ask before they start using Spendly."
					id="faq-page"
					showSupportText={false}
					title="Frequently Asked Questions"
				/>
				<CallToAction />
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
