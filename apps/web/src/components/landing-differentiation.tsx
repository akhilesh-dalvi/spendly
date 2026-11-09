export default function LandingDifferentiation() {
	return (
		<section className="border-b bg-muted/20 py-16 md:py-24">
			<div className="mx-auto max-w-5xl px-6">
				<h2 className="text-balance text-center font-semibold text-3xl tracking-tight md:text-5xl">
					Is Spendly right for you?
				</h2>
				<div className="mt-10 grid gap-8 md:grid-cols-2">
					<div>
						<h3 className="font-semibold text-xl">
							For your everyday spending
						</h3>
						<p className="mt-3 text-muted-foreground leading-7">
							Track day-to-day costs or keep a trip&apos;s expenses together.
							Want a spending plan? Set an amount for a category, such as food,
							and compare it with what you spend. Or leave plans blank.
						</p>
						<p className="mt-3 text-muted-foreground leading-7">
							Record expenses in the app or use the{" "}
							<a
								className="text-primary underline underline-offset-4"
								href="/docs/cli"
							>
								Spendly CLI
							</a>{" "}
							from your terminal.
						</p>
					</div>
					<div>
						<h3 className="font-semibold text-xl">Focused by design</h3>
						<p className="mt-3 text-muted-foreground leading-7">
							Spendly focuses on understanding what you spend, not managing
							income or connecting bank accounts. Choose what to record and how
							to organize it, with spending plans only when they help.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
