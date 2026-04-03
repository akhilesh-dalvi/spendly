"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ExpenseForm } from "@/components/expense-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export default function NewExpenseModal() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const categoryId = searchParams.get("categoryId");

	// Default open to true since the route is active
	const [open, setOpen] = useState(true);

	const handleOpenChange = (val: boolean) => {
		setOpen(val);
		if (!val) {
			router.back();
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Add Expense</DialogTitle>
					<DialogDescription>
						Log an expense in a few quick steps.
					</DialogDescription>
				</DialogHeader>
				<ExpenseForm
					className="mt-4"
					defaultValues={categoryId ? { categoryId } : undefined}
					onSuccess={() => handleOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
