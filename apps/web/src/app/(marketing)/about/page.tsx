import { SignedIn, SignedOut } from "@clerk/nextjs";
import type { Metadata, Route } from "next";
import Link from "next/link";
import CallToAction from "@/components/call-to-action";
import FooterSection from "@/components/footer";
import { Button } from "@/components/ui/button";
import {
	createMarketingMetadata,
	createSoftwareApplicationJsonLd,
} from "@/lib/seo";

const aboutDescription =
	"The story behind Spendly: how a daily expense-tracking habit grew from pen and paper into an open-source app, built by a developer learning with AI.";

export const metadata: Metadata = createMarketingMetadata({
	description: aboutDescription,
	path: "/about",
	title: "About",
});

const aboutStructuredData = createSoftwareApplicationJsonLd({
	description: aboutDescription,
	featureList: ["Expense tracking in the web app and CLI"],
	path: "/about",
});

export default function AboutPage() {
	return (
		<>
			<main className="flex-1" id="main-content">
				<section aria-labelledby="about-title" className="border-b">
					<div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-14 md:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
						<h1
							className="max-w-4xl text-balance font-semibold text-4xl tracking-tight md:text-6xl"
							id="about-title"
						>
							About Spendly
						</h1>
						<div className="flex max-w-2xl flex-col gap-6">
							<p className="max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
								I’m Akhilesh, the developer behind Spendly. I built it to make
								my own daily expense tracking easier. It started with a
								notebook, grew into a spreadsheet, and became an open-source
								app.
							</p>
							<div className="flex flex-wrap gap-3">
								<SignedOut>
									<Button asChild size="lg">
										<Link href={"/sign-up" as Route}>Sign up</Link>
									</Button>
									<Button asChild size="lg" variant="outline">
										<Link href={"/sign-in" as Route}>Sign in</Link>
									</Button>
								</SignedOut>
								<SignedIn>
									<Button asChild size="lg">
										<Link href={"/dashboard" as Route}>Go to Dashboard</Link>
									</Button>
								</SignedIn>
							</div>
							<Link
								className="w-fit underline underline-offset-4"
								href="/features"
							>
								Explore features
							</Link>
						</div>
					</div>
				</section>

				<div className="mx-auto max-w-6xl px-6 py-4 md:py-8">
					<section
						aria-labelledby="origin-heading"
						className="grid gap-5 border-b py-10 last:border-b-0 md:py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16"
					>
						<h2
							className="font-semibold text-3xl tracking-tight"
							id="origin-heading"
						>
							From pen and paper to a spreadsheet
						</h2>
						<div className="flex max-w-2xl flex-col gap-4 text-base leading-relaxed">
							<p className="text-muted-foreground leading-relaxed">
								At the end of each day, I used to write down where I had spent
								my money. Later, I moved to Excel. One sheet of expenses grew
								into categories, category types, and charts showing how much I
								spent in each category.
							</p>
							<p className="text-muted-foreground leading-relaxed">
								I started using Google Sheets so I could add expenses from my
								phone and laptop. The spreadsheet worked, but entering and
								reviewing expenses felt awkward. I wanted an easier way to use
								the system I had built.
							</p>
							<p className="text-muted-foreground leading-relaxed">
								That became Spendly. My way of tracking spending had changed
								over time, so I wanted the app to leave room for that - not make
								everyone follow the system I happened to use.
							</p>
						</div>
					</section>

					<section
						aria-labelledby="developer-heading"
						className="grid gap-5 border-b py-10 last:border-b-0 md:py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16"
					>
						<h2
							className="font-semibold text-3xl tracking-tight"
							id="developer-heading"
						>
							A personal tool, a real project
						</h2>
						<div className="flex max-w-2xl flex-col gap-4 text-base leading-relaxed">
							<p className="text-muted-foreground leading-relaxed">
								As a developer, I wanted a real product in my portfolio -
								something I would use and maintain, not just finish as a demo.
								Building for myself gave me a reason to keep improving it.
							</p>
							<p className="text-muted-foreground leading-relaxed">
								Spendly is also how I am learning to build with AI. I review
								AI-generated code and test what I ship, including complete user
								journeys. Those checks help me maintain Spendly, but they do not
								make it perfect.
							</p>
						</div>
					</section>

					<section
						aria-labelledby="project-heading"
						className="grid gap-5 border-b py-10 last:border-b-0 md:py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16"
					>
						<h2
							className="font-semibold text-3xl tracking-tight"
							id="project-heading"
						>
							Why open source
						</h2>
						<div className="flex max-w-2xl flex-col gap-4 text-base leading-relaxed">
							<p className="text-muted-foreground leading-relaxed">
								Open-source libraries and tools helped me build Spendly. Sharing
								its code felt like a natural way to give something back. I’m
								sharing it for people who want to build their own
								expense-tracking habit. You can learn from it, fork it to build
								what you need, or contribute improvements.
							</p>
							<p className="text-muted-foreground leading-relaxed">
								The code is available in the{" "}
								<a
									className="underline underline-offset-4"
									href="https://github.com/akhilesh-dalvi/spendly"
								>
									akhilesh-dalvi/spendly
								</a>{" "}
								repository.
							</p>
						</div>
					</section>

					<section
						aria-labelledby="focus-heading"
						className="grid gap-5 border-b py-10 last:border-b-0 md:py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16"
					>
						<h2
							className="font-semibold text-3xl tracking-tight"
							id="focus-heading"
						>
							Making the habit easier
						</h2>
						<div className="flex max-w-2xl flex-col gap-4 text-base leading-relaxed">
							<p className="text-muted-foreground leading-relaxed">
								My focus now is making it easier to record an expense when it
								happens, so there is less to catch up on at the end of the day.
								That is why I added the{" "}
								<Link
									className="underline underline-offset-4"
									href={"/docs/cli" as Route}
								>
									Spendly CLI
								</Link>{" "}
								- a command-line tool for recording expenses without opening the
								web app.
							</p>
						</div>
					</section>
				</div>

				<CallToAction
					description="Try Spendly for your own spending and see whether it fits the way you like to keep track."
					title="Make it part of your day"
				/>
			</main>
			<FooterSection />
			<script type="application/ld+json">
				{JSON.stringify(aboutStructuredData).replace(/</g, "\\u003c")}
			</script>
		</>
	);
}
