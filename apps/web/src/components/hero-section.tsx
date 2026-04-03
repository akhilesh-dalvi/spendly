"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
	ArrowRight,
	Briefcase,
	GraduationCap,
	HeartHandshake,
	House,
	Laptop,
	Rocket,
	Users,
	WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { Button } from "@/components/ui/button";
import { TextEffect } from "@/components/ui/text-effect";

const transitionVariants = {
	item: {
		hidden: {
			opacity: 0,
			filter: "blur(12px)",
			y: 12,
		},
		visible: {
			opacity: 1,
			filter: "blur(0px)",
			y: 0,
			transition: {
				bounce: 0.3,
				duration: 1.5,
				type: "spring" as const,
			},
		},
	},
};

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

export default function HeroSection() {
	return (
		<>
			<div
				aria-hidden
				className="absolute inset-0 isolate hidden opacity-65 contain-strict lg:block"
			>
				<div className="absolute top-0 left-0 h-320 w-140 -translate-y-87.5 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
				<div className="absolute top-0 left-0 h-320 w-60 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
				<div className="absolute top-0 left-0 h-320 w-60 -translate-y-87.5 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
			</div>
			<section>
				<div className="relative pt-[4.5rem] pb-24 md:pt-[7rem] md:pb-40">
					<div
						aria-hidden
						className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--color-background)_75%)]"
					/>

					<div className="mx-auto max-w-7xl px-6">
						<div className="text-center sm:mx-auto lg:mt-0 lg:mr-auto">
							<AnimatedGroup variants={transitionVariants}>
								<Link
									className="group mx-auto flex w-fit items-center gap-4 rounded-full border bg-muted p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 hover:bg-background dark:border-t-white/5 dark:shadow-zinc-950 dark:hover:border-t-border"
									href="/features"
								>
									<span className="text-foreground text-sm">
										See how Spendly works
									</span>
									<span className="block h-4 w-0.5 border-l bg-white dark:border-background dark:bg-zinc-700" />

									<div className="size-6 overflow-hidden rounded-full bg-background duration-500 group-hover:bg-muted">
										<div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
											<span className="flex size-6">
												<ArrowRight className="m-auto size-3" />
											</span>
											<span className="flex size-6">
												<ArrowRight className="m-auto size-3" />
											</span>
										</div>
									</div>
								</Link>
							</AnimatedGroup>

							<TextEffect
								as="h1"
								className="mx-auto mt-8 max-w-4xl text-balance text-5xl max-md:font-semibold md:text-7xl lg:mt-16 xl:text-[5.25rem]"
								preset="fade-in-blur"
								speedSegment={0.3}
							>
								Spendly gives you a calmer way to track spending.
							</TextEffect>
							<TextEffect
								as="p"
								className="mx-auto mt-8 max-w-2xl text-balance text-lg"
								delay={0.5}
								per="line"
								preset="fade-in-blur"
								speedSegment={0.3}
							>
								Track expenses across your own cycles, plan only when you want
								to, and compare trends without rigid rules. No income tracking.
								No hard enforcement.
							</TextEffect>

							<AnimatedGroup
								className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row"
								variants={{
									container: {
										visible: {
											transition: {
												staggerChildren: 0.05,
												delayChildren: 0.75,
											},
										},
									},
									...transitionVariants,
								}}
							>
								<SignedOut>
									<Button
										asChild
										className="rounded-xl px-6 text-base"
										size="lg"
									>
										<a href="/sign-up">
											<span className="text-nowrap">Get Started Free</span>
										</a>
									</Button>
									<Button
										asChild
										className="h-10.5 rounded-xl px-5"
										size="lg"
										variant="ghost"
									>
										<a href="/sign-in">
											<span className="text-nowrap">
												I already have an account
											</span>
										</a>
									</Button>
								</SignedOut>
								<SignedIn>
									<Button
										asChild
										className="rounded-xl px-6 text-base"
										size="lg"
									>
										<a href="/dashboard">
											<span className="text-nowrap">Go to Dashboard</span>
										</a>
									</Button>
								</SignedIn>
							</AnimatedGroup>
						</div>
					</div>
				</div>
			</section>
			<section className="bg-background pt-16 pb-16 md:pb-32">
				<div className="m-auto max-w-5xl px-6">
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
									className="rounded-xl border bg-muted/40 p-4 transition-transform hover:-translate-y-0.5"
									key={group.title}
								>
									<div className="flex items-center gap-3">
										<div className="inline-flex rounded-lg border bg-background p-2">
											<Icon className="size-4" />
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
		</>
	);
}
