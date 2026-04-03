"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { toast } from "sonner";
import { CycleForm } from "@/components/cycle-form";
import { Loader } from "@/components/loader";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function EditCyclePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const router = useRouter();
	const { id } = React.use(params);
	const cycleId = id as Id<"expense_cycles">;

	const cycle = useQuery(api.cycles.get, cycleId ? { cycleId } : "skip");
	const removeCycle = useMutation(api.cycles.remove);

	if (cycle === undefined) {
		return <Loader />;
	}

	if (!cycle) {
		return (
			<div className="flex h-full flex-col items-center justify-center space-y-4">
				<h1 className="font-bold text-2xl">Cycle not found</h1>
				<Button onClick={() => router.push("/cycles")}>Back to Cycles</Button>
			</div>
		);
	}

	const handleDelete = async () => {
		try {
			await removeCycle({ id: cycleId });
			toast.success("Cycle deleted successfully");
			router.push("/cycles");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to delete cycle";
			toast.error(message.replace("ConvexError: ", ""));
		}
	};

	return (
		<div className="mx-auto w-full max-w-2xl space-y-8">
			<div className="flex items-center gap-4">
				<Button
					className="rounded-full"
					onClick={() => router.back()}
					size="icon"
					variant="ghost"
				>
					<ChevronLeft className="h-6 w-6" />
				</Button>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">Edit Cycle</h1>
					<p className="text-muted-foreground text-sm">
						Update the name or dates for this period.
					</p>
				</div>
			</div>

			<Card className="border-none bg-card/50 shadow-sm">
				<CardHeader>
					<CardTitle>Cycle Details</CardTitle>
					<CardDescription>
						Changes to dates will affect which expenses are assigned to this
						cycle.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<CycleForm
						cycleId={cycleId}
						defaultValues={{
							name: cycle.name,
							startDate: cycle.startDate,
							endDate: cycle.endDate,
						}}
						onSuccess={() => {
							router.push(`/cycles/${cycleId}`);
						}}
					/>
				</CardContent>
			</Card>

			<Card className="border-destructive/20 bg-destructive/5">
				<CardHeader>
					<CardTitle className="text-destructive">Danger Zone</CardTitle>
					<CardDescription>
						Once deleted, you cannot recover this cycle and its category
						configuration.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button className="w-full sm:w-auto" variant="destructive">
								<Trash2 className="mr-2 h-4 w-4" />
								Delete Cycle
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
								<AlertDialogDescription>
									This will permanently delete the cycle "{cycle.name}" and all
									its associated categories. You can only delete a cycle if it
									has no expenses assigned to it.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									onClick={handleDelete}
								>
									Delete Cycle
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</CardContent>
			</Card>
		</div>
	);
}
