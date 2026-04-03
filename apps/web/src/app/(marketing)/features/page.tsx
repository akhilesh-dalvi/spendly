import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
	CalendarRange,
	ChartNoAxesColumnIncreasing,
	Edit3,
	FolderKanban,
	Layers3,
	NotebookPen,
	Tags,
} from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const featuresDescription =
	"Explore Spendly features for flexible expense tracking, optional planning, editable history, and cycle comparison built for real-life spending habits.";

export const metadata: Metadata = createMarketingMetadata({
	title: "Features",
	description: featuresDescription,
	path: "/features",
});

const featureSections = [
	{
		title: "Cycles that match your real timeline",
		description: "Use pay periods, trips, semesters, or any custom date range.",
		icon: CalendarRange,
		points: [
			"Custom start and end dates",
			"Works beyond calendar months",
			"Past and future cycles stay editable",
		],
	},
	{
		title: "Planning when it helps, not by default",
		description: "Add plans only when you want more structure.",
		icon: Layers3,
		points: [
			"Track without planned amounts",
			"Set plans per cycle",
			"No hard enforcement",
		],
	},
	{
		title: "History stays accurate because it stays editable",
		description: "Fix records anytime so your history stays useful.",
		icon: Edit3,
		points: [
			"Edit old expenses",
			"Change categories, tags, and amounts",
			"Move entries by updating the date",
		],
	},
] as const;

const workflowItems = [
	{
		name: "Cycle",
		why: "To group spending around your real timeline.",
		how: "Create any date range that matches how you actually review money.",
		icon: CalendarRange,
	},
	{
		name: "Category Type",
		why: "To create broad structure without forcing one system.",
		how: "Use types like essentials, lifestyle, or anything else you prefer.",
		icon: FolderKanban,
	},
	{
		name: "Category",
		why: "To track spending intent inside a cycle.",
		how: "Add categories per cycle with optional planned amounts and reorder them anytime.",
		icon: Layers3,
	},
	{
		name: "Expense",
		why: "To capture the actual spending record.",
		how: "Log amount, date, category, and notes quickly, then edit later if needed.",
		icon: NotebookPen,
	},
	{
		name: "Compare",
		why: "To understand what changed across cycles.",
		how: "Review 2 to 5 cycles side by side and spot movement without judgment.",
		icon: ChartNoAxesColumnIncreasing,
	},
	{
		name: "Tags",
		why: "To add extra context when categories are not enough.",
		how: "Use tags like trip, recurring, gift, or project to filter and review patterns.",
		icon: Tags,
	},
] as const;

const featuresStructuredData = createSoftwareApplicationJsonLd({
	description: featuresDescription,
	path: "/features",
	featureList: [
		"Custom expense cycles with editable history",
		"Optional planned amounts and flexible category structures",
		"Cycle comparison for observational spending review",
		"Fast expense capture with tags and category context",
	],
});

