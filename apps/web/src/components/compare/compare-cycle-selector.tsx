"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, Check, ChevronDown, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CycleOption {
	endDate: string;
	id: string;
	name: string;
	startDate: string;
}

interface CompareCycleSelectorProps {
	cycles: CycleOption[];
	max: number;
	onChange: (ids: string[]) => void;
	selectedIds: string[];
}

function CycleSelectionOption({
	cycle,
	isSelected,
	isDisabled,
	onToggle,
}: {
	cycle: CycleOption;
	isSelected: boolean;
	isDisabled: boolean;
	onToggle: (id: string) => void;
}) {
	const toggle = useCallback(() => onToggle(cycle.id), [onToggle, cycle.id]);
	return (
		<CommandItem
			className={cn(isDisabled && "cursor-not-allowed opacity-50")}
			disabled={isDisabled}
			onSelect={toggle}
			value={`${cycle.name} ${cycle.startDate} ${cycle.endDate}`}
		>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="flex h-4 w-4 items-center justify-center">
					{isSelected ? (
						<Check className="h-4 w-4 text-primary" />
					) : (
						<span className="h-3.5 w-3.5 rounded-sm border border-border" />
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate font-medium text-sm">{cycle.name}</p>
					<p className="text-muted-foreground text-xs">
						{format(parseISO(cycle.startDate), "MMM d, yyyy")} -{" "}
						{format(parseISO(cycle.endDate), "MMM d, yyyy")}
					</p>
				</div>
			</div>
		</CommandItem>
	);
}

function SelectedCycleBadge({
	cycle,
	onRemove,
}: {
	cycle: CycleOption;
	onRemove: (id: string) => void;
}) {
	const remove = useCallback(() => onRemove(cycle.id), [onRemove, cycle.id]);
	return (
		<Badge className="gap-1 pr-1" variant="outline">
			<span className="max-w-[200px] truncate">{cycle.name}</span>
			<button
				aria-label={`Remove ${cycle.name}`}
				className="rounded-sm p-0.5 transition-colors hover:bg-muted"
				onClick={remove}
				type="button"
			>
				<X className="h-3 w-3" />
			</button>
		</Badge>
	);
}

export function CompareCycleSelector({
	cycles,
	selectedIds,
	onChange,
	max,
}: CompareCycleSelectorProps) {
	const [open, setOpen] = useState(false);

	const selectedCycles = useMemo(() => {
		const idSet = new Set(selectedIds);
		return cycles.filter((cycle) => idSet.has(cycle.id));
	}, [cycles, selectedIds]);

	const toggleSelection = useCallback(
		(id: string) => {
			const isSelected = selectedIds.includes(id);
			if (isSelected) {
				onChange(selectedIds.filter((existingId) => existingId !== id));
				return;
			}

			if (selectedIds.length >= max) {
				return;
			}
			onChange([...selectedIds, id]);
		},
		[selectedIds, max, onChange]
	);

	const removeSelection = useCallback(
		(id: string) => {
			onChange(selectedIds.filter((existingId) => existingId !== id));
		},
		[onChange, selectedIds]
	);

	return (
		<div className="space-y-3">
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-expanded={open}
						className="w-full justify-between"
						role="combobox"
						variant="outline"
					>
						<span className="flex min-w-0 items-center gap-2 truncate text-left">
							<CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
							<span className="truncate">
								{selectedIds.length > 0
									? `${selectedIds.length} cycle${selectedIds.length === 1 ? "" : "s"} selected`
									: "Select cycles to compare"}
							</span>
						</span>
						<ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[min(520px,calc(100vw-2rem))] p-0"
				>
					<Command>
						<CommandInput placeholder="Search cycles..." />
						<CommandList>
							<CommandEmpty>No cycles found.</CommandEmpty>
							<CommandGroup>
								{cycles.map((cycle) => {
									const isSelected = selectedIds.includes(cycle.id);
									const isDisabled = !isSelected && selectedIds.length >= max;
									return (
										<CycleSelectionOption
											cycle={cycle}
											isDisabled={isDisabled}
											isSelected={isSelected}
											key={cycle.id}
											onToggle={toggleSelection}
										/>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			<div className="flex flex-wrap gap-2">
				{selectedCycles.length === 0 ? (
					<p className="text-muted-foreground text-xs">
						No cycles selected yet.
					</p>
				) : (
					selectedCycles.map((cycle) => (
						<SelectedCycleBadge
							cycle={cycle}
							key={cycle.id}
							onRemove={removeSelection}
						/>
					))
				)}
			</div>
		</div>
	);
}
