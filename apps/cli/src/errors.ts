export type CliErrorCode =
	| "ACCOUNT_ARCHIVED"
	| "ACCOUNT_REVISION_CONFLICT"
	| "ACCOUNT_SETUP_REQUIRED"
	| "AUTHENTICATION_REQUIRED"
	| "AUTHORIZATION_EXPIRED"
	| "CONFIGURATION_ERROR"
	| "CREDENTIALS_INVALID"
	| "CATEGORY_CYCLE_MISMATCH"
	| "CYCLE_COPY_CONFLICT"
	| "CYCLE_OVERLAP"
	| "CYCLE_HAS_EXPENSES"
	| "CYCLE_REVISION_CONFLICT"
	| "DELETION_CONFIRMATION_EXPIRED"
	| "DELETION_CONFIRMATION_INVALID"
	| "DELETION_CONFIRMATION_REQUIRED"
	| "EXPENSE_REVISION_CONFLICT"
	| "IDEMPOTENCY_CONFLICT"
	| "INTERNAL_ERROR"
	| "INVALID_AUTH_CALLBACK"
	| "INVALID_COMMAND"
	| "INVALID_INPUT"
	| "KEYCHAIN_UNAVAILABLE"
	| "NETWORK_ERROR"
	| "NON_INTERACTIVE_INPUT_REQUIRED"
	| "RESOURCE_NOT_FOUND"
	| "RESOURCE_LIMIT_EXCEEDED"
	| "REVISION_CONFLICT"
	| "TRANSFER_CURRENCY_MISMATCH"
	| "TRANSFER_SAME_ACCOUNT";

export const CLI_EXIT_CODE = {
	authentication: 3,
	confirmation: 6,
	conflict: 5,
	internal: 1,
	invalidInput: 2,
	notFound: 4,
	success: 0,
	temporary: 7,
} as const;

export type CliExitCode = (typeof CLI_EXIT_CODE)[keyof typeof CLI_EXIT_CODE];

const EXIT_CODES = {
	ACCOUNT_ARCHIVED: CLI_EXIT_CODE.conflict,
	ACCOUNT_REVISION_CONFLICT: CLI_EXIT_CODE.conflict,
	ACCOUNT_SETUP_REQUIRED: CLI_EXIT_CODE.authentication,
	AUTHENTICATION_REQUIRED: CLI_EXIT_CODE.authentication,
	AUTHORIZATION_EXPIRED: CLI_EXIT_CODE.authentication,
	CONFIGURATION_ERROR: CLI_EXIT_CODE.invalidInput,
	CREDENTIALS_INVALID: CLI_EXIT_CODE.authentication,
	CATEGORY_CYCLE_MISMATCH: CLI_EXIT_CODE.conflict,
	CYCLE_COPY_CONFLICT: CLI_EXIT_CODE.conflict,
	CYCLE_OVERLAP: CLI_EXIT_CODE.conflict,
	CYCLE_HAS_EXPENSES: CLI_EXIT_CODE.conflict,
	CYCLE_REVISION_CONFLICT: CLI_EXIT_CODE.conflict,
	DELETION_CONFIRMATION_EXPIRED: CLI_EXIT_CODE.confirmation,
	DELETION_CONFIRMATION_INVALID: CLI_EXIT_CODE.confirmation,
	DELETION_CONFIRMATION_REQUIRED: CLI_EXIT_CODE.confirmation,
	EXPENSE_REVISION_CONFLICT: CLI_EXIT_CODE.conflict,
	IDEMPOTENCY_CONFLICT: CLI_EXIT_CODE.conflict,
	INTERNAL_ERROR: CLI_EXIT_CODE.internal,
	INVALID_AUTH_CALLBACK: CLI_EXIT_CODE.authentication,
	INVALID_COMMAND: CLI_EXIT_CODE.invalidInput,
	INVALID_INPUT: CLI_EXIT_CODE.invalidInput,
	KEYCHAIN_UNAVAILABLE: CLI_EXIT_CODE.authentication,
	NETWORK_ERROR: CLI_EXIT_CODE.temporary,
	NON_INTERACTIVE_INPUT_REQUIRED: CLI_EXIT_CODE.invalidInput,
	RESOURCE_NOT_FOUND: CLI_EXIT_CODE.notFound,
	RESOURCE_LIMIT_EXCEEDED: CLI_EXIT_CODE.internal,
	REVISION_CONFLICT: CLI_EXIT_CODE.conflict,
	TRANSFER_CURRENCY_MISMATCH: CLI_EXIT_CODE.conflict,
	TRANSFER_SAME_ACCOUNT: CLI_EXIT_CODE.conflict,
} as const satisfies Record<CliErrorCode, CliExitCode>;

export interface CliErrorOptions {
	cause?: unknown;
	details?: Readonly<Record<string, unknown>>;
	retryable?: boolean;
}

export class CliError extends Error {
	readonly code: CliErrorCode;
	readonly details: Readonly<Record<string, unknown>>;
	readonly exitCode: CliExitCode;
	readonly retryable: boolean;

	constructor(code: CliErrorCode, message: string, options?: CliErrorOptions) {
		super(message, { cause: options?.cause });
		this.name = "CliError";
		this.code = code;
		this.details = options?.details ?? {};
		this.exitCode = EXIT_CODES[code];
		this.retryable = options?.retryable ?? false;
	}
}

export const getExitCode = (code: CliErrorCode): CliExitCode =>
	EXIT_CODES[code];

export const toCliError = (error: unknown): CliError => {
	if (error instanceof CliError) {
		return error;
	}

	return new CliError("INTERNAL_ERROR", "The command failed unexpectedly", {
		cause: error,
	});
};
