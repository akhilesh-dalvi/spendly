import { SignedIn, SignedOut } from "@clerk/nextjs";
import type { Metadata, Route } from "next";
import Link from "next/link";
import CallToAction from "@/components/call-to-action";
import FooterSection from "@/components/footer";
import { Button } from "@/components/ui/button";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const featuresDescription =
	"Record expenses in the app or CLI, choose date ranges that fit your life, add optional spending plans, compare 2-5 cycles, and correct past entries.";

export const metadata: Metadata = createMarketingMetadata({
	description: featuresDescription,
	path: "/features",
	title: "Features",
});

const coreTerms = [
	{
		description:
			"A date range for reviewing spending, such as a month, pay period, or trip.",
		name: "Cycle",
	},
	{
		description:
			"Something you spent money on, like groceries or a taxi ride. Enter how much you spent and when. Add a note if useful.",
		name: "Expense",
	},
	{
		description:
			"A group of similar expenses within a cycle, such as Groceries, Rent, Dining out, or Gifts.",
		name: "Category",
	},
	{
		description:
			"Group Groceries and Rent under Needs, or Dining out and Gifts under Wants. You choose the names; Savings is also a label, not a savings-tracking feature.",
		name: "Category type",
	},
	{
		description:
			"A label for related expenses across categories. A birthday tag could connect a gift, dinner, and taxi ride.",
		name: "Tag",
	},
	{
		description: "What you expect to spend in a category for that cycle.",
		name: "Planned amount",
	},
] as const;

const featureSections = [
	{
		description:
			"Filter by category or tag to find related purchases without searching through every expense. Review groceries on their own, or bring the costs of a birthday together.",
		title: "Find the purchases you want to review",
	},
	{
		description:
			"See how much you spent against each category's planned amount. You can keep adding expenses even if spending goes over your plan.",
		title: "Compare plans with actual spending",
	},
	{
		description:
			"Compare 2-5 cycles side by side, including totals and spending by category. Check this month against last month, or compare two trips before planning your next one.",
		title: "See what changed between date ranges",
	},
	{
		description:
			"Correct amounts, dates, categories, tags, and notes - even after a cycle ends. When changing a date in the app, choose one covered by a cycle.",
		title: "Keep past expenses accurate",
	},
] as const;

const cycleExamples = [
	{
		description:
			"Start on the first day of the month and set the end date to the first day of the next month.",
		title: "A calendar month",
	},
	{
		description: "Start on payday and set the end date to your next payday.",
		title: "A pay period",
	},
	{
		description:
			"Start on your departure date and set the end date to the day after you return.",
		title: "A trip",
	},
] as const;

const featuresStructuredData = createSoftwareApplicationJsonLd({
	description: featuresDescription,
	featureList: [
		"Expense entry in the app and CLI",
		"Custom date ranges called cycles",
		"Optional categories, category types, tags, notes, and planned amounts",
		"Side-by-side comparison of 2-5 cycles",
		"Editable past expenses",
	],
	path: "/features",
});

