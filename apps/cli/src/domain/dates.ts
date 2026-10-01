import { CliError } from "../errors.js";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const parseDate = (value: string): string => {
	if (!ISO_DATE_PATTERN.test(value)) {
		throw new CliError("INVALID_INPUT", "Dates must use YYYY-MM-DD");
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== value
	) {
		throw new CliError("INVALID_INPUT", "The date is invalid");
	}
	return value;
};

const detectTimeZone = (runtimeTimeZone?: () => string | undefined) => {
	try {
		if (runtimeTimeZone) {
			return runtimeTimeZone();
		}
		return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
	} catch {
		return undefined;
	}
};

const formatDateInTimeZone = (date: Date, timeZone: string): string => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		day: "2-digit",
		month: "2-digit",
		timeZone,
		year: "numeric",
	}).formatToParts(date);
	const values = new Map(parts.map((part) => [part.type, part.value]));
	const year = values.get("year");
	const month = values.get("month");
	const day = values.get("day");
	if (!(year && month && day)) {
		throw new CliError("INVALID_INPUT", "Unable to resolve the local date");
	}
	return parseDate(`${year}-${month}-${day}`);
};

export const resolveCommandDate = (options: {
	explicitDate?: string;
	now?: () => Date;
	timeZone?: () => string | undefined;
}): {
	date: string;
	dateSource: "explicit" | "local_default";
	timezone: string | null;
} => {
	const timezone = detectTimeZone(options.timeZone);
	if (options.explicitDate) {
		return {
			date: parseDate(options.explicitDate),
			dateSource: "explicit",
			timezone: timezone ?? null,
		};
	}
	if (!timezone) {
		throw new CliError(
			"INVALID_INPUT",
			"Unable to detect the local timezone; provide --date YYYY-MM-DD"
		);
	}
	return {
		date: formatDateInTimeZone(options.now?.() ?? new Date(), timezone),
		dateSource: "local_default",
		timezone,
	};
};
