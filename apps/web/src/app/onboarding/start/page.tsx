"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowRight,
	Check,
	Clock3,
	LoaderCircle,
	ShieldCheck,
	Target,
	Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OnboardingStepControls } from "@/components/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	isSupportedCurrency,
	SUPPORTED_CURRENCIES,
	type SupportedCurrency,
} from "@/lib/currencies";
import { cn } from "@/lib/utils";

type SetupPath = "free" | "plan";

const PATH_OPTIONS = [
	{
		description: "Create one tracking period, then start adding expenses.",
		effort: "About 1 minute",
		icon: Zap,
		path: "free" as const,
		title: "Start tracking freely",
	},
	{
		description:
			"Review categories and optional planned amounts before tracking.",
		effort: "About 3 minutes",
		icon: Target,
		path: "plan" as const,
		title: "Plan & track",
	},
] as const;

export default function OnboardingStartPage() {
	const router = useRouter();
	const onboardingState = useQuery(api.users.getOnboardingState);
	const beginOnboarding = useMutation(api.users.beginOnboarding);
	const [currency, setCurrency] = useState<SupportedCurrency>("USD");
	const [selectedPath, setSelectedPath] = useState<SetupPath>("free");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string>();

	useEffect(() => {
		if (!onboardingState) {
			return;
		}
		if (isSupportedCurrency(onboardingState.currency)) {
			setCurrency(onboardingState.currency);
		}
		if (onboardingState.path) {
			setSelectedPath(onboardingState.path);
		}
	}, [onboardingState]);

	const handleContinue = async () => {
		setIsSaving(true);
		setError(undefined);
		try {
			await beginOnboarding({ currency, path: selectedPath });
			router.push(`/onboarding/cycle?mode=${selectedPath}`);
		} catch (_error) {
			setError(
				"We couldn't save your setup choice. Your selections are still here—please try again."
			);
			setIsSaving(false);
		}
	};

	return (
		<Card className="gap-0 overflow-hidden py-0 shadow-sm">
			<CardContent className="p-0">
				<div className="border-b bg-muted/25 px-5 py-6 sm:px-8 sm:py-8">
					<h1 className="max-w-xl text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
						Set up the way you already think about money.
					</h1>
					<p className="mt-3 max-w-2xl text-pretty text-muted-foreground leading-6">
						Choose your currency and a starting path. Nothing is locked—you can
						add budgets, categories, or accounts later.
					</p>
				</div>

				<div className="space-y-7 px-5 py-6 sm:px-8 sm:py-8">
					<div className="space-y-2">
						<Label htmlFor="onboarding-currency">Primary currency</Label>
						<Select
							onValueChange={(value) => setCurrency(value as SupportedCurrency)}
							value={currency}
						>
							<SelectTrigger
								className="w-full sm:max-w-sm"
								id="onboarding-currency"
							>
								<SelectValue placeholder="Choose a currency" />
							</SelectTrigger>
							<SelectContent>
								{SUPPORTED_CURRENCIES.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label} ({item.value})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-sm">
							Spendly uses this for planned amounts and new accounts. You can
							change it later.
						</p>
					</div>

					<fieldset className="space-y-3">
						<legend className="font-medium text-sm">
							How would you like to begin?
						</legend>
						<div className="grid gap-3 sm:grid-cols-2">
							{PATH_OPTIONS.map((option) => {
								const Icon = option.icon;
								const isSelected = selectedPath === option.path;
								return (
									<button
										aria-pressed={isSelected}
										className={cn(
											"relative flex min-h-48 flex-col rounded-xl border p-5 text-left outline-none transition-all hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
											isSelected && "border-primary bg-primary/[0.04] shadow-sm"
										)}
										key={option.path}
										onClick={() => setSelectedPath(option.path)}
										type="button"
									>
										<div className="flex items-center gap-3">
											<span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
												<Icon className="size-5" />
											</span>
											<p className="font-semibold text-lg">{option.title}</p>
										</div>
										<div className="mt-4">
											<p className="text-muted-foreground text-sm leading-5">
												{option.description}
											</p>
										</div>
										<div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
											<span className="flex items-center gap-1.5 text-muted-foreground">
												<Clock3 className="size-3.5" /> {option.effort}
											</span>
											{isSelected ? (
												<Check className="size-5 text-primary" />
											) : null}
										</div>
									</button>
								);
							})}
						</div>
					</fieldset>

					<div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
						<ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
						<p>
							<span className="font-medium">You can change course later.</span>{" "}
							Both paths unlock the same Spendly features.
						</p>
					</div>

					<div aria-live="polite">
						{error ? (
							<p className="mb-3 text-destructive text-sm" role="alert">
								{error}
							</p>
						) : null}
						<OnboardingStepControls>
							<Button disabled={isSaving} onClick={handleContinue} size="lg">
								{isSaving ? <LoaderCircle className="animate-spin" /> : null}
								{isSaving ? "Saving your choices…" : "Save and continue"}
								{isSaving ? null : <ArrowRight />}
							</Button>
						</OnboardingStepControls>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
