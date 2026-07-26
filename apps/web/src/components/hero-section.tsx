import { SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HeroSection() {
	return (
		<section className="relative overflow-hidden">
			<div
				aria-hidden
				className="absolute inset-0 isolate hidden opacity-65 contain-strict lg:block"
			>
				<div className="absolute top-0 left-0 h-320 w-140 -translate-y-87.5 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
				<div className="absolute top-0 left-0 h-320 w-60 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
				<div className="absolute top-0 left-0 h-320 w-60 -translate-y-87.5 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
			</div>
			<div className="relative pt-[4.5rem] pb-24 md:pt-[7rem] md:pb-32">
				<div
					aria-hidden
					className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--color-background)_75%)]"
				/>

				<div className="mx-auto max-w-7xl px-6">
					<div className="text-center sm:mx-auto lg:mt-0 lg:mr-auto">
						<Link
							className="group mx-auto flex w-fit items-center gap-4 rounded-full border bg-muted p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 hover:bg-background motion-reduce:transition-none dark:border-t-white/5 dark:shadow-zinc-950 dark:hover:border-t-border"
							href="/features"
						>
							<span className="text-foreground text-sm">
								See how Spendly works
							</span>
							<span className="block h-4 w-0.5 border-l bg-white dark:border-background dark:bg-zinc-700" />
							<span className="flex size-6 items-center justify-center rounded-full bg-background text-sm transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none">
								→
							</span>
						</Link>

						<h1 className="mx-auto mt-8 max-w-4xl text-balance font-semibold text-5xl tracking-tight md:text-7xl lg:mt-16 xl:text-[5.25rem]">
							Spendly gives you a calmer way to track spending.
						</h1>
						<p className="mx-auto mt-8 max-w-2xl text-balance text-lg text-muted-foreground">
							Track expenses across your own cycles, plan only when you want to,
							and compare trends without rigid rules. No income tracking. No
							hard enforcement.
						</p>

						<div className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row">
							<SignedOut>
								<Button asChild className="rounded-xl px-6 text-base" size="lg">
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
								<Button asChild className="rounded-xl px-6 text-base" size="lg">
									<a href="/dashboard">
										<span className="text-nowrap">Go to Dashboard</span>
									</a>
								</Button>
							</SignedIn>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
