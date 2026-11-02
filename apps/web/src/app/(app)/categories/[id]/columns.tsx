"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrency } from "@/hooks/use-currency";
import { reportError } from "@/lib/report-error";

export interface Expense {
	_id: string;
	amount: number;
	categoryName?: string | null;
	date: string;
	spentOn?: string | null;
}

const AmountCell = ({ amount }: { amount: number }) => {
	const { format } = useCurrency();
	return (
		<div className="text-right font-medium tabular-nums">{format(amount)}</div>
	);
};

const ActionsCell = ({ expense }: { expense: Expense }) => {
	const deleteExpense = useMutation(api.expenses.remove);

	const handleDelete = async () => {
		try {
			await deleteExpense({ id: expense._id as Id<"expenses"> });
			toast.success("Expense deleted");
		} catch (error) {
			reportError(error, { feature: "expenses", operation: "delete" });
			toast.error("Failed to delete expense");
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="h-8 w-8 p-0" variant="ghost">
					<span className="sr-only">Open menu</span>
					<MoreHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Actions</DropdownMenuLabel>
				<DropdownMenuItem asChild>
					<Link className="cursor-pointer" href={`/expenses/${expense._id}`}>
						<Pencil className="mr-2 h-4 w-4" />
						Edit
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer text-destructive"
					onClick={handleDelete}
				>
					<Trash className="mr-2 h-4 w-4" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

function SortHeader({
	column,
	label,
	className,
}: {
	column: Column<Expense>;
	label: string;
	className: string;
}) {
	const toggleSorting = useCallback(
		() => column.toggleSorting(column.getIsSorted() === "asc"),
		[column]
	);
	return (
		<Button className={className} onClick={toggleSorting} variant="ghost">
			{label}
			<ArrowUpDown className="ml-2 h-4 w-4" />
		</Button>
	);
}

export const columns: ColumnDef<Expense>[] = [
	{
		accessorKey: "date",
		cell: ({ row }) => {
			const date = row.getValue("date") as string;
			return new Date(date).toLocaleDateString();
		},
		header: ({ column }) => (
			<SortHeader className="-ml-4 h-8" column={column} label="Date" />
		),
	},
	{
		accessorKey: "spentOn",
		cell: ({ row }) => {
			const value = row.getValue("spentOn") as string | null;
			return (
				value || (
					<span className="text-muted-foreground italic">No description</span>
				)
			);
		},
		header: "Description",
	},
	{
		accessorKey: "amount",
		cell: ({ row }) => {
			const amount = Number.parseFloat(row.getValue("amount"));
			return <AmountCell amount={amount} />;
		},
		header: ({ column }) => (
			<div className="flex justify-end">
				<SortHeader className="-mr-4 h-8" column={column} label="Amount" />
			</div>
		),
	},
	{
		cell: ({ row }) => <ActionsCell expense={row.original} />,
		id: "actions",
	},
];
