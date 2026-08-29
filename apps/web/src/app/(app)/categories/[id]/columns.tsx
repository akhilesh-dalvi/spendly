"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash } from "lucide-react";
import Link from "next/link";
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

// This type is based on the usage in page.tsx and RecentActivity
export interface Expense {
	_id: string;
	amount: number;
	date: string;
	spentOn?: string | null;
	categoryName?: string | null;
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
		} catch (_error) {
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

export const columns: ColumnDef<Expense>[] = [
	{
		accessorKey: "date",
		header: ({ column }) => {
			return (
				<Button
					className="-ml-4 h-8"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					variant="ghost"
				>
					Date
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const date = row.getValue("date") as string;
			return new Date(date).toLocaleDateString();
		},
	},
	{
		accessorKey: "spentOn",
		header: "Description",
		cell: ({ row }) => {
			const value = row.getValue("spentOn") as string | null;
			return (
				value || (
					<span className="text-muted-foreground italic">No description</span>
				)
			);
		},
	},
	{
		accessorKey: "amount",
		header: ({ column }) => {
			return (
				<div className="flex justify-end">
					<Button
						className="-mr-4 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
						variant="ghost"
					>
						Amount
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				</div>
			);
		},
		cell: ({ row }) => {
			const amount = Number.parseFloat(row.getValue("amount"));
			return <AmountCell amount={amount} />;
		},
	},
	{
		id: "actions",
		cell: ({ row }) => <ActionsCell expense={row.original} />,
	},
];
