import type { CliErrorCode } from "../errors.js";
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

const renderTerminalData = (data: unknown): string => {
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
	code: CliErrorCode;
	color: boolean;
	message: string;
	retryable: boolean;
	stderr: OutputWriter;
}): void => {
	const label = options.color ? `${ANSI_RED}Error${ANSI_RESET}` : "Error";
	const recoveryByCode: Partial<Record<CliErrorCode, string>> = {
		ACCOUNT_ARCHIVED:
			"Choose an active account, or reactivate this account if that is intended.",
		ACCOUNT_REVISION_CONFLICT:
			"Read the account again, review a new preview, and then retry.",
		ACCOUNT_SETUP_REQUIRED:
			"Finish Spendly account setup in the Web app, then run this command again.",
		AUTHENTICATION_REQUIRED: "spendly auth login",
		AUTHORIZATION_EXPIRED: "spendly auth login",
		CATEGORY_CYCLE_MISMATCH:
			"Choose a category from the expense date's cycle, or clear the category.",
		CREDENTIALS_INVALID: "spendly auth login",
		DELETION_CONFIRMATION_EXPIRED:
			"Create a new deletion preview; do not reuse the expired token.",
		DELETION_CONFIRMATION_INVALID:
			"Create a new deletion preview; do not reuse this token.",
		EXPENSE_REVISION_CONFLICT:
			"Read the expense again, review a new preview, and then retry.",
		INTERNAL_ERROR:
			"Run again with --debug and redact sensitive data before reporting the issue.",
		INVALID_COMMAND: "spendly --help",
		INVALID_INPUT: "Check the named value and run the command with --help.",
		KEYCHAIN_UNAVAILABLE:
			"Check the OS credential store; use --allow-file-storage only if you accept the documented fallback.",
		NETWORK_ERROR:
			"Check current Spendly state before retrying; never repeat a write blindly.",
		NON_INTERACTIVE_INPUT_REQUIRED:
			"Provide the required stable IDs and safety flags, or use --interactive in a TTY.",
		RESOURCE_NOT_FOUND:
			"List the relevant resources or use --interactive to choose one.",
		REVISION_CONFLICT:
			"Read the current resource, review a new preview, and then retry.",
		TRANSFER_CURRENCY_MISMATCH:
			"Choose source and destination accounts with the same currency.",
		TRANSFER_SAME_ACCOUNT: "Choose two different accounts.",
	};
	const recovery =
		recoveryByCode[options.code] ??
		(options.retryable
			? "The operation may be retried using the existing safety rules."
			: undefined);
	const recoveryLabel = recovery?.startsWith("spendly ") ? "Run" : "Try";
	options.stderr.write(
		`${label} [${options.code}]: ${options.message}${recovery ? `\n${recoveryLabel}: ${recovery}` : ""}\n`
	);
};
