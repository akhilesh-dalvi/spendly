import {
	CalendarRange,
	ChartNoAxesColumnIncreasing,
	Edit3,
	type LucideIcon,
	ShieldCheck,
	SlidersHorizontal,
	Wallet,
} from "lucide-react";

interface FeatureCard {
	description: string;
	icon: LucideIcon;
	title: string;
}

const FEATURE_CARDS: FeatureCard[] = [
	{
		title: "Built for daily habits",
		description:
			"Capture spending quickly and keep only the detail you actually need.",
		icon: Wallet,
	},
	{
		title: "Flexible by default",
		description:
			"Create your own cycles, categories, and tags to match real life.",
		icon: SlidersHorizontal,
	},
	{
		title: "Planning stays optional",
		description:
			"Add planned amounts when useful, or track clearly without planning.",
		icon: CalendarRange,
	},
	{
		title: "Compare without judgment",
		description: "Review cycle changes for insight, not pressure or scoring.",
		icon: ChartNoAxesColumnIncreasing,
	},
	{
		title: "Edit anytime",
		description:
			"Update past and future entries so your history stays accurate.",
		icon: Edit3,
	},
	{
		title: "Secure by default",
		description: "Data is synced with Convex and authenticated with Clerk.",
		icon: ShieldCheck,
	},
];

export default function FeatureGrid() {
	return (
		<section className="py-12 md:py-16" id="features">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="mx-auto max-w-3xl text-balance font-semibold text-3xl md:text-4xl lg:text-5xl">
						Your spending, at a glance
					</h2>
					<p className="mt-3 text-muted-foreground text-sm md:text-base">
						Spendly helps you track, plan when it helps, and compare cycles with
						insight instead of judgment.
					</p>
				</div>

				<div className="mt-8 grid grid-cols-2 gap-3 md:mt-10 md:grid-cols-3 md:gap-4">
					{FEATURE_CARDS.map((feature) => {
						const Icon = feature.icon;

						return (
							<article
								className="h-full rounded-xl border bg-muted/40 p-4 transition-transform hover:-translate-y-0.5 md:p-5"
								key={feature.title}
							>
								<div className="flex items-center gap-3">
									<div className="inline-flex rounded-lg border bg-background p-2">
										<Icon aria-hidden className="size-4" />
									</div>
									<h3 className="font-semibold text-sm md:text-base">
										{feature.title}
									</h3>
								</div>
								<p className="mt-1 text-muted-foreground text-xs leading-relaxed md:text-sm">
									{feature.description}
								</p>
							</article>
						);
					})}
				</div>
			</div>
		</section>
	);
}
