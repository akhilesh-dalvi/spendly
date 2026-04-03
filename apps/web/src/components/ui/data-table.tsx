"use client";

import {
	type ColumnDef,
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ColumnMeta {
	className?: string;
	headerClassName?: string;
}

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onRowClick?: (row: TData) => void;
	rowClassName?: string | ((row: TData) => string);
	onRowDelete?: (row: TData) => void;
	deleteTitle?: string;
	deleteDescription?: string;
	showFooter?: boolean;
	externalSearchValue?: string;
	onExternalSearchChange?: (value: string) => void;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	onRowClick,
	rowClassName,
	onRowDelete,
	deleteTitle = "Delete item?",
	deleteDescription = "This action cannot be undone. This will permanently remove the item.",
	showFooter = false,
	externalSearchValue,
	onExternalSearchChange,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [pageSize, setPageSize] = useState(10);
	const [openRowId, setOpenRowId] = useState<string | null>(null);

	const effectiveGlobalFilter =
		externalSearchValue !== undefined ? externalSearchValue : globalFilter;

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		onColumnFiltersChange: setColumnFilters,
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: onExternalSearchChange || setGlobalFilter,
		state: {
			sorting,
			columnFilters,
			globalFilter: effectiveGlobalFilter,
		},
		initialState: {
			pagination: {
				pageSize,
			},
		},
	});

	useEffect(() => {
		table.setPageSize(pageSize);
	}, [pageSize, table]);

	return (
		<div>
			{!onExternalSearchChange && (
				<div className="flex items-center py-4">
					<Input
						className="max-w-sm"
						onChange={(event) => table.setGlobalFilter(event.target.value)}
						placeholder="Filter all columns..."
						value={globalFilter ?? ""}
					/>
				</div>
			)}
			<div className="rounded-md border bg-card/30">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<TableHead
											className={cn(
												getColumnMeta(header.column.columnDef).headerClassName
											)}
											key={header.id}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
										</TableHead>
									);
								})}
								{onRowDelete && (
									<TableHead className="w-[1%] px-4 text-right">
										Actions
									</TableHead>
								)}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									className={cn(
										typeof rowClassName === "function"
											? rowClassName(row.original)
											: rowClassName,
										onRowClick && "cursor-pointer"
									)}
									data-state={row.getIsSelected() && "selected"}
									key={row.id}
									onClick={() => {
										if (openRowId) {
											return;
										}
										onRowClick?.(row.original);
									}}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											className={cn(
												getColumnMeta(cell.column.columnDef).className
											)}
											key={cell.id}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
									{onRowDelete && (
										<TableCell className="w-[1%] px-4 text-right">
											<AlertDialog
												onOpenChange={(open) =>
													setOpenRowId(open ? row.id : null)
												}
												open={openRowId === row.id}
											>
												<AlertDialogTrigger asChild>
													<Button
														className="group"
														onClick={(event) => {
															event.stopPropagation();
														}}
														size="icon-sm"
														variant="ghost"
													>
														<Trash2 className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-destructive" />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
														<AlertDialogDescription>
															{deleteDescription}
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel
															onClick={(event) => event.stopPropagation()}
														>
															Cancel
														</AlertDialogCancel>
														<AlertDialogAction
															onClick={(event) => {
																event.stopPropagation();
																onRowDelete(row.original);
															}}
															variant="destructive"
														>
															Delete
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</TableCell>
									)}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									className="h-24 text-center"
									colSpan={columns.length + (onRowDelete ? 1 : 0)}
								>
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
					{showFooter && (
						<TableFooter className="bg-muted/50">
							{table.getFooterGroups().map((footerGroup) => (
								<TableRow key={footerGroup.id}>
									{footerGroup.headers.map((header) => (
										<TableCell
											className={cn(
												"font-bold text-foreground",
												getColumnMeta(header.column.columnDef).className
											)}
											key={header.id}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.footer,
														header.getContext()
													)}
										</TableCell>
									))}
									{onRowDelete && <TableCell />}
								</TableRow>
							))}
						</TableFooter>
					)}
				</Table>
			</div>
			<div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-sm">Rows per page</span>
					<Select
						onValueChange={(value) => setPageSize(Number(value))}
						value={String(pageSize)}
					>
						<SelectTrigger className="h-8 w-[90px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[5, 10, 20, 50].map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-muted-foreground text-sm">
						Page {table.getState().pagination.pageIndex + 1} of{" "}
						{table.getPageCount()}
					</span>
					<Button
						disabled={!table.getCanPreviousPage()}
						onClick={() => table.previousPage()}
						size="sm"
						variant="outline"
					>
						Previous
					</Button>
					<Button
						disabled={!table.getCanNextPage()}
						onClick={() => table.nextPage()}
						size="sm"
						variant="outline"
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}

function getColumnMeta<TData, TValue>(
	columnDef: ColumnDef<TData, TValue>
): ColumnMeta {
	const extendedColumnDef = columnDef as ColumnDef<TData, TValue> & ColumnMeta;
	return {
		className: extendedColumnDef.className,
		headerClassName: extendedColumnDef.headerClassName,
	};
}
