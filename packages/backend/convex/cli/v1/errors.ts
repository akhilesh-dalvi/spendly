import { ConvexError } from "convex/values";

export type CliDomainErrorCode =
	| "ACCOUNT_ARCHIVED"
	| "ACCOUNT_REVISION_CONFLICT"
	| "ACCOUNT_SETUP_REQUIRED"
	| "AUTHENTICATION_REQUIRED"
	| "CATEGORY_CYCLE_MISMATCH"
	| "DELETION_CONFIRMATION_EXPIRED"
	| "DELETION_CONFIRMATION_INVALID"
	| "EXPENSE_REVISION_CONFLICT"
	| "IDEMPOTENCY_CONFLICT"
	| "INTERNAL_ERROR"
	| "INVALID_INPUT"
	| "RESOURCE_LIMIT_EXCEEDED"
	| "RESOURCE_NOT_FOUND"
	| "TRANSFER_CURRENCY_MISMATCH"
	| "TRANSFER_SAME_ACCOUNT";

const ERROR_MESSAGES: Record<CliDomainErrorCode, string> = {
	ACCOUNT_ARCHIVED: "The account is archived",
	ACCOUNT_REVISION_CONFLICT: "The account changed after it was read",
	ACCOUNT_SETUP_REQUIRED: "Open Spendly Web once to finish account setup",
	AUTHENTICATION_REQUIRED: "Authentication is required",
	CATEGORY_CYCLE_MISMATCH: "The category does not belong to the expense cycle",
	DELETION_CONFIRMATION_EXPIRED: "The deletion confirmation expired",
	DELETION_CONFIRMATION_INVALID: "The deletion confirmation is invalid",
	EXPENSE_REVISION_CONFLICT: "The expense changed after it was read",
	IDEMPOTENCY_CONFLICT:
		"The idempotency key was already used for another request",
	INTERNAL_ERROR: "The backend request failed unexpectedly",
	INVALID_INPUT: "The request input is invalid",
	RESOURCE_LIMIT_EXCEEDED:
		"The requested summary is too large to calculate safely",
	RESOURCE_NOT_FOUND: "The requested resource was not found",
	TRANSFER_CURRENCY_MISMATCH:
		"Transfers require accounts with the same currency",
	TRANSFER_SAME_ACCOUNT: "Transfer accounts must be different",
};

const DOMAIN_CODE_MAP: Record<string, CliDomainErrorCode> = {
	ACCOUNT_ARCHIVED: "ACCOUNT_ARCHIVED",
	ACCOUNT_SETUP_REQUIRED: "ACCOUNT_SETUP_REQUIRED",
	ACCOUNT_NOT_FOUND: "RESOURCE_NOT_FOUND",
	ACCOUNT_TYPE_NOT_FOUND: "RESOURCE_NOT_FOUND",
	ACCOUNT_REVISION_CONFLICT: "ACCOUNT_REVISION_CONFLICT",
	ACCOUNT_TYPE_ARCHIVED: "INVALID_INPUT",
	ACCOUNT_NAME_REQUIRED: "INVALID_INPUT",
	AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
	CATEGORY_CYCLE_MISMATCH: "CATEGORY_CYCLE_MISMATCH",
	DELETION_CONFIRMATION_EXPIRED: "DELETION_CONFIRMATION_EXPIRED",
	DELETION_CONFIRMATION_INVALID: "DELETION_CONFIRMATION_INVALID",
	EMPTY_TEXT_REQUIRES_EXPLICIT_CLEAR: "INVALID_INPUT",
	EXPENSE_NOT_FOUND: "RESOURCE_NOT_FOUND",
	EXPENSE_REVISION_CONFLICT: "EXPENSE_REVISION_CONFLICT",
	IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
	INVALID_BALANCE: "INVALID_INPUT",
	INVALID_DATE: "INVALID_INPUT",
	INVALID_EXPENSE_AMOUNT: "INVALID_INPUT",
	INVALID_IDEMPOTENCY_KEY: "INVALID_INPUT",
	INVALID_IDEMPOTENCY_REQUEST: "INVALID_INPUT",
	INVALID_FILTERS: "INVALID_INPUT",
	INVALID_LIMIT: "INVALID_INPUT",
	INVALID_STARTING_BALANCE: "INVALID_INPUT",
	INVALID_TAG_FILTERS: "INVALID_INPUT",
	INVALID_TRANSFER_AMOUNT: "INVALID_INPUT",
	NOT_FOUND: "RESOURCE_NOT_FOUND",
	RESOURCE_LIMIT_EXCEEDED: "RESOURCE_LIMIT_EXCEEDED",
	TAG_NOT_FOUND: "RESOURCE_NOT_FOUND",
	TRANSFER_CURRENCY_MISMATCH: "TRANSFER_CURRENCY_MISMATCH",
	TRANSFER_SAME_ACCOUNT: "TRANSFER_SAME_ACCOUNT",
	UNAUTHENTICATED: "AUTHENTICATION_REQUIRED",
	UNAUTHORIZED: "RESOURCE_NOT_FOUND",
	"User not found": "ACCOUNT_SETUP_REQUIRED",
};

const readErrorCode = (error: unknown): string | undefined => {
	if (error instanceof ConvexError) {
		if (typeof error.data === "string") {
			return error.data;
		}
		if (
			typeof error.data === "object" &&
			error.data !== null &&
			"code" in error.data &&
			typeof error.data.code === "string"
		) {
			return error.data.code;
		}
	}
	if (error instanceof Error) {
		return error.message;
	}
	return undefined;
};

export const throwCliDomainError = (error: unknown): never => {
	const domainCode = readErrorCode(error);
	const code = domainCode ? DOMAIN_CODE_MAP[domainCode] : undefined;
	const publicCode = code ?? "INTERNAL_ERROR";
	throw new ConvexError({
		code: publicCode,
		details: {},
		message: ERROR_MESSAGES[publicCode],
		retryable: false,
	});
};

export const withCliErrors = async <Result>(
	operation: () => Promise<Result>
): Promise<Result> => {
	try {
		return await operation();
	} catch (error) {
		return throwCliDomainError(error);
	}
};
