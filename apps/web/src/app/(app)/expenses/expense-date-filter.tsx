"use client";

import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import {
	type ChangeEvent,
	type FormEvent,
	useCallback,
	useId,
	useState,
} from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	type ExpenseDateRange,
	expenseDatePresetRange,
	expenseDatePresets,
	expenseDateRangeError,
	expenseDateRangeLabel,
	isExpenseFilterDate,
} from "./date-range";

interface ExpenseDateFilterProps {
	onApply: (range: ExpenseDateRange) => void;
	value: ExpenseDateRange;
}

export function ExpenseDateFilter({ onApply, value }: ExpenseDateFilterProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value);
	const [selectedPreset, setSelectedPreset] = useState("");
	const id = useId();
	const isMobile = useIsMobile();
	const error = expenseDateRangeError(draft);
	const from = isExpenseFilterDate(draft.from)
		? parseISO(draft.from)
		: undefined;
	const to = isExpenseFilterDate(draft.through)
		? parseISO(draft.through)
		: undefined;
	const [month, setMonth] = useState(from ?? to ?? new Date());
	const changeOpen = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				setSelectedPreset("");
				setDraft(value);
				const firstDate = [value.from, value.through].find(isExpenseFilterDate);
				setMonth(firstDate ? parseISO(firstDate) : new Date());
			}
			setOpen(nextOpen);
		},
		[value]
	);
	const changeFrom = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		setSelectedPreset("");
		const next = event.target.value;
		setDraft((current) => ({ ...current, from: next }));
		if (isExpenseFilterDate(next)) {
			setMonth(parseISO(next));
		}
	}, []);
	const changeThrough = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		setSelectedPreset("");
		const next = event.target.value;
		setDraft((current) => ({ ...current, through: next }));
		if (isExpenseFilterDate(next)) {
			setMonth(parseISO(next));
		}
	}, []);
	const selectRange = useCallback((range: DateRange | undefined) => {
		setSelectedPreset("");
		setDraft({
			from: range?.from ? format(range.from, "yyyy-MM-dd") : "",
			through: range?.to ? format(range.to, "yyyy-MM-dd") : "",
		});
	}, []);
	const selectPreset = useCallback(
		(presetValue: string) => {
			const requestedPreset = presetValue || selectedPreset;
			const preset = expenseDatePresets.find(
				(option) => option.value === requestedPreset
			);
			if (!preset) {
				return;
			}
			const range = expenseDatePresetRange(preset.value);
			setDraft(range);
			setMonth(parseISO(range.from));
			setSelectedPreset(preset.value);
		},
		[selectedPreset]
	);
	const apply = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!expenseDateRangeError(draft)) {
				onApply(draft);
				setOpen(false);
			}
		},
		[draft, onApply]
	);
	const clear = useCallback(() => {
		onApply({ from: "", through: "" });
		setOpen(false);
	}, [onApply]);

	return (
		<Popover onOpenChange={changeOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label="Date range"
					className="h-10 max-w-full"
					type="button"
					variant="outline"
				>
					<CalendarIcon data-icon="inline-start" />
					<span className="truncate">{expenseDateRangeLabel(value)}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				aria-label="Expense date range"
				className="max-h-[var(--radix-popover-content-available-height)] w-auto max-w-[calc(100vw-2rem)] overflow-auto"
			>
				<form className="flex flex-col gap-3" onSubmit={apply}>
					<div className="flex flex-col gap-2">
						<ToggleGroup
							aria-describedby={`${id}-preset-help`}
							aria-label="Date presets"
							className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3"
							onValueChange={selectPreset}
							size="sm"
							spacing={2}
							type="single"
							value={selectedPreset}
							variant="outline"
						>
							{expenseDatePresets.map((preset) => (
								<ToggleGroupItem
									key={preset.value}
									type="button"
									value={preset.value}
								>
									{preset.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
						<FieldDescription id={`${id}-preset-help`}>
							Weeks start Monday. “To date” ends today. All ranges include both
							dates.
						</FieldDescription>
					</div>
					<FieldGroup className="grid grid-cols-2 gap-3">
						<Field data-invalid={Boolean(error)}>
							<FieldLabel htmlFor={`${id}-from`}>From</FieldLabel>
							<Input
								aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
								aria-invalid={Boolean(error)}
								autoComplete="off"
								id={`${id}-from`}
								onChange={changeFrom}
								placeholder="YYYY-MM-DD"
								value={draft.from}
							/>
						</Field>
						<Field data-invalid={Boolean(error)}>
							<FieldLabel htmlFor={`${id}-through`}>Through</FieldLabel>
							<Input
								aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
								aria-invalid={Boolean(error)}
								autoComplete="off"
								id={`${id}-through`}
								onChange={changeThrough}
								placeholder="YYYY-MM-DD"
								value={draft.through}
							/>
						</Field>
					</FieldGroup>
					<FieldDescription id={`${id}-help`}>
						Both dates included. Leave either blank for no limit.
					</FieldDescription>
					{error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
					<Calendar
						mode="range"
						month={month}
						numberOfMonths={isMobile ? 1 : 2}
						onMonthChange={setMonth}
						onSelect={selectRange}
						selected={{ from, to }}
					/>
					<div className="flex justify-between gap-2">
						<Button onClick={clear} type="button" variant="ghost">
							Clear
						</Button>
						<Button disabled={Boolean(error)} type="submit">
							Apply
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
