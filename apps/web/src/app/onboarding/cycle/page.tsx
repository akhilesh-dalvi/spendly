"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { addDays, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import {
	ArrowRight,
	CalendarDays,
	LoaderCircle,
	WalletCards,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { OnboardingStepControls } from "@/components/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerWithRange } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CyclePreset = "monthly" | "pay-period" | "custom";

const PRESET_LABELS: Record<CyclePreset, string> = {
	custom: "Custom",
	monthly: "Monthly",
	"pay-period": "Pay period",
};

const getPresetRange = (preset: CyclePreset): DateRange => {
	const today = new Date();
	if (preset === "pay-period") {
		return { from: today, to: addDays(today, 13) };
	}
	return { from: startOfMonth(today), to: endOfMonth(today) };
};

const getPresetName = (preset: CyclePreset, range: DateRange): string => {
	if (preset === "pay-period" && range.from && range.to) {
		return `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}`;
	}
	if (preset === "monthly" && range.from) {
		return format(range.from, "MMMM yyyy");
	}
	return "My tracking period";
};

export default function OnboardingCyclePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const onboardingState = useQuery(api.users.getOnboardingState);
	const saveCycle = useMutation(api.cycles.saveOnboardingCycle);
	const initialRange = getPresetRange("monthly");
	const [preset, setPreset] = useState<CyclePreset>("monthly");
	const [name, setName] = useState(getPresetName("monthly", initialRange));
	const [dateRange, setDateRange] = useState<DateRange | undefined>(
		initialRange
	);
	const [nameError, setNameError] = useState<string>();
	const [dateError, setDateError] = useState<string>();
	const [saveError, setSaveError] = useState<string>();
	const [isSaving, setIsSaving] = useState(false);
	const hasInitialized = useRef(false);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const isPlanMode = searchParams.get("mode") === "plan";
	const requestedCycleId = searchParams.get("cycleId");

	useEffect(() => {
		if (!onboardingState || hasInitialized.current) {
			return;
		}
		if (
			requestedCycleId &&
			onboardingState.cycle &&
			requestedCycleId !== onboardingState.cycle._id
		) {
			setSaveError(
				"That setup cycle is not available. We loaded your own cycle instead."
			);
			router.replace(
				`/onboarding/cycle?mode=${onboardingState.path ?? "free"}&cycleId=${onboardingState.cycle._id}`
			);
		}
		if (onboardingState.cycle) {
			setName(onboardingState.cycle.name);
			setDateRange({
				from: parseISO(onboardingState.cycle.startDate),
				to: parseISO(onboardingState.cycle.endDate),
			});
			setPreset("custom");
		}
		hasInitialized.current = true;
	}, [onboardingState, requestedCycleId, router]);

	const choosePreset = (nextPreset: CyclePreset) => {
		setPreset(nextPreset);
		if (nextPreset === "custom") {
			return;
		}
		const range = getPresetRange(nextPreset);
		setDateRange(range);
		setName(getPresetName(nextPreset, range));
		setDateError(undefined);
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedName = name.trim();
		const nextNameError = normalizedName
			? undefined
			: "Give this cycle a name.";
		const nextDateError =
			dateRange?.from && dateRange.to && dateRange.from < dateRange.to
				? undefined
				: "Choose a start date and an end date after it.";
		setNameError(nextNameError);
		setDateError(nextDateError);
		setSaveError(undefined);
		if (nextNameError) {
			nameInputRef.current?.focus();
			return;
		}
		if (nextDateError || !dateRange?.from || !dateRange.to) {
			document.getElementById("date")?.focus();
			return;
		}

		setIsSaving(true);
		try {
			const cycleId = await saveCycle({
				cycleId: onboardingState?.cycle?._id,
				endDate: format(dateRange.to, "yyyy-MM-dd"),
				name: normalizedName,
				startDate: format(dateRange.from, "yyyy-MM-dd"),
			});
			if (onboardingState?.path === "plan") {
				router.push(`/onboarding/categories?cycleId=${cycleId}`);
				return;
			}
			router.push(`/onboarding/accounts?cycleId=${cycleId}`);
		} catch (_error) {
			setSaveError(
				"We couldn't save this cycle. Check that its dates do not overlap another cycle, then try again."
			);
			setIsSaving(false);
		}
	};

	return (
		<Card className="gap-0 overflow-hidden py-0 shadow-sm">
			<CardHeader className="border-b bg-muted/25 px-5 py-6 sm:px-8">
				<div className="flex items-center gap-3">
					<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<CalendarDays className="size-5" />
					</div>
					<CardTitle className="text-2xl">
						Create your first expense cycle
					</CardTitle>
				</div>
				<p className="max-w-2xl text-muted-foreground leading-6">
					A cycle is simply the month, pay period, or custom span you want to
					track. You can edit it safely when you come back.
				</p>
			</CardHeader>
			<CardContent className="px-5 py-6 sm:px-8 sm:py-8">
				<form className="space-y-7" onSubmit={handleSubmit}>
					{isPlanMode ? null : (
						<fieldset className="space-y-3">
							<legend className="font-medium text-sm">
								Choose a starting point
							</legend>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
								{(["monthly", "pay-period", "custom"] as const).map(
									(option) => (
										<Button
											aria-pressed={preset === option}
											className={cn(
												"h-auto justify-start px-4 py-3",
												preset === option && "border-primary"
											)}
											key={option}
											onClick={() => choosePreset(option)}
											type="button"
											variant={preset === option ? "secondary" : "outline"}
										>
											{PRESET_LABELS[option]}
										</Button>
									)
								)}
							</div>
						</fieldset>
					)}

					<div className="space-y-2">
						<Label htmlFor="cycle-name">Cycle name</Label>
						<Input
							aria-describedby={nameError ? "cycle-name-error" : undefined}
							aria-invalid={Boolean(nameError)}
							id="cycle-name"
							onChange={(event) => {
								setName(event.target.value);
								setNameError(undefined);
							}}
							placeholder="August 2026"
							ref={nameInputRef}
							value={name}
						/>
						{nameError ? (
							<p className="text-destructive text-sm" id="cycle-name-error">
								{nameError}
							</p>
						) : null}
					</div>

					<div className="space-y-2">
						<Label htmlFor="date">Cycle dates</Label>
						<DatePickerWithRange
							date={dateRange}
							numberOfMonths={1}
							onDateChange={(nextRange) => {
								setDateRange(nextRange);
								setPreset("custom");
								setDateError(undefined);
							}}
							placeholder="Choose start and end dates"
						/>
						{dateError ? (
							<p className="text-destructive text-sm" role="alert">
								{dateError}
							</p>
						) : null}
					</div>

					<div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
						<WalletCards className="mt-0.5 size-4 shrink-0 text-primary" />
						<p>
							This cycle remains valid even if you leave optional category or
							account setup for later.
						</p>
					</div>

					<div aria-live="polite">
						{saveError ? (
							<p className="mb-3 text-destructive text-sm" role="alert">
								{saveError}
							</p>
						) : null}
						<OnboardingStepControls>
							<Button
								disabled={isSaving || onboardingState === undefined}
								size="lg"
								type="submit"
							>
								{isSaving ? <LoaderCircle className="animate-spin" /> : null}
								{onboardingState?.cycle
									? "Save cycle and continue"
									: "Create cycle and continue"}
								{isSaving ? null : <ArrowRight />}
							</Button>
						</OnboardingStepControls>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
