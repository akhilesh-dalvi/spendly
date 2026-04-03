import type { Metadata, Route } from "next";
import Link from "next/link";
import FooterSection from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createMarketingMetadata } from "@/lib/seo";

const termsDescription =
	"Read the basic terms for using Spendly, including acceptable use, account responsibility, availability, and updates.";

export const metadata: Metadata = createMarketingMetadata({
	title: "Terms of Service",
	description: termsDescription,
	path: "/terms",
});

const termsSections = [
	{
		title: "1. Using Spendly",
		body: "Spendly is provided to help you track expenses, organize cycles, and review spending data. You agree to use the app lawfully and not interfere with the service or other users.",
	},
	{
		title: "2. Your account and data",
		body: "You are responsible for the accuracy of the information you add and for keeping access to your account secure. You should not share account access in ways that create risk for you or others.",
	},
	{
		title: "3. Availability and changes",
		body: "The service may evolve over time. Features may be improved, adjusted, or removed as the product develops. Reasonable effort can be made to keep the app available, but uninterrupted service is not guaranteed.",
	},
	{
		title: "4. Responsible use",
		body: "You may not use Spendly to upload malicious content, attempt unauthorized access, scrape private information, or abuse the product in ways that damage reliability or safety.",
	},
	{
		title: "5. No financial advice",
		body: "Spendly is a tool for organizing and reviewing spending information. It does not provide financial, tax, legal, or investment advice, and you remain responsible for your own decisions.",
	},
	{
		title: "6. Updates to these terms",
		body: "These terms can be updated as the product changes. Continued use of Spendly after material updates means you accept the revised terms.",
	},
] as const;

export default function TermsPage() {
	const pricingHref = "/pricing" as Route;
	const aboutHref = "/about" as Route;

	return (
		<main className="flex-1">
			<section className="border-b">
				<div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16 md:py-24">
					<Badge className="w-fit rounded-full px-3 py-1" variant="outline">
						Terms of Service
					</Badge>
					<div className="flex flex-col gap-4">
						<h1 className="text-balance font-semibold text-4xl tracking-tight md:text-6xl">
							Simple terms for using Spendly.
						</h1>
						<p className="max-w-3xl text-balance text-base text-muted-foreground md:text-lg">
							This page explains the basic expectations around using the app. It
							is written to be readable, not intimidating.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Button asChild size="lg" variant="outline">
							<Link href={pricingHref}>View Pricing</Link>
						</Button>
						<Button asChild size="lg" variant="ghost">
							<Link href={aboutHref}>Read About Spendly</Link>
						</Button>
					</div>
				</div>
			</section>

			<section className="py-16 md:py-20">
				<div className="mx-auto max-w-4xl px-6">
					<div className="space-y-10">
						{termsSections.map((section) => (
							<section className="space-y-3" key={section.title}>
								<h2 className="font-semibold text-2xl tracking-tight">
									{section.title}
								</h2>
								<p className="text-muted-foreground text-sm leading-7 md:text-base">
									{section.body}
								</p>
							</section>
						))}
					</div>
				</div>
			</section>

			<FooterSection />
		</main>
	);
}
