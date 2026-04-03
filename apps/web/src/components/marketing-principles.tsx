export default function MarketingPrinciples() {
	return (
		<section className="py-12 md:py-20">
			<div className="mx-auto max-w-5xl space-y-8 px-6 md:space-y-16">
				<div className="relative z-10 mx-auto max-w-xl space-y-6 text-center">
					<h2 className="font-medium text-4xl lg:text-5xl">
						Principles behind Spendly
					</h2>
					<p>
						The product is designed around flexibility, clarity, and real-life
						budgeting behavior.
					</p>
				</div>

				<div className="grid gap-12 divide-y *:text-center md:grid-cols-3 md:gap-2 md:divide-x md:divide-y-0">
					<div className="space-y-4">
						<div className="font-bold text-3xl">Flexible by default</div>
						<p>Choose your own cycles, categories, and tags.</p>
					</div>
					<div className="space-y-4">
						<div className="font-bold text-3xl">Planning is optional</div>
						<p>Track first, add plans only when it helps.</p>
					</div>
					<div className="space-y-4">
						<div className="font-bold text-3xl">Edit anytime</div>
						<p>Update past or future records as needed.</p>
					</div>
				</div>
			</div>
		</section>
	);
}