export default function FeaturesPage() {
	const signUpHref = "/sign-up" as Route;
	const dashboardHref = "/dashboard" as Route;
	const overviewHref = "/" as Route;
	const faqsHref = "/faqs" as Route;

	return (
		<>
			<main className="flex-1">
				<section className="relative overflow-hidden border-b">
					<div
						aria-hidden
						className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.08),transparent_60%)]"
					/>
					<div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 md:py-24">
						<div className="flex max-w-4xl flex-col gap-6">
							<Badge className="rounded-full px-3 py-1" variant="outline">
								Product Features
							</Badge>
							<div className="flex flex-col gap-4">
								<h1 className="max-w-4xl text-balance font-semibold text-4xl tracking-tight md:text-6xl">
									Expense tracking designed for observation, not enforcement.
								</h1>
								<p className="max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
									Flexible cycles, optional planning, editable history, and
									comparison tools for real-life spending.
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
									<Link href={overviewHref}>Back to Overview</Link>
								</Button>
								<Button asChild size="lg" variant="ghost">
									<Link href={faqsHref}>Read FAQs</Link>
								</Button>
							</div>
						</div>

						<div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
							<Card className="overflow-hidden border-border/70 bg-card/80">
								<CardHeader className="gap-4">
									<Badge className="rounded-full px-3 py-1" variant="secondary">
										Built for calm clarity
									</Badge>
									<CardTitle className="max-w-2xl text-3xl tracking-tight md:text-4xl">
										Spendly gives you structure when you need it and gets out of
										the way when you do not.
									</CardTitle>
									<CardDescription className="max-w-2xl text-sm md:text-base">
										Track across your own cycles, add plans only when useful,
										and keep your history editable enough to stay trustworthy.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="grid gap-4 sm:grid-cols-3">
										{[
											{
												value: "2-5",
												label: "cycles compared side by side",
											},
											{
												value: "0",
												label: "income tracking requirements",
											},
											{
												value: "Anytime",
												label: "history can be corrected",
											},
										].map((stat) => (
											<div
												className="rounded-xl border border-border/70 bg-muted/20 p-4"
												key={stat.label}
											>
												<p className="font-semibold text-2xl tracking-tight">
													{stat.value}
												</p>
												<p className="mt-2 text-muted-foreground text-sm">
													{stat.label}
												</p>
											</div>
										))}
									</div>
								</CardContent>
							</Card>

							<Card className="border-border/70 bg-muted/30">
								<CardHeader>
									<CardTitle className="text-xl">
										What Spendly does not do
									</CardTitle>
									<CardDescription>
										The product stays lightweight by avoiding unnecessary
										budgeting pressure.
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-4">
									{[
										"It does not require income tracking.",
										"It does not force monthly budgeting.",
										"It does not lock past records once a cycle ends.",
									].map((item, index) => (
										<div className="flex flex-col gap-4" key={item}>
											<div className="flex items-start gap-3">
												<Badge
													className="mt-0.5 rounded-full"
													variant="outline"
												>
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
					</div>
				</section>

				<section className="py-16 md:py-20">
					<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6">
						<div className="flex max-w-3xl flex-col gap-4">
							<Badge className="rounded-full px-3 py-1" variant="secondary">
								Core Capabilities
							</Badge>
							<h2 className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">
								The key features are simple and practical
							</h2>
							<p className="max-w-2xl text-muted-foreground">
								Each one adds a clear capability instead of repeating the same
								promise in a different format.
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-3">
							{featureSections.map((section) => {
								const Icon = section.icon;

								return (
									<Card
										className="h-full border-border/70 bg-background"
										key={section.title}
									>
										<CardHeader className="gap-4">
											<div className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-muted/30">
												<Icon aria-hidden />
											</div>
											<div className="flex flex-col gap-2">
												<CardTitle className="text-2xl tracking-tight">
													{section.title}
												</CardTitle>
												<CardDescription className="text-sm md:text-base">
													{section.description}
												</CardDescription>
											</div>
										</CardHeader>
										<CardContent className="flex flex-col gap-4">
											{section.points.map((point, index) => (
												<div className="flex flex-col gap-4" key={point}>
													<div className="flex items-start gap-3">
														<Badge className="rounded-full" variant="outline">
															0{index + 1}
														</Badge>
														<p className="text-muted-foreground text-sm">
															{point}
														</p>
													</div>
													{index < section.points.length - 1 ? (
														<Separator />
													) : null}
												</div>
											))}
										</CardContent>
									</Card>
								);
							})}
						</div>
					</div>
				</section>

				<section className="py-16 md:py-20">
					<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6">
						<div className="flex max-w-3xl flex-col gap-4">
							<Badge className="rounded-full px-3 py-1" variant="secondary">
								Workflow
							</Badge>
							<h2 className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">
								How the core parts of Spendly work together
							</h2>
							<p className="text-muted-foreground">
								This is the shortest path through the product, from setting up a
								cycle to reviewing what changed.
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{workflowItems.map((item) => {
								const Icon = item.icon;

								return (
									<Card className="border-border/70" key={item.name}>
										<CardHeader className="gap-4">
											<div className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-muted/30">
												<Icon aria-hidden />
											</div>
											<div className="flex flex-col gap-2">
												<CardTitle className="text-xl tracking-tight">
													{item.name}
												</CardTitle>
												<CardDescription>
													<span className="font-medium text-foreground">
														Why:
													</span>{" "}
													{item.why}
												</CardDescription>
											</div>
										</CardHeader>
										<CardContent>
											<p className="text-muted-foreground text-sm">
												<span className="font-medium text-foreground">
													How:
												</span>{" "}
												{item.how}
											</p>
										</CardContent>
									</Card>
								);
							})}
						</div>
					</div>
				</section>

				<CallToAction />
				<FooterSection />
			</main>
			<script type="application/ld+json">
				{JSON.stringify(featuresStructuredData)}
			</script>
		</>
	);
}
