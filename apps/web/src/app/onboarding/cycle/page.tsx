"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { DatePickerWithRange } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PENDING_PLAN_SETUP_KEY = "spendly:pending-plan-setup";

export default function OnboardingCyclePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const mode = searchParams.get("mode") || "free";
	const createCycle = useMutation(api.cycles.create);

	const today = new Date();
	const [name, setName] = useState(format(today, "MMMM yyyy"));
	const [dateRange, setDateRange] = useState<DateRange | undefined>({
		from: startOfMonth(today),
		to: endOfMonth(today),
	});
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!(dateRange?.from && dateRange?.to)) {
			toast.error("Please select both start and end dates");
			return;
		}

		setIsLoading(true);

		try {
			const cycle = await createCycle({
				name,
				startDate: format(dateRange.from, "yyyy-MM-dd"),
				endDate: format(dateRange.to, "yyyy-MM-dd"),
			});

			if (!cycle) {
				throw new Error("Failed to create cycle");
			}

			toast.success("First cycle created!");

			if (mode === "plan") {
				window.sessionStorage.setItem(PENDING_PLAN_SETUP_KEY, "true");
				router.replace(`/onboarding/categories?cycleId=${cycle._id}`);
			} else {
				window.sessionStorage.removeItem(PENDING_PLAN_SETUP_KEY);
				router.push("/dashboard");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create cycle"
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="mx-auto max-w-md">
			<Card>
				<CardHeader>
					<CardTitle>Create your first Cycle</CardTitle>
					<CardDescription>
						Cycles are time periods (like months) used to group your expenses.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" onSubmit={handleSubmit}>
						<div className="space-y-2">
							<Label htmlFor="name">Cycle Name</Label>
							<Input
								id="name"
								onChange={(e) => setName(e.target.value)}
								placeholder="January 2026"
								required
								value={name}
							/>
						</div>
						<div className="space-y-2">
							<Label>Cycle Duration</Label>
							<DatePickerWithRange
								date={dateRange}
								onDateChange={setDateRange}
							/>
						</div>
						<Button className="w-full" disabled={isLoading} type="submit">
							{isLoading ? "Creating..." : "Continue"}
						</Button>
					</form>
				</CardContent>
			</Card>
			<p className="mt-4 text-center text-muted-foreground text-sm">
				Don't worry, all these settings can be updated later in your dashboard.
			</p>
		</div>
	);
}
