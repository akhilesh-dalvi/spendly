import { SignedIn, SignedOut } from "@clerk/nextjs";
import type { Metadata, Route } from "next";
import Link from "next/link";
import FooterSection from "@/components/footer";
import Pricing from "@/components/pricing";
import { Button } from "@/components/ui/button";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const pricingDescription =
	"All current Spendly web and CLI features are free, including expense tracking, optional spending plans, editable expense history, and cycle comparisons.";

export const metadata: Metadata = createMarketingMetadata({
	description: pricingDescription,
	path: "/pricing",
	title: "Pricing",
});

const pricingStructuredData = createSoftwareApplicationJsonLd({
	description: pricingDescription,
	featureList: [
		"Expense tracking with flexible cycles",
		"Editable expense history",
		"Optional planned amounts per category and cycle",
		"Side-by-side comparison of 2-5 cycles",
	],
	path: "/pricing",
});

function PricingActions() {
	return (
		<div className="flex flex-wrap gap-3">
			<SignedOut>
				<Button asChild size="lg">
					<Link href={"/sign-up" as Route}>Sign up</Link>
				</Button>
				<Button asChild size="lg" variant="outline">
					<Link href={"/sign-in" as Route}>Sign in</Link>
				</Button>
			</SignedOut>
			<SignedIn>
				<Button asChild size="lg">
					<Link href={"/dashboard" as Route}>Go to Dashboard</Link>
				</Button>
			</SignedIn>
		</div>
	);
}

export default function PricingPage() {
	return (
		<>
			<main className="flex-1" id="main-content">
				<section aria-labelledby="pricing-title" className="border-b">
					<div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 md:py-24">
						<h1
							className="max-w-4xl text-balance font-semibold text-4xl tracking-tight md:text-6xl"
							id="pricing-title"
						>
							Spendly is free to use.
						</h1>
						<p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
							All current web and CLI features are free. Track expenses, add
							optional spending plans, and compare cycles - date ranges you
							choose.
						</p>
						<p className="max-w-2xl text-muted-foreground">
							Prefer the terminal? Explore the{" "}
							<Link
								className="underline underline-offset-4"
								href={"/docs/cli" as Route}
							>
								Spendly CLI
							</Link>
							.
						</p>
						<PricingActions />
					</div>
				</section>

				<Pricing />

				<section
					aria-labelledby="pricing-setup-title"
					className="border-t bg-muted/20"
				>
					<div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 md:py-20">
						<h2
							className="font-semibold text-3xl tracking-tight"
							id="pricing-setup-title"
						>
							Start with a cycle
						</h2>
						<p className="max-w-2xl text-pretty text-muted-foreground leading-relaxed">
							In the web app, create a cycle covering your expense date, then
							add an expense with a positive amount. Categories, tags, notes,
							and planned amounts are optional.
						</p>
						<p className="max-w-2xl text-pretty text-muted-foreground leading-relaxed">
							Cycles cannot overlap, and the end date is not included.
						</p>
						<PricingActions />
						<Link
							className="w-fit underline underline-offset-4"
							href="/features"
						>
							Explore features
						</Link>
					</div>
				</section>
				<FooterSection />
			</main>
			<script type="application/ld+json">
				{JSON.stringify(pricingStructuredData).replace(/</g, "\\u003c")}
			</script>
		</>
	);
}