export default function FeaturesPage() {
	const signUpHref = "/sign-up" as Route;
	const signInHref = "/sign-in" as Route;
	const dashboardHref = "/dashboard" as Route;
	const faqsHref = "/faqs" as Route;
	const cliDocsHref = "/docs/cli" as Route;

	return (
		<>
			<main className="flex-1" id="main-content">
				<section aria-labelledby="features-heading" className="border-b">
					<div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:py-24 lg:grid-cols-2 lg:gap-16">
						<div className="flex flex-col gap-6">
							<h1
								className="text-balance font-semibold text-4xl tracking-tight md:text-6xl"
								id="features-heading"
							>
								Record expenses. See what changed.
							</h1>
							<p className="text-lg text-muted-foreground leading-relaxed">
								Spendly groups your expenses into cycles - date ranges you
								choose. See where your money went in each range and compare
								spending over time.
							</p>
							<p className="text-muted-foreground leading-relaxed">
								In the app, create a cycle covering your expense date, then
								enter a positive amount and date to save an expense. You can
								also add expenses with the{" "}
								<Link
									className="underline underline-offset-4"
									href={cliDocsHref}
								>
									Spendly CLI
								</Link>
								.
							</p>
							<div className="flex flex-wrap gap-3">
								<SignedOut>
									<Button asChild size="lg">
										<Link href={signUpHref}>Sign up</Link>
									</Button>
									<Button asChild size="lg" variant="outline">
										<Link href={signInHref}>Sign in</Link>
									</Button>
								</SignedOut>
								<SignedIn>
									<Button asChild size="lg">
										<Link href={dashboardHref}>Go to Dashboard</Link>
									</Button>
								</SignedIn>
								<Button asChild size="lg" variant="ghost">
									<Link href={faqsHref}>Read FAQs</Link>
								</Button>
							</div>
						</div>

						<div className="rounded-2xl border bg-muted/30 p-6 md:p-8">
							<h2 className="font-semibold text-2xl tracking-tight">
								Choose dates that fit your life
							</h2>
							<ul className="mt-6 flex flex-col gap-6">
								{cycleExamples.map((example) => (
									<li className="flex flex-col gap-1" key={example.title}>
										<h3 className="font-medium">{example.title}</h3>
										<p className="text-muted-foreground leading-relaxed">
											{example.description}
										</p>
									</li>
								))}
							</ul>
							<p className="mt-6 text-muted-foreground leading-relaxed">
								The end date is not included. Cycles cannot overlap, so use a
								tag for a trip within an existing cycle.
							</p>
						</div>
					</div>
				</section>

				<section
					aria-labelledby="terms-heading"
					className="border-b py-16 md:py-20"
				>
					<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6">
						<div className="flex max-w-3xl flex-col gap-4">
							<h2
								className="text-balance font-semibold text-3xl tracking-tight md:text-4xl"
								id="terms-heading"
							>
								A few names you'll see in Spendly
							</h2>
							<p className="text-muted-foreground leading-relaxed">
								Categories, category types, tags, notes, and planned amounts are
								optional. Use only what helps you.
							</p>
						</div>
						<dl className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
							{coreTerms.map((term) => (
								<div className="flex flex-col gap-2" key={term.name}>
									<dt className="font-semibold text-xl">{term.name}</dt>
									<dd className="text-muted-foreground leading-relaxed">
										{term.description}
									</dd>
								</div>
							))}
						</dl>
					</div>
				</section>

				<section aria-labelledby="review-heading" className="py-16 md:py-20">
					<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6">
						<h2
							className="text-balance font-semibold text-3xl tracking-tight md:text-4xl"
							id="review-heading"
						>
							Make your spending easier to review
						</h2>
						<div className="grid gap-8 md:grid-cols-2 md:gap-12">
							{featureSections.map((section) => (
								<div className="flex flex-col gap-3" key={section.title}>
									<h3 className="font-semibold text-xl tracking-tight">
										{section.title}
									</h3>
									<p className="text-muted-foreground leading-relaxed">
										{section.description}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section aria-labelledby="focus-heading" className="border-y py-12">
					<div className="mx-auto grid max-w-6xl gap-4 px-6 md:grid-cols-[1fr_2fr] md:gap-12">
						<h2
							className="font-semibold text-2xl tracking-tight"
							id="focus-heading"
						>
							A focus on expenses
						</h2>
						<p className="max-w-2xl text-muted-foreground leading-relaxed">
							Spendly is built around the spending you record in the app or CLI,
							rather than bank imports or income tracking. You choose which
							purchases to record and how much detail to add.
						</p>
					</div>
				</section>

				<CallToAction
					description="Add your first expense and build a clearer picture of your spending as you go."
					title="Start with one expense"
				/>
				<FooterSection />
			</main>
			<script type="application/ld+json">
				{JSON.stringify(featuresStructuredData)}
			</script>
		</>
	);
}
