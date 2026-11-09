import { CalendarRange, PencilLine, TrendingUp } from "lucide-react";

const steps = [
	{
		description:
			"Choose a date range - Spendly calls this a cycle. Use a month, payday to payday, or your trip dates. Your expense date must fall within this range.",
		icon: CalendarRange,
		title: "Choose your dates",
	},
	{
		description:
			"Enter an amount and date, then save. Add a category, tags, or a note if you want more detail.",
		icon: PencilLine,
		title: "Record an expense",
	},
	{
		description:
			"See where your money went. As you add more cycles, compare totals and category spending to see what changed.",
		icon: TrendingUp,
		title: "Review and compare",
	},
] as const;

export default function LandingProof() {
	return (
		<section
			className="scroll-mt-24 border-b bg-background py-16 md:py-24"
			id="how-it-works"
		>
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-balance font-semibold text-3xl tracking-tight md:text-5xl">
						From setup to your first expense
					</h2>
					<p className="mt-4 text-muted-foreground leading-7 md:text-lg">
						Create a free account and choose your currency. Then:
					</p>
				</div>
				<ol className="mt-10 grid gap-6 md:grid-cols-3">
					{steps.map((step, index) => {
						const Icon = step.icon;
						return (
							<li
								className="rounded-2xl border border-border/70 bg-muted/15 p-6"
								key={step.title}
							>
								<div className="flex items-center gap-3">
									<Icon
										aria-hidden
										className="size-5 shrink-0 text-muted-foreground"
									/>
									<h3 className="font-semibold text-lg">
										{index + 1}. {step.title}
									</h3>
								</div>
								<p className="mt-3 text-muted-foreground text-sm leading-6">
									{step.description}
								</p>
							</li>
						);
					})}
				</ol>
			</div>
		</section>
	);
}
