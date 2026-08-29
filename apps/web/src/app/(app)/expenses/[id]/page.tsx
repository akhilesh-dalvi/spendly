"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { ExpenseForm } from "@/components/expense-form";
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

export default function ExpenseDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	const [isDeleted, setIsDeleted] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const expense = useQuery(
		api.expenses.get,
		isDeleted ? "skip" : { expenseId: id as Id<"expenses"> }
	);
	const removeExpense = useMutation(api.expenses.remove);

	const handleDelete = async () => {
		try {
			await removeExpense({ id: id as Id<"expenses"> });
			setIsDeleteDialogOpen(false);
			setIsDeleted(true);
			toast.success("Expense deleted");
			router.push("/expenses");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete expense"
			);
		}
	};

	if (expense === undefined) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader />
			</div>
		);
	}

	return (
		<div className="container mx-auto max-w-3xl space-y-6 py-10">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="font-bold text-3xl tracking-tight">Edit Expense</h1>
					<p className="text-muted-foreground text-sm">
						Created on {format(parseISO(expense.date), "MMM d, yyyy")}
					</p>
				</div>
				<AlertDialog
					onOpenChange={setIsDeleteDialogOpen}
					open={isDeleteDialogOpen}
				>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete expense?</AlertDialogTitle>
							<AlertDialogDescription>
								This action cannot be undone. This will permanently remove the
								expense.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={handleDelete} variant="destructive">
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>

			<div className="rounded-xl border bg-card p-6 shadow-sm">
				<ExpenseForm
					defaultValues={{
						amount: expense.amount,
						accountId: expense.accountId ?? "",
						categoryId: expense.categoryId ?? "",
						date: parseISO(expense.date),
						spentOn: expense.spentOn ?? "",
						tagIds: expense.tagIds ?? [],
					}}
					expenseId={expense._id}
					onSuccess={() => router.push("/expenses")}
				/>
			</div>
		</div>
	);
}
