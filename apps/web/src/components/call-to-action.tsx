"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CallToAction() {
	return (
		<section className="py-16 md:py-32">
			<div className="mx-auto max-w-5xl px-6">
				<div className="overflow-hidden rounded-3xl bg-[#0b0c10] px-6 py-16 text-center md:px-12 md:py-24">
					<h2 className="text-balance font-semibold text-3xl text-white md:text-4xl lg:text-5xl">
						Ready to track your way?
					</h2>
					<p className="mx-auto mt-4 max-w-xl text-white/65 leading-relaxed">
						Start simple with just expenses, or add cycles and plans when it
						helps. No setup quiz, no credit card.
					</p>

					<div className="mt-10 flex flex-wrap justify-center gap-4">
						<SignedOut>
							<Button
								asChild
								className="rounded-xl bg-white px-6 text-base text-black hover:bg-white/90"
								size="lg"
							>
								<a href="/sign-up">
									<span>Get Started Free</span>
									<ArrowRight className="ml-2 size-4" />
								</a>
							</Button>
						</SignedOut>
						<SignedIn>
							<Button
								asChild
								className="rounded-xl bg-white px-6 text-base text-black hover:bg-white/90"
								size="lg"
							>
								<a href="/dashboard">
									<span>Go to Dashboard</span>
									<ArrowRight className="ml-2 size-4" />
								</a>
							</Button>
						</SignedIn>
					</div>
				</div>
			</div>
		</section>
	);
}
