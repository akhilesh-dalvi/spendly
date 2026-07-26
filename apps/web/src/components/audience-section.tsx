import {
	Briefcase,
	GraduationCap,
	HeartHandshake,
	House,
	Laptop,
	Rocket,
	Users,
	WandSparkles,
} from "lucide-react";

const audienceGroups = [
	{
		title: "Freelancers",
		description: "Track variable months with flexible cycles.",
		icon: Briefcase,
	},
	{
		title: "Students",
		description: "Stay aware without rigid budget rules.",
		icon: GraduationCap,
	},
	{
		title: "Couples",
		description: "Stay aware of household spending without rigid budgets.",
		icon: HeartHandshake,
	},
	{
		title: "Founders",
		description: "Keep personal spending visible during busy weeks.",
		icon: Rocket,
	},
	{
		title: "Creators",
		description: "Tag expenses by project or campaign.",
		icon: WandSparkles,
	},
	{
		title: "Remote Teams",
		description: "Use optional planning, not strict enforcement.",
		icon: Laptop,
	},
	{
		title: "Consultants",
		description: "Edit history when receipts come in late.",
		icon: Users,
	},
	{
		title: "Families",
		description: "Organize categories the way your household works.",
		icon: House,
	},
] as const;

export default function AudienceSection() {
	return (
		<section className="border-b bg-background py-16 md:py-24">
			<div className="mx-auto max-w-5xl px-6">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="text-balance font-semibold text-3xl md:text-4xl lg:text-5xl">
						Built for real spending habits
					</h2>
					<p className="mt-3 text-muted-foreground">
						Welcoming for anyone who wants insight, not judgment.
					</p>
				</div>
				<div className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-4">
					{audienceGroups.map((group) => {
						const Icon = group.icon;

						return (
							<article
								className="rounded-xl border bg-muted/40 p-4 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none"
								key={group.title}
							>
								<div className="flex items-center gap-3">
									<div className="inline-flex rounded-lg border bg-background p-2">
										<Icon aria-hidden className="size-4" />
									</div>
									<h3 className="font-semibold text-sm">{group.title}</h3>
								</div>
								<p className="mt-1 text-muted-foreground text-xs">
									{group.description}
								</p>
							</article>
						);
					})}
				</div>
			</div>
		</section>
	);
}
