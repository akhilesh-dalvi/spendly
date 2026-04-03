"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
	date?: Date;
	onDateChange: (date: Date | undefined) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	captionLayout?: React.ComponentProps<typeof Calendar>["captionLayout"];
}

export function DatePicker({
	date,
	onDateChange,
	placeholder = "Pick a date",
	className,
	disabled,
	captionLayout,
}: DatePickerProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					className={cn(
						"w-full justify-start text-left font-normal",
						className
					)}
					data-empty={!date}
					disabled={disabled}
					type="button"
					variant="outline"
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{date ? format(date, "PPP") : <span>{placeholder}</span>}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					captionLayout={captionLayout}
					initialFocus
					mode="single"
					onSelect={onDateChange}
					selected={date}
				/>
			</PopoverContent>
		</Popover>
	);
}

export function DatePickerWithRange({
	className,
	date,
	onDateChange,
	placeholder = "Pick a date",
	disabled,
	captionLayout,
}: {
	className?: string;
	date: DateRange | undefined;
	onDateChange: (date: DateRange | undefined) => void;
	placeholder?: string;
	disabled?: boolean;
	captionLayout?: React.ComponentProps<typeof Calendar>["captionLayout"];
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						className={cn(
							"w-full justify-start text-left font-normal",
							className
						)}
						data-empty={!date?.from}
						disabled={disabled}
						id="date"
						type="button"
						variant={"outline"}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{!date?.from && <span>{placeholder}</span>}
						{date?.from && !date.to && format(date.from, "LLL dd, y")}
						{date?.from && date.to && (
							<>
								{format(date.from, "LLL dd, y")} -{" "}
								{format(date.to, "LLL dd, y")}
							</>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-0">
					<Calendar
						captionLayout={captionLayout}
						defaultMonth={date?.from}
						mode="range"
						numberOfMonths={2}
						onSelect={onDateChange}
						selected={date}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
