"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { Button } from "@/components/ui/button";

export function SortHeader<T>({
	column,
	children,
	className,
}: {
	column: Column<T>;
	children: ReactNode;
	className?: string;
}) {
	const toggle = useCallback(
		() => column.toggleSorting(column.getIsSorted() === "asc"),
		[column]
	);
	return (
		<Button className={className} onClick={toggle} variant="ghost">
			{children}
			<ArrowUpDown className="ml-2 h-4 w-4" />
		</Button>
	);
}
