"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function OnboardingResumeCard() {
	const onboardingState = useQuery(api.users.getOnboardingState);
	if (
		!(
			onboardingState?.cycle &&
			onboardingState.path &&
			(["categories", "account"] as const).includes(
				onboardingState.step as "categories" | "account"
			)
		)
	) {
		return null;
	}

	const href =
		onboardingState.step === "categories"
			? `/onboarding/categories?cycleId=${onboardingState.cycle._id}`
			: `/onboarding/accounts?cycleId=${onboardingState.cycle._id}`;
	const remainingLabel =
		onboardingState.step === "categories"
			? "Categories and an optional account are still ready to review."
			: "Your optional first account is still ready to add.";

	return (
		<section
			aria-label="Finish Spendly setup"
			className="flex flex-col gap-4 rounded-xl border bg-primary/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div className="flex gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Sparkles className="size-4" />
				</div>
				<div>
					<p className="font-medium">Finish your optional setup</p>
					<p className="mt-1 text-muted-foreground text-sm">{remainingLabel}</p>
				</div>
			</div>
			<Button asChild className="shrink-0" size="sm" variant="outline">
				<Link href={href as Route}>
					Resume setup <ArrowRight />
				</Link>
			</Button>
		</section>
	);
}
