"use client";

import { useSearchParams } from "next/navigation";
import { ExpenseForm } from "@/components/expense-form";

export default function NewExpensePage() {
	const searchParams = useSearchParams();
	const categoryId = searchParams.get("categoryId");

	return (
		<div className="container mx-auto max-w-lg py-10">
			<h1 className="mb-6 font-bold text-2xl">Add New Expense</h1>
			<div className="rounded-lg border bg-card p-6 shadow-sm">
				<ExpenseForm defaultValues={categoryId ? { categoryId } : undefined} />
			</div>
		</div>
	);
}
