"use client";

import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { ChevronLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoryForm } from "@/components/category-form";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function NewCategoryPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const cycleId = searchParams.get("id") as Id<"expense_cycles">;

	if (!cycleId) {
		router.push("/dashboard");
		return null;
	}

	return (
		<div className="mx-auto max-w-2xl space-y-4">
			<Button
				className="-ml-2 text-muted-foreground"
				onClick={() => router.back()}
				size="sm"
				variant="ghost"
			>
				<ChevronLeft className="mr-1 h-4 w-4" />
				Back
			</Button>

			<Card>
				<CardHeader>
					<CardTitle>Add Category</CardTitle>
					<CardDescription>
						Create a new spending category for this cycle.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<CategoryForm
						cycleId={cycleId}
						onSuccess={() => router.push("/dashboard")}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
