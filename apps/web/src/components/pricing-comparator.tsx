import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Compass, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const comparisonRows = [
	{
		attribute: "Setup effort",
		free: "Minimal",
		plan: "Guided",
		compare: "Needs at least two cycles",
	},
	{
		attribute: "Planning depth",
		free: "Optional",
		plan: "Planned amounts + categories",
		compare: "Read-only analysis",
	},
	{
		attribute: "Best for",
		free: "Quick daily capture",
		plan: "Intentional cycle budgeting",
		compare: "Pattern review over time",
	},
	{
		attribute: "Income tracking",
		free: "Not included",
		plan: "Not included",
		compare: "Not included",
	},
	{
		attribute: "History editable",
		free: "Yes",
		plan: "Yes",
		compare: "Yes",
	},
	{
		attribute: "Can switch later",
		free: "Yes",
		plan: "Yes",
		compare: "Yes",
	},
];

export default function PricingComparator() {
	return (
		<section className="py-16 md:py-32">
			<div className="mx-auto max-w-5xl px-6">
				<div className="mb-8 text-center">
					<h3 className="font-semibold text-3xl">When to choose each mode</h3>
					<p className="mt-2 text-muted-foreground">
						Start where you are. You can switch your approach anytime as your
						needs change.
					</p>
				</div>

				<div className="w-full overflow-auto lg:overflow-visible">
					<table className="w-[200vw] border-separate border-spacing-x-3 md:w-full dark:[--color-muted:var(--color-zinc-900)]">
						<thead className="sticky top-0 bg-background">
							<tr className="*:py-4 *:text-left *:font-medium">
								<th className="lg:w-2/5" />
								<th className="space-y-3">
									<span className="block">Track Freely</span>
									<SignedOut>
										<Button asChild size="sm" variant="outline">
											<a href="/sign-up">Start Free</a>
										</Button>
									</SignedOut>
									<SignedIn>
										<Button asChild size="sm" variant="outline">
											<a href="/dashboard">Go to Dashboard</a>
										</Button>
									</SignedIn>
								</th>
								<th className="space-y-3 rounded-t-(--radius) bg-muted px-4">
									<span className="block">Plan &amp; Track</span>
									<SignedOut>
										<Button asChild size="sm">
											<a href="/sign-up">Create Account</a>
										</Button>
									</SignedOut>
									<SignedIn>
										<Button asChild size="sm">
											<a href="/dashboard">Open Dashboard</a>
										</Button>
									</SignedIn>
								</th>
								<th className="space-y-3">
									<span className="block">Compare Cycles</span>
									<SignedOut>
										<Button asChild size="sm" variant="outline">
											<a href="/sign-in">Sign In</a>
										</Button>
									</SignedOut>
									<SignedIn>
										<Button asChild size="sm" variant="outline">
											<a href="/compare">Open Compare</a>
										</Button>
									</SignedIn>
								</th>
							</tr>
						</thead>
						<tbody className="text-caption text-sm">
							<tr className="*:py-3">
								<td className="flex items-center gap-2 font-medium">
									<Compass className="size-4" />
									<span>Mode guide</span>
								</td>
								<td />
								<td className="border-none bg-muted px-4" />
								<td />
							</tr>
							{comparisonRows.map((row) => (
								<tr className="*:border-b *:py-3" key={row.attribute}>
									<td className="text-muted-foreground">{row.attribute}</td>
									<td>{row.free}</td>
									<td className="border-none bg-muted px-4">
										<div className="-mb-3 border-b py-3">{row.plan}</div>
									</td>
									<td>{row.compare}</td>
								</tr>
							))}
							<tr className="*:pt-8 *:pb-3">
								<td className="flex items-center gap-2 font-medium">
									<Sparkles className="size-4" />
									<span>Next step</span>
								</td>
								<td>Start with quick expense capture.</td>
								<td className="border-none bg-muted px-4">
									Set categories and planned amounts if useful.
								</td>
								<td>Review your cycle history and spot trends.</td>
							</tr>
							<tr className="*:py-6">
								<td />
								<td />
								<td className="rounded-b-(--radius) border-none bg-muted px-4" />
								<td />
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}
