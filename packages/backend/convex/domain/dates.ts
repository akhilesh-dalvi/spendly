import { ConvexError } from "convex/values";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const validateLocalDate = (date: string): string => {
	if (!ISO_DATE_PATTERN.test(date)) {
		throw new ConvexError("INVALID_DATE");
	}
	const parsed = new Date(`${date}T00:00:00.000Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== date
	) {
		throw new ConvexError("INVALID_DATE");
	}
	return date;
};

export const resolveLocalDate = (
	date: string | undefined,
	now = Date.now()
): string =>
	validateLocalDate(date ?? new Date(now).toISOString().slice(0, 10));
