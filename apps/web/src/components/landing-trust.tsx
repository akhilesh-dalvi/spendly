import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const founderName = "Akhilesh";

const privacyPoints = [
	"Industry-standard login security for every account.",
	"Your data is encrypted and stored securely in the cloud.",
	"Spendly helps you track expenses, not sell your financial behavior.",
	"No bank connection required.",
	"No income tracking required.",
] as const;

export default function LandingTrust() {
	return (
		<section className="border-b bg-background py-16 md:py-24">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-3xl text-center">
					<Badge className="rounded-full px-3 py-1" variant="outline">
						Trust and privacy
					</Badge>
					<h2 className="mt-4 text-balance font-semibold text-3xl tracking-tight md:text-5xl">
						Grounded, personal, and clear about your data
					</h2>
					<p className="mt-4 text-balance text-muted-foreground md:text-lg">
						Spendly keeps things simple: your data stays yours, and we are
						upfront about how everything works.
					</p>
				</div>

				<div className="mt-12 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
					<section className="border-border/70 border-t pt-6">
						<div className="flex items-center gap-3">
							<div className="inline-flex rounded-full border bg-background p-3">
								<UserRound aria-hidden className="size-4" />
							</div>
							<h3 className="font-semibold text-2xl tracking-tight">
								Built independently
							</h3>
						</div>
						<p className="mt-3 max-w-md text-muted-foreground leading-relaxed">
							Spendly is built by {founderName}, for people who want a simpler
							and calmer way to stay aware of spending.
						</p>

						<blockquote className="mt-8 border-border/70 border-l pl-5">
							<p className="max-w-lg font-semibold text-2xl leading-tight tracking-tight md:text-[2rem]">
								&ldquo;I wanted a tool that lets me track what I spend without
								telling me how to spend it.&rdquo;
							</p>
							<p className="mt-4 text-muted-foreground text-sm leading-relaxed">
								That principle still shapes every product decision.
							</p>
						</blockquote>

						<div className="mt-8 grid gap-6 border-border/70 border-t pt-6 sm:grid-cols-2">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
									Founder
								</p>
								<p className="mt-2 font-semibold text-xl">{founderName}</p>
								<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
									A personal product, not a finance platform.
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
									Starting point
								</p>
								<p className="mt-2 font-semibold text-xl">
									Too strict or too manual
								</p>
								<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
									Most tools pushed hard rules or left too much spreadsheet work
									behind.
								</p>
							</div>
						</div>
					</section>

					<section className="border-border/70 border-t pt-6">
						<div className="flex items-center gap-3">
							<div className="inline-flex rounded-full border bg-background p-3">
								<LockKeyhole aria-hidden className="size-4" />
							</div>
							<h3 className="font-semibold text-2xl tracking-tight">
								Your data stays yours
							</h3>
						</div>
						<p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
							Spendly is built to help you understand spending, not to pull you
							into a data-hungry finance ecosystem.
						</p>

						<div className="mt-6 inline-flex items-center rounded-full border border-border/70 bg-muted/[0.14] px-4 py-2">
							<span className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
								Clear boundaries, minimal collection
							</span>
						</div>

						<div className="mt-8 divide-y divide-border/70 rounded-3xl border border-border/70 bg-muted/[0.14]">
							{privacyPoints.map((point) => (
								<div className="flex items-start gap-3 px-5 py-4" key={point}>
									<ShieldCheck
										aria-hidden
										className="mt-0.5 size-4 shrink-0 text-foreground/70"
									/>
									<span className="text-muted-foreground leading-relaxed">
										{point}
									</span>
								</div>
							))}
						</div>
					</section>
				</div>
			</div>
		</section>
	);
}
