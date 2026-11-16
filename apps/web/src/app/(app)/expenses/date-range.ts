import {
	endOfMonth,
	format,
	parseISO,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
} from "date-fns";

export interface ExpenseDateRange {
	from: string;
	through: string;
}

export const expenseDatePresets = [
	{ label: "Today", value: "today" },
	{ label: "Week to date", value: "this-week" },
	{ label: "Last week", value: "last-week" },
	{ label: "Month to date", value: "this-month" },
	{ label: "Last month", value: "last-month" },
	{ label: "Last 30 days", value: "last-30-days" },
] as const;

type ExpenseDatePreset = (typeof expenseDatePresets)[number]["value"];

export function expenseDatePresetRange(
	preset: ExpenseDatePreset,
	today = new Date()
): ExpenseDateRange {
	let from = today;
	let through = today;
	switch (preset) {
		case "today":
			break;
		case "this-week":
			from = startOfWeek(today, { weekStartsOn: 1 });
			break;
		case "last-week": {
			const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
			from = subDays(thisMonday, 7);
			through = subDays(thisMonday, 1);
			break;
		}
		case "this-month":
			from = startOfMonth(today);
			break;
		case "last-month": {
			const previousMonth = subMonths(today, 1);
			from = startOfMonth(previousMonth);
			through = endOfMonth(previousMonth);
			break;
		}
		case "last-30-days":
			from = subDays(today, 29);
			break;
		default:
			throw new Error(preset satisfies never);
	}
	return {
		from: format(from, "yyyy-MM-dd"),
		through: format(through, "yyyy-MM-dd"),
	};
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function isExpenseFilterDate(value: string): boolean {
	if (!DATE_PATTERN.test(value) || value.startsWith("0000")) {
		return false;
	}
	const date = new Date(`${value}T00:00:00.000Z`);
	return (
		!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	);
}

export function expenseDateRangeError({ from, through }: ExpenseDateRange) {
	if (from && !isExpenseFilterDate(from)) {
		return "Enter a valid From date as YYYY-MM-DD.";
	}
	if (through && !isExpenseFilterDate(through)) {
		return "Enter a valid Through date as YYYY-MM-DD.";
	}
	if (from && through && from > through) {
		return "Through must be on or after From.";
	}
	if (through === "9999-12-31") {
		return "Through must be before 9999-12-31.";
	}
	return null;
}

// Advance a calendar date, never a duration in milliseconds or a local instant.
// The backend's existing endDate contract remains exclusive.
export function exclusiveExpenseEndDate(through: string): string {
	const date = new Date(`${through}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

export function expenseDateRangeLabel(range: ExpenseDateRange): string {
	if (expenseDateRangeError(range)) {
		return "Invalid date range";
	}
	const from = range.from ? format(parseISO(range.from), "MMM d, yyyy") : "";
	const through = range.through
		? format(parseISO(range.through), "MMM d, yyyy")
		: "";
	if (from && through) {
		return from === through ? from : `${from} – ${through}`;
	}
	if (from) {
		return `From ${from}`;
	}
	return through ? `Through ${through}` : "All dates";
}
