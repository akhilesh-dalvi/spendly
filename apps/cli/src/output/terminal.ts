import type { OutputWriter } from "../runtime.js";

const ANSI_RED = "\u001b[31m";
const ANSI_RESET = "\u001b[0m";

const formatScalar = (value: unknown): string => {
	if (value === null) {
		return "none";
	}
	if (typeof value === "boolean") {
		return value ? "yes" : "no";
	}
	return String(value);
};

export const renderTerminalData = (data: unknown): string => {
	if (!(data && typeof data === "object") || Array.isArray(data)) {
		return typeof data === "string" ? data : JSON.stringify(data, null, 2);
	}

	return Object.entries(data)
		.map(([key, value]) => {
			const renderedValue =
				value && typeof value === "object"
					? JSON.stringify(value)
					: formatScalar(value);
			return `${key}: ${renderedValue}`;
		})
		.join("\n");
};

export const writeTerminalSuccess = (
	data: unknown,
	stdout: OutputWriter
): void => {
	stdout.write(`${renderTerminalData(data)}\n`);
};

export const writeTerminalError = (options: {
	color: boolean;
	message: string;
	stderr: OutputWriter;
}): void => {
	const label = options.color ? `${ANSI_RED}Error${ANSI_RESET}` : "Error";
	options.stderr.write(`${label}: ${options.message}\n`);
};
