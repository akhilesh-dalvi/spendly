"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CycleForm } from "@/components/cycle-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewCyclePage() {
	const router = useRouter();
	const goBack = useCallback(() => router.back(), [router]);
	const viewCycles = useCallback(() => router.push("/cycles"), [router]);
	const handleSuccess = useCallback(
		(id: string) => router.push(`/cycles/${id}`),
		[router]
	);

	return (
		<div className="mx-auto w-full max-w-2xl space-y-8">
			<div className="flex items-center gap-4">
				<Button
					className="rounded-full"
					onClick={goBack}
					size="icon"
					variant="ghost"
				>
					<ChevronLeft className="h-6 w-6" />
				</Button>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">New Cycle</h1>
					<p className="text-muted-foreground text-sm">
						Set up a new period for tracking your expenses.
					</p>
				</div>
			</div>

			<Card className="border-none bg-card/50 shadow-sm">
				<CardHeader>
					<CardTitle>Cycle Details</CardTitle>
				</CardHeader>
				<CardContent>
					<CycleForm onSuccess={handleSuccess} />
				</CardContent>
			</Card>

			<div className="flex justify-center">
				<Button onClick={viewCycles} variant="ghost">
					View all cycles
				</Button>
			</div>
		</div>
	);
}
