"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

interface StorySection {
	eyebrow: string;
	title: string;
	description: string;
	screenshot: string;
	lightScreenshot: string;
	screenshotAlt: string;
	width: number;
	height: number;
}

const storySections = [
	{
		eyebrow: "Daily flow",
		title: "Quick capture, calm history",
		description:
			"Add amount, category, date, tags, and notes in seconds. Come back to a clean, readable history instead of a cluttered log.",
		screenshot: "/images/marketing/app-screenshots/add-expense.png",
		lightScreenshot: "/images/marketing/app-screenshots/add-expense-light.png",
		screenshotAlt:
			"Spendly expense entry form showing quick capture with category, date, tags, and notes fields",
		width: 2938,
		height: 1548,
	},
	{
		eyebrow: "Expense history",
		title: "Every expense stays easy to scan",
		description:
			"Review entries in a clean list with the details that matter, so edits, follow-ups, and quick checks never feel buried.",
		screenshot: "/images/marketing/app-screenshots/expenses.png",
		lightScreenshot: "/images/marketing/app-screenshots/expenses-light.png",
		screenshotAlt:
			"Spendly expenses view showing a clear list of transactions with categories, dates, and amounts",
		width: 2938,
		height: 1956,
	},
	{
		eyebrow: "Cycle clarity",
		title: "Your schedule, not a forced month",
		description:
			"Track pay periods, projects, semesters, or travel windows. Compare cycles when you want insight, not pressure.",
		screenshot: "/images/marketing/app-screenshots/compare-cycles.png",
		lightScreenshot:
			"/images/marketing/app-screenshots/compare-cycles-light.png",
		screenshotAlt:
			"Spendly cycle comparison view showing spending across multiple custom time periods",
		width: 2938,
		height: 4296,
	},
	{
		eyebrow: "Dashboard insight",
		title: "A dashboard that keeps the picture clear",
		description:
			"See totals, comparisons, and recent activity in one place so you always know where things stand without digging through entries.",
		screenshot: "/images/marketing/app-screenshots/dashboard-overview-mar.png",
		lightScreenshot:
			"/images/marketing/app-screenshots/dashboard-overview-mar-light.png",
		screenshotAlt:
			"Spendly dashboard overview showing totals, cycle comparisons, charts, and recent activity",
		width: 2938,
		height: 2712,
	},
] as const satisfies readonly StorySection[];

export default function LandingDemoStrip() {
	return (
		<section className="border-border/60 border-b bg-background py-20 md:py-28">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-3xl text-center">
					<Badge className="rounded-full px-3 py-1" variant="outline">
						Product tour
					</Badge>
					<h2 className="mt-4 text-balance font-semibold text-3xl tracking-tight md:text-5xl">
						See how four core ideas make tracking feel natural
					</h2>
					<p className="mt-4 text-balance text-muted-foreground md:text-lg">
						Quick capture, flexible cycles, dashboard clarity, and readable
						history all work together without getting in your way.
					</p>
				</div>

				<div className="mt-16 flex flex-col gap-20 lg:gap-28">
					{storySections.map((section, index) => {
						const isReversed = index % 2 !== 0;

						return (
							<article
								className={`flex flex-col items-center gap-10 lg:gap-16 ${isReversed ? "lg:flex-row-reverse" : "lg:flex-row"}`}
								key={section.title}
							>
								<div className="flex-shrink-0 lg:w-[340px]">
									<p className="text-[11px] text-muted-foreground/60 uppercase tracking-[0.24em]">
										{section.eyebrow}
									</p>
									<h3 className="mt-3 text-balance font-semibold text-2xl tracking-tight md:text-3xl">
										{section.title}
									</h3>
									<p className="mt-4 text-muted-foreground leading-7">
										{section.description}
									</p>
								</div>
								<div className="flex-1">
									<Dialog>
										<DialogTrigger asChild>
											<button
												aria-label={`Open ${section.title} screenshot fullscreen`}
												className="block w-full overflow-hidden rounded-2xl border border-border/70 bg-muted/30 shadow-black/5 shadow-xl transition-transform duration-200 hover:scale-[1.01] focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
												type="button"
											>
												<Image
													alt={section.screenshotAlt}
													className="hidden h-auto w-full cursor-zoom-in dark:block"
													height={section.height}
													sizes="(min-width: 1024px) 748px, calc(100vw - 3rem)"
													src={section.screenshot}
													width={section.width}
												/>
												<Image
													alt={section.screenshotAlt}
													className="h-auto w-full cursor-zoom-in dark:hidden"
													height={section.height}
													sizes="(min-width: 1024px) 748px, calc(100vw - 3rem)"
													src={section.lightScreenshot}
													width={section.width}
												/>
											</button>
										</DialogTrigger>
										<DialogContent className="w-[min(96vw,80rem)] max-w-none translate-x-[-50%] translate-y-[-50%] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-none">
											<div className="max-h-[92vh] overflow-y-auto rounded-xl">
												<div className="sr-only">
													<DialogTitle>{section.title}</DialogTitle>
													<DialogDescription>
														{section.description}
													</DialogDescription>
												</div>
												<Image
													alt={section.screenshotAlt}
													className="hidden h-auto w-full rounded-xl dark:block"
													height={section.height}
													sizes="(min-width: 1280px) 1280px, 96vw"
													src={section.screenshot}
													width={section.width}
												/>
												<Image
													alt={section.screenshotAlt}
													className="h-auto w-full rounded-xl dark:hidden"
													height={section.height}
													sizes="(min-width: 1280px) 1280px, 96vw"
													src={section.lightScreenshot}
													width={section.width}
												/>
											</div>
										</DialogContent>
									</Dialog>
								</div>
							</article>
						);
					})}
				</div>
			</div>
		</section>
	);
}
