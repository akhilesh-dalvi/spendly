import type { OutputWriter } from "../runtime.js";

const DEFAULT_TERMINAL_COLUMNS = 100;
const MINIMUM_TERMINAL_COLUMNS = 20;
const TABLE_GAP = "  ";
const WHITESPACE_PATTERN = /\s+/u;
const ESCAPE_CHARACTER = String.fromCharCode(27);

const amountFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	useGrouping: true,
});

export interface HumanRenderOptions {
	columns?: number;
}

interface HumanTableOptions extends HumanRenderOptions {
	emptyMessage: string;
	rightAlign?: readonly number[];
}

const stripAnsiSequences = (value: string): string => {
	let result = "";
	let index = 0;
	while (index < value.length) {
		if (value[index] === ESCAPE_CHARACTER && value[index + 1] === "[") {
			index += 2;
			while (index < value.length) {
				const codePoint = value.codePointAt(index) ?? 0;
				index += 1;
				if (codePoint >= 64 && codePoint <= 126) {
					break;
				}
			}
			continue;
		}
		result += value[index] ?? "";
		index += 1;
	}
	return result;
};

const visibleWidth = (value: string): number =>
	Array.from(stripAnsiSequences(value)).length;

const terminalColumns = (columns: number | undefined): number => {
	if (!(columns && Number.isFinite(columns))) {
		return DEFAULT_TERMINAL_COLUMNS;
	}
	return Math.max(MINIMUM_TERMINAL_COLUMNS, Math.floor(columns));
};

const padCell = (value: string, width: number, alignRight: boolean): string => {
	const padding = " ".repeat(Math.max(0, width - visibleWidth(value)));
	return alignRight ? `${padding}${value}` : `${value}${padding}`;
};

const splitLongToken = (token: string, width: number): string[] => {
	const characters = Array.from(token);
	const chunks: string[] = [];
	for (let index = 0; index < characters.length; index += width) {
		chunks.push(characters.slice(index, index + width).join(""));
	}
	return chunks;
};

const wrapValue = (value: string, width: number): string[] => {
	if (visibleWidth(value) <= width) {
		return [value];
	}
	const tokens = value
		.split(WHITESPACE_PATTERN)
		.flatMap((token) =>
			visibleWidth(token) > width ? splitLongToken(token, width) : [token]
		);
	const lines: string[] = [];
	let current = "";
	for (const token of tokens) {
		const candidate = current ? `${current} ${token}` : token;
		if (visibleWidth(candidate) <= width) {
			current = candidate;
			continue;
		}
		if (current) {
			lines.push(current);
		}
		current = token;
	}
	if (current) {
		lines.push(current);
	}
	return lines.length > 0 ? lines : [""];
};

const renderStackedRecord = (
	headers: readonly string[],
	row: readonly string[],
	columns: number
): string => {
	const labelWidth = Math.min(
		Math.max(...headers.map((header) => visibleWidth(header))),
		Math.max(1, columns - 4)
	);
	return headers
		.flatMap((header, index) => {
			const label = `${header.padEnd(labelWidth)}: `;
			const continuation = " ".repeat(visibleWidth(label));
			const valueWidth = Math.max(1, columns - visibleWidth(label));
			return wrapValue(row[index] ?? "-", valueWidth).map((line, lineIndex) =>
				lineIndex === 0 ? `${label}${line}` : `${continuation}${line}`
			);
		})
		.join("\n");
};

export const formatMoney = (amount: number, currency: string): string => {
	const normalizedAmount = Object.is(amount, -0) ? 0 : amount;
	return `${currency} ${amountFormatter.format(normalizedAmount)}`;
};

const parseLocalDate = (value: string): Date =>
	new Date(`${value}T00:00:00.000Z`);

const formatDatePart = (date: Date, includeYear: boolean): string => {
	const monthDay = new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(date);
	return includeYear ? `${monthDay}, ${date.getUTCFullYear()}` : monthDay;
};

export const formatInclusiveDateRange = (
	startDate: string,
	endDateExclusive: string
): string => {
	const start = parseLocalDate(startDate);
	const end = parseLocalDate(endDateExclusive);
	end.setUTCDate(end.getUTCDate() - 1);
	const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
	const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
	if (sameMonth) {
		const month = new Intl.DateTimeFormat("en-US", {
			month: "short",
			timeZone: "UTC",
		}).format(start);
		return `${month} ${start.getUTCDate()}-${end.getUTCDate()}, ${end.getUTCFullYear()}`;
	}
	return `${formatDatePart(start, !sameYear)}-${formatDatePart(end, true)}`;
};

export const renderHumanTable = (
	headers: readonly string[],
	rows: readonly (readonly string[])[],
	options: HumanTableOptions
): string => {
	if (rows.length === 0) {
		return options.emptyMessage;
	}
	const widths = headers.map((header, index) =>
		Math.max(
			header.length,
			...rows.map((row) => visibleWidth(row[index] ?? ""))
		)
	);
	const requiredWidth =
		widths.reduce((total, width) => total + width, 0) +
		TABLE_GAP.length * Math.max(0, headers.length - 1);
	const columns = terminalColumns(options.columns);
	if (requiredWidth > columns) {
		return rows
			.map((row) => renderStackedRecord(headers, row, columns))
			.join("\n\n");
	}
	const rightAligned = new Set(options.rightAlign ?? []);
	const renderRow = (row: readonly string[]): string =>
		row
			.map((value, index) =>
				padCell(value, widths[index] ?? 0, rightAligned.has(index))
			)
			.join(TABLE_GAP)
			.trimEnd();
	return [
		renderRow(headers),
		renderRow(widths.map((width) => "-".repeat(width))),
		...rows.map(renderRow),
	].join("\n");
};

export const renderHumanLines = (
	lines: readonly string[],
	options: HumanRenderOptions = {}
): string => {
	const columns = terminalColumns(options.columns);
	return lines.flatMap((line) => wrapValue(line, columns)).join("\n");
};

export const resolveHumanRenderOptions = (
	stdout: OutputWriter
): HumanRenderOptions => ({
	columns: stdout.columns,
});
