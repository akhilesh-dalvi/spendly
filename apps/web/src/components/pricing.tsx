import { SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const usageModes = [
	{
		title: "Track Freely",
		subtitle: "Start with zero setup",
		points: [
			"Add expenses quickly",
			"No income tracking",
			"No hard enforcement",
		],
	},
	{
		title: "Plan & Track",
		subtitle: "Add structure when it helps",
		points: [
			"Set planned amounts per cycle",
			"Group with custom types",
			"Adjust anytime as priorities change",
		],
	},
	{
		title: "Compare Cycles",
		subtitle: "Spot trends across time",
		points: [
			"Compare multiple cycles",
			"Spot category changes clearly",
			"Make calmer, informed decisions",
		],
	},
];

export default function Pricing() {
	return (
		<section className="py-16 md:py-32" id="modes">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-3xl space-y-6 text-center">
					<h2 className="mx-auto max-w-3xl text-balance text-center font-semibold text-3xl md:text-4xl lg:text-5xl">
						Three ways to use Spendly
					</h2>
					<p className="mt-3 text-muted-foreground text-sm md:text-base">
						All free. One product, three workflows — use them together or start
						simple and evolve as you go.
					</p>
				</div>

				<div className="mt-8 grid gap-6 md:mt-16 md:grid-cols-3">
					{usageModes.map((mode) => (
						<Card
							className="border-border/70 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-black/5 hover:shadow-lg"
							key={mode.title}
						>
							<CardHeader>
								<CardTitle className="font-semibold">{mode.title}</CardTitle>
								<CardDescription className="text-sm">
									{mode.subtitle}
								</CardDescription>
							</CardHeader>

							<CardContent className="space-y-4">
								<hr className="border-dashed" />
								<ul className="list-outside space-y-3 text-sm">
									{mode.points.map((item) => (
										<li className="flex items-center gap-2" key={item}>
											<Check className="size-3 text-primary" />
											{item}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					))}
				</div>

				<div className="mt-10 text-center">
					<SignedOut>
						<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
							<Button asChild className="rounded-xl px-6" size="lg">
								<a href="/sign-up">Get Started Free</a>
							</Button>
							<Button
								asChild
								className="rounded-xl px-6"
								size="lg"
								variant="ghost"
							>
								<a href="/pricing">
									<span>Full pricing details</span>
									<ArrowRight className="ml-1.5 size-3.5" />
								</a>
							</Button>
						</div>
					</SignedOut>
					<SignedIn>
						<Button asChild className="rounded-xl px-6" size="lg">
							<a href="/dashboard">Go to Dashboard</a>
						</Button>
					</SignedIn>
				</div>
			</div>
		</section>
	);
}
