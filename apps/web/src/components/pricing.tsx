const includedFeatures = [
	{
		description:
			"Record expenses and edit past entries. Add categories, tags, or notes when useful.",
		title: "Track your spending",
	},
	{
		description:
			"Set optional planned amounts for categories in each cycle. Keep tracking even when spending goes over your plan.",
		title: "Add a plan when useful",
	},
	{
		description:
			"Compare 2-5 cycles side by side to see changes in totals and category spending.",
		title: "See what changed",
	},
];

export default function Pricing() {
	return (
		<section
			aria-labelledby="pricing-included-title"
			className="py-16 md:py-20"
		>
			<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6">
				<h2
					className="font-semibold text-3xl tracking-tight"
					id="pricing-included-title"
				>
					What's included
				</h2>
				<div className="grid gap-8 md:grid-cols-3">
					{includedFeatures.map((feature) => (
						<div className="flex flex-col gap-3" key={feature.title}>
							<h3 className="font-semibold text-xl">{feature.title}</h3>
							<p className="text-muted-foreground leading-relaxed">
								{feature.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
