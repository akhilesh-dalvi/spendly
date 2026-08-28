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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export default function ExpenseDetailModal({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const router = useRouter();
	const { id } = use(params);
	const [open, setOpen] = useState(true);
	const [isDeleted, setIsDeleted] = useState(false);
	const expense = useQuery(
		api.expenses.get,
		isDeleted ? "skip" : { expenseId: id as Id<"expenses"> }
	);
	const removeExpense = useMutation(api.expenses.remove);

	const handleOpenChange = (val: boolean) => {
		setOpen(val);
		if (!val) {
			router.back();
		}
	};

	const handleDelete = async () => {
		try {
			await removeExpense({ id: id as Id<"expenses"> });
			setIsDeleted(true);
			toast.success("Expense deleted");
			handleOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete expense"
			);
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>Edit Expense</DialogTitle>
					<DialogDescription>
						{expense === undefined
							? "Loading expense details"
							: `Created on ${format(parseISO(expense.date), "MMM d, yyyy")}`}
					</DialogDescription>
				</DialogHeader>
				{expense === undefined ? (
					<div className="flex min-h-[200px] items-center justify-center">
						<Loader />
					</div>
				) : (
					<>
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
							onSuccess={() => handleOpenChange(false)}
						/>
						<DialogFooter>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										className="mx-auto border-destructive/30 hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
										onClick={(event) => event.stopPropagation()}
										variant="outline"
									>
										<Trash2 className="mr-2 h-4 w-4" />
										Delete
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Delete expense?</AlertDialogTitle>
										<AlertDialogDescription>
											This action cannot be undone. This will permanently remove
											the expense.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											onClick={(event) => {
												event.stopPropagation();
												handleDelete();
											}}
											variant="destructive"
										>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
