import { SignedIn, SignedOut } from "@clerk/nextjs";
import type { Metadata, Route } from "next";
import Link from "next/link";
import CallToAction from "@/components/call-to-action";
import FooterSection from "@/components/footer";
import Pricing from "@/components/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const pricingDescription =
	"Spendly pricing is simple: the product is free to use, with optional future donation channels for people who want to support development.";

export const metadata: Metadata = createMarketingMetadata({
	title: "Pricing",
	description: pricingDescription,
	path: "/pricing",
});

const pricingStructuredData = createSoftwareApplicationJsonLd({
	description: pricingDescription,
	path: "/pricing",
	featureList: [
		"Free expense tracking with flexible cycles",
		"Optional planning and comparison without premium tiers",
		"Potential donation support through common creator platforms",
		"No required subscription to use core features",
	],
});

const donationWays = [
	{
		title: "Recurring support",
		description:
			"GitHub Sponsors works well when people want to fund ongoing maintenance in a familiar developer-friendly way.",
	},
	{
		title: "One-time tips",
		description:
			"Buy Me a Coffee and Ko-fi are simple choices for casual support without creating a subscription commitment.",
	},
	{
		title: "Direct payments",
		description:
			"UPI, PayPal, or Stripe payment links can be offered for direct donations when the project owner is ready.",
	},
] as const;

export default function PricingPage() {
	const signUpHref = "/sign-up" as Route;
	const dashboardHref = "/dashboard" as Route;
	const aboutHref = "/about" as Route;

	return (
		<>
			<main className="flex-1">
				<section className="border-b">
					<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 md:py-24">
						<div className="flex max-w-4xl flex-col gap-6">
							<Badge className="rounded-full px-3 py-1" variant="outline">
								Pricing
							</Badge>
							<div className="flex flex-col gap-4">
								<h1 className="max-w-4xl text-balance font-semibold text-4xl tracking-tight md:text-6xl">
									Spendly is free to use.
								</h1>
								<p className="max-w-3xl text-balance text-base text-muted-foreground md:text-lg">
									There are no paid tiers on this page. The product experience
									is free, and any future support model can stay optional for
									people who simply want to help fund development.
								</p>
							</div>
							<div className="flex flex-wrap gap-3">
								<SignedOut>
									<Button asChild size="lg">
										<Link href={signUpHref}>Get Started Free</Link>
									</Button>
								</SignedOut>
								<SignedIn>
									<Button asChild size="lg">
										<Link href={dashboardHref}>Go to Dashboard</Link>
									</Button>
								</SignedIn>
								<Button asChild size="lg" variant="outline">
									<Link href={aboutHref}>Why it is built this way</Link>
								</Button>
							</div>
						</div>

						<div className="grid gap-6 md:grid-cols-3">
							{[
								{
									title: "Price",
									value: "Free",
									description: "No subscription required to use the product.",
								},
								{
									title: "Upgrade pressure",
									value: "None",
									description:
										"Core tracking, planning, and comparison stay available.",
								},
								{
									title: "Support model",
									value: "Optional",
									description:
										"Donations can exist later without changing access.",
								},
							].map((item) => (
								<Card className="border-border/70 bg-muted/20" key={item.title}>
									<CardHeader>
										<CardDescription>{item.title}</CardDescription>
										<CardTitle className="text-3xl">{item.value}</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-muted-foreground text-sm md:text-base">
											{item.description}
										</p>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				</section>

				<Pricing />

				<section className="border-t">
					<div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
						<div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
							<Card className="border-border/70 bg-muted/20">
								<CardHeader>
									<CardTitle className="text-2xl">Optional donations</CardTitle>
									<CardDescription className="text-sm md:text-base">
										Support should feel generous, not required. If donations are
										added later, they can sit alongside the free product without
										turning into a paywall.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4 text-muted-foreground text-sm md:text-base">
									<p>
										A clean way to present this is to say that Spendly is free,
										and that people who want to support development can choose a
										donation option that suits them.
									</p>
								</CardContent>
							</Card>

							<div className="grid gap-6 md:grid-cols-3">
								{donationWays.map((item) => (
									<Card className="border-border/70" key={item.title}>
										<CardHeader>
											<CardTitle className="text-xl">{item.title}</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm md:text-base">
												{item.description}
											</p>
										</CardContent>
									</Card>
								))}
							</div>
						</div>
					</div>
				</section>

				<CallToAction />
				<FooterSection />
			</main>
			<script type="application/ld+json">
				{JSON.stringify(pricingStructuredData)}
			</script>
		</>
	);
}
