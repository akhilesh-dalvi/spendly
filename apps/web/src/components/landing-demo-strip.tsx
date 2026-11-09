"use client";

import Image from "next/image";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

interface StorySection {
	description: string;
	height: number;
	lightScreenshot: string;
	screenshot: string;
	screenshotAlt: string;
	title: string;
	width: number;
}

const storySections = [
	{
		description:
			"Enter what you spent and when. Categories, tags, and notes help you find the details later.",
		height: 1548,
		lightScreenshot: "/images/marketing/app-screenshots/add-expense-light.png",
		screenshot: "/images/marketing/app-screenshots/add-expense.png",
		screenshotAlt:
			"Spendly expense entry form with amount, category, date, tags, and notes fields",
		title: "Add what you spent",
		width: 2938,
	},
	{
		description:
			"Scan amounts, dates, and categories in one list. Edit an entry when you need to correct it.",
		height: 1956,
		lightScreenshot: "/images/marketing/app-screenshots/expenses-light.png",
		screenshot: "/images/marketing/app-screenshots/expenses.png",
		screenshotAlt:
			"Spendly expenses view showing a clear list of transactions with categories, dates, and amounts",
		title: "Find and fix past entries",
		width: 2938,
	},
	{
		description:
			"Check your cycle total, spending charts, and recent expenses on the dashboard.",
		height: 2712,
		lightScreenshot:
			"/images/marketing/app-screenshots/dashboard-overview-mar-light.png",
		screenshot: "/images/marketing/app-screenshots/dashboard-overview-mar.png",
		screenshotAlt:
			"Spendly dashboard overview showing spending totals, charts, and recent activity",
		title: "Check your spending at a glance",
		width: 2938,
	},
	{
		description:
			"Compare spending across your cycles. See which categories changed from one period to the next.",
		height: 4296,
		lightScreenshot:
			"/images/marketing/app-screenshots/compare-cycles-light.png",
		screenshot: "/images/marketing/app-screenshots/compare-cycles.png",
		screenshotAlt:
			"Spendly cycle comparison view showing spending across multiple custom time periods",
		title: "See what changed over time",
		width: 2938,
	},
] as const satisfies readonly StorySection[];

export default function LandingDemoStrip() {
	return (
		<section className="border-border/60 border-b bg-background py-20 md:py-28">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="text-balance font-semibold text-3xl tracking-tight md:text-5xl">
						See how Spendly works
					</h2>
					<p className="mt-4 text-balance text-muted-foreground md:text-lg">
						Take a look inside. Select any screenshot to enlarge it.
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
									<h3 className="text-balance font-semibold text-2xl tracking-tight md:text-3xl">
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
