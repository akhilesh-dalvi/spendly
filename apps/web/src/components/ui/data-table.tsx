"use client";

import {
	type ColumnDef,
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type Row,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
	deleteDescription?: string;
	deleteTitle?: string;
	externalSearchValue?: string;
	onExternalSearchChange?: (value: string) => void;
	onRowClick?: (row: TData) => void;
	onRowDelete?: (row: TData) => void;
	rowClassName?: string | ((row: TData) => string);
	showFooter?: boolean;
}

function stopPropagation(event: React.MouseEvent) {
	event.stopPropagation();
}

function DataTableRow<TData>({
	row,
	onRowClick,
	rowClassName,
	onRowDelete,
	openRowId,
	setOpenRowId,
	deleteTitle,
	deleteDescription,
}: Pick<
	DataTableProps<TData, unknown>,
	"onRowClick" | "rowClassName" | "onRowDelete"
> & {
	row: Row<TData>;
	openRowId: string | null;
	setOpenRowId: (id: string | null) => void;
	deleteTitle: string;
	deleteDescription: string;
}) {
	const handleClick = useCallback(() => {
		if (!openRowId) {
			onRowClick?.(row.original);
		}
	}, [openRowId, onRowClick, row.original]);
	const handleDelete = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onRowDelete?.(row.original);
		},
		[onRowDelete, row.original]
	);
	const changeOpen = useCallback(
		(open: boolean) => setOpenRowId(open ? row.id : null),
		[setOpenRowId, row.id]
	);
	return (
		<TableRow
			className={cn(
				typeof rowClassName === "function"
					? rowClassName(row.original)
					: rowClassName,
				onRowClick && "cursor-pointer"
			)}
			data-state={row.getIsSelected() && "selected"}
			key={row.id}
			onClick={handleClick}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell
					className={cn(getColumnMeta(cell.column.columnDef).className)}
					key={cell.id}
				>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
			{Boolean(onRowDelete) && (
				<TableCell className="w-[1%] px-4 text-right">
					<AlertDialog onOpenChange={changeOpen} open={openRowId === row.id}>
						<AlertDialogTrigger asChild>
							<Button
								className="group"
								onClick={stopPropagation}
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
								<AlertDialogCancel onClick={stopPropagation}>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction onClick={handleDelete} variant="destructive">
									Delete
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</TableCell>
			)}
		</TableRow>
	);
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
		externalSearchValue === undefined ? globalFilter : externalSearchValue;

	const table = useReactTable({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		initialState: {
			pagination: {
				pageSize,
			},
		},
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: onExternalSearchChange || setGlobalFilter,
		onSortingChange: setSorting,
		state: {
			columnFilters,
			globalFilter: effectiveGlobalFilter.trim(),
			sorting,
		},
	});

	useEffect(() => {
		table.setPageSize(pageSize);
	}, [pageSize, table]);

	const changeFilter = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) =>
			table.setGlobalFilter(event.target.value),
		[table]
	);
	const changePageSize = useCallback(
		(value: string) => setPageSize(Number(value)),
		[]
	);
	const previousPage = useCallback(() => table.previousPage(), [table]);
	const nextPage = useCallback(() => table.nextPage(), [table]);

	return (
		<div>
			{!onExternalSearchChange && (
				<div className="flex items-center py-4">
					<Input
						className="max-w-sm"
						onChange={changeFilter}
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
								{headerGroup.headers.map((header) => (
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
								))}
								{Boolean(onRowDelete) && (
									<TableHead className="w-[1%] px-4 text-right">
										Actions
									</TableHead>
								)}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table
								.getRowModel()
								.rows.map((row) => (
									<DataTableRow
										deleteDescription={deleteDescription}
										deleteTitle={deleteTitle}
										key={row.id}
										onRowClick={onRowClick}
										onRowDelete={onRowDelete}
										openRowId={openRowId}
										row={row}
										rowClassName={rowClassName}
										setOpenRowId={setOpenRowId}
									/>
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
					{Boolean(showFooter) && (
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
									{Boolean(onRowDelete) && <TableCell />}
								</TableRow>
							))}
						</TableFooter>
					)}
				</Table>
			</div>
			<div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-sm">Rows per page</span>
					<Select onValueChange={changePageSize} value={String(pageSize)}>
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
						onClick={previousPage}
						size="sm"
						variant="outline"
					>
						Previous
					</Button>
					<Button
						disabled={!table.getCanNextPage()}
						onClick={nextPage}
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
