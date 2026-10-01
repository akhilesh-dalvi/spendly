const SAFE_SHELL_VALUE_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/u;

export const shellQuote = (value: string): string => {
	if (SAFE_SHELL_VALUE_PATTERN.test(value)) {
		return value;
	}
	return `'${value.replaceAll("'", `'"'"'`)}'`;
};

const appendOption = (parts: string[], name: string, value: unknown): void => {
	if (value === undefined || value === false) {
		return;
	}
	if (value === true) {
		parts.push(`--${name}`);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			parts.push(`--${name}`, shellQuote(String(item)));
		}
		return;
	}
	parts.push(`--${name}`, shellQuote(String(value)));
};

export const buildContinuationCommand = (options: {
	args: Readonly<Record<string, unknown>>;
	command: readonly string[];
	nextCursor: string;
}): string => {
	const parts = ["spendly", ...options.command];
	const orderedOptions = [
		["cycleId", "cycle-id"],
		["categoryId", "category-id"],
		["uncategorized", "uncategorized"],
		["accountId", "account-id"],
		["unassigned", "unassigned"],
		["tagIds", "tag-id"],
		["from", "from"],
		["to", "to"],
		["limit", "limit"],
	] as const;
	for (const [key, flag] of orderedOptions) {
		appendOption(parts, flag, options.args[key]);
	}
	appendOption(parts, "cursor", options.nextCursor);
	return parts.join(" ");
};

export const renderPaginationFooter = (options: {
	continuationCommand?: string;
	count: number;
	hasMore: boolean;
}): string => {
	const summary = options.hasMore
		? `Showing ${options.count}. More results are available.`
		: `Showing ${options.count}. End of results.`;
	if (!(options.hasMore && options.continuationCommand)) {
		return summary;
	}
	return `${summary}\nNext page: ${options.continuationCommand}`;
};

export interface ActiveFilterLabels {
	account?: string;
	category?: string;
	cycle?: string;
	tags?: string[];
}

export const renderActiveFilters = (
	args: Readonly<Record<string, unknown>>,
	labels: ActiveFilterLabels = {}
): string | undefined => {
	const rows: [string, unknown][] = [
		["cycle", labels.cycle ?? args.cycleId],
		[
			"category",
			args.uncategorized
				? "Uncategorized"
				: (labels.category ?? args.categoryId),
		],
		[
			"account",
			args.unassigned ? "Unassigned" : (labels.account ?? args.accountId),
		],
		[
			"tags",
			labels.tags?.join(", ") ??
				(Array.isArray(args.tagIds) ? args.tagIds.join(", ") : undefined),
		],
		["from", args.from],
		["to", args.to],
	];
	const active = rows
		.filter(([, value]) => value !== undefined)
		.map(([label, value]) => `${label}: ${String(value)}`);
	return active.length > 0 ? `Filters: ${active.join("; ")}` : undefined;
};
