import { CalendarRange, Edit3, Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const corePoints = [
	{
		title: "Custom cycles instead of forced months",
		description:
			"Track pay periods, trips, semesters, or any timeline that reflects how you actually review spending.",
		icon: CalendarRange,
	},
	{
		title: "Planning is optional, not required",
		description:
			"Add planned amounts when they help, or skip them completely and still keep the app useful.",
		icon: Layers3,
	},
	{
		title: "History stays editable when life changes",
		description:
			"Fix past records, reassign categories, and keep your expense history trustworthy over time.",
		icon: Edit3,
	},
] as const;

export default function LandingProof() {
	return (
		<section className="border-b bg-background py-16 md:py-24">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-2xl text-center">
					<Badge className="rounded-full px-3 py-1" variant="outline">
						Why Spendly works
					</Badge>
					<h2 className="mt-5 text-balance font-semibold text-3xl tracking-tight md:text-5xl">
						Built for clarity without rigid budgeting.
					</h2>
					<p className="mt-4 text-balance text-muted-foreground leading-7 md:text-lg">
						Spendly is shaped around how people actually review spending:
						flexible cycles, optional planning, and history you can fix when
						life changes.
					</p>
				</div>

				<div className="mt-12 grid gap-6 md:grid-cols-3">
					{corePoints.map((point) => {
						const Icon = point.icon;

						return (
							<article
								className="group rounded-2xl border border-border/70 bg-muted/15 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-black/5 hover:shadow-lg"
								key={point.title}
							>
								<div className="flex items-center">
									<div className="inline-flex size-11 items-center justify-center rounded-2xl border bg-background">
										<Icon aria-hidden className="size-4" />
									</div>
								</div>
								<h3 className="mt-5 font-semibold text-lg leading-7">
									{point.title}
								</h3>
								<p className="mt-3 text-muted-foreground text-sm leading-6">
									{point.description}
								</p>
							</article>
						);
					})}
				</div>
			</div>
		</section>
	);
}
