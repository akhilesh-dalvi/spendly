import type { Metadata, Route } from "next";
import Link from "next/link";
import CallToAction from "@/components/call-to-action";
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
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const aboutDescription =
	"Learn what Spendly is for, why it stays flexible, and how it approaches expense tracking without rigid budgeting pressure.";

export const metadata: Metadata = createMarketingMetadata({
	title: "About",
	description: aboutDescription,
	path: "/about",
});

const aboutStructuredData = createSoftwareApplicationJsonLd({
	description: aboutDescription,
	path: "/about",
	featureList: [
		"Flexible cycles that match real timelines",
		"Optional planning without rigid budget rules",
		"Editable history that stays useful over time",
		"Comparison tools for calm financial review",
	],
});

const principles = [
	{
		title: "Built around real cycles",
		description:
			"Not everyone reviews money by calendar month. Spendly supports pay periods, trips, semesters, and custom date ranges.",
	},
	{
		title: "Planning is optional",
		description:
			"You can set planned amounts when they help and skip them when they do not. The tool stays useful either way.",
	},
	{
		title: "History stays editable",
		description:
			"Expense records are only helpful if they can be corrected later. Spendly keeps that door open.",
	},
] as const;

const whoItsFor = [
	"People who dislike rigid budgeting apps",
	"Anyone whose spending rhythm does not fit calendar months",
	"Users who want observation and clarity more than enforcement",
] as const;

export default function AboutPage() {
	const featuresHref = "/features" as Route;
	const pricingHref = "/pricing" as Route;

	return (
		<>
			<main className="flex-1" id="main-content">
				<section className="border-b">
					<div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 md:py-24">
						<div className="flex max-w-4xl flex-col gap-6">
							<Badge className="rounded-full px-3 py-1" variant="outline">
								About Spendly
							</Badge>
							<div className="flex flex-col gap-4">
								<h1 className="max-w-4xl text-balance font-semibold text-4xl tracking-tight md:text-6xl">
									Spendly is built for people who want calmer expense tracking.
								</h1>
								<p className="max-w-3xl text-balance text-base text-muted-foreground md:text-lg">
									It is an expense tracker for real-life rhythms: flexible
									cycles, optional planning, editable history, and comparison
									tools that help you observe patterns without turning money
									into punishment.
								</p>
							</div>
							<div className="flex flex-wrap gap-3">
								<Button asChild size="lg">
									<Link href={pricingHref}>See Pricing</Link>
								</Button>
								<Button asChild size="lg" variant="outline">
									<Link href={featuresHref}>Explore Features</Link>
								</Button>
							</div>
						</div>

						<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
							<Card className="border-border/70 bg-muted/20">
								<CardHeader>
									<CardTitle className="text-2xl">Why it exists</CardTitle>
									<CardDescription className="text-sm md:text-base">
										Many budgeting tools assume one monthly cycle, one right way
										to plan, and one fixed truth about past records. Spendly
										takes the opposite approach.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4 text-muted-foreground text-sm md:text-base">
									<p>
										Your system can be simple, structured, experimental, or
										still-evolving. Spendly is designed to support that reality.
									</p>
									<p>
										The goal is clarity, not guilt. You should be able to see
										what happened, adjust what was recorded, and compare cycles
										without being pushed into a rigid framework.
									</p>
								</CardContent>
							</Card>

							<Card className="border-border/70">
								<CardHeader>
									<CardTitle className="text-2xl">Who it helps most</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3 text-muted-foreground text-sm md:text-base">
									{whoItsFor.map((item) => (
										<p key={item}>{item}</p>
									))}
								</CardContent>
							</Card>
						</div>
					</div>
				</section>

				<section className="border-b">
					<div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
						{principles.map((principle) => (
							<Card className="border-border/70" key={principle.title}>
								<CardHeader>
									<CardTitle className="text-xl">{principle.title}</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground text-sm md:text-base">
										{principle.description}
									</p>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				<CallToAction />
				<FooterSection />
			</main>
			<script type="application/ld+json">
				{JSON.stringify(aboutStructuredData)}
			</script>
		</>
	);
}
