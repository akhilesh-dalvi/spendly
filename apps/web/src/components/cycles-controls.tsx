"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CycleFilter = "all" | "current" | "upcoming" | "past";
export type CycleSort = "newest" | "oldest" | "planned_desc" | "spent_desc";

const FILTER_OPTIONS: Array<{ label: string; value: CycleFilter }> = [
	{ label: "All", value: "all" },
	{ label: "Current", value: "current" },
	{ label: "Upcoming", value: "upcoming" },
	{ label: "History", value: "past" },
];

interface CyclesControlsProps {
	selectedFilter: CycleFilter;
	onFilterChange: (value: CycleFilter) => void;
	selectedSort: CycleSort;
	onSortChange: (value: CycleSort) => void;
	budgetOnly: boolean;
	onBudgetOnlyChange: (value: boolean) => void;
	className?: string;
}

export function CyclesControls({
	selectedFilter,
	onFilterChange,
	selectedSort,
	onSortChange,
	budgetOnly,
	onBudgetOnlyChange,
	className,
}: CyclesControlsProps) {
	return (
		<div
			className={cn(
				"sticky top-0 z-20 rounded-xl border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/70",
				"fade-in-50 slide-in-from-top-1 animate-in duration-300",
				className
			)}
		>
			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div
					aria-label="Cycle filter"
					className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1"
					role="tablist"
				>
					{FILTER_OPTIONS.map((option) => (
						<Button
							aria-selected={selectedFilter === option.value}
							className={cn(
								"h-8 shrink-0 rounded-md px-3 text-xs",
								selectedFilter === option.value &&
									"bg-background text-foreground shadow-sm"
							)}
							key={option.value}
							onClick={() => onFilterChange(option.value)}
							size="sm"
							variant="ghost"
						>
							{option.label}
						</Button>
					))}
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2">
						<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
						<Select
							onValueChange={(value) => onSortChange(value as CycleSort)}
							value={selectedSort}
						>
							<SelectTrigger
								aria-label="Sort cycles"
								className="min-w-[180px]"
								size="sm"
							>
								<SelectValue placeholder="Sort cycles" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="newest">Newest first</SelectItem>
								<SelectItem value="oldest">Oldest first</SelectItem>
								<SelectItem value="planned_desc">Highest planned</SelectItem>
								<SelectItem value="spent_desc">Highest spent</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<Button
						aria-pressed={budgetOnly}
						className={cn(
							"h-8 rounded-md border px-2.5 font-medium text-xs",
							budgetOnly && "border-primary/40 bg-primary/10"
						)}
						onClick={() => onBudgetOnlyChange(!budgetOnly)}
						size="sm"
						type="button"
						variant="ghost"
					>
						Show only with budget
					</Button>
				</div>
			</div>
		</div>
	);
}
