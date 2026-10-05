import { ConvexError } from "convex/values";

// Only explicit domain outcomes are routine; unknown ConvexErrors still report.
const EXPECTED_CODES = new Set([
	"UNAUTHENTICATED",
	"UNAUTHORIZED",
	"AUTHENTICATION_REQUIRED",
	"ACCOUNT_ARCHIVED",
	"ACCOUNT_NAME_REQUIRED",
	"ACCOUNT_REVISION_CONFLICT",
	"ACCOUNT_TYPE_ARCHIVED",
	"ACCOUNT_TYPE_BALANCE_NATURE_IN_USE",
	"ACCOUNT_TYPE_IN_USE",
	"ACCOUNT_TYPE_LIMIT_REACHED",
	"ACCOUNT_TYPE_NAME_REQUIRED",
	"ACCOUNT_TYPE_NAME_TAKEN",
	"ACCOUNT_TYPE_NOT_FOUND",
	"INVALID_ACCOUNT_TYPE_COLOR",
	"INVALID_ACCOUNT_TYPE_ICON",
	"INVALID_BALANCE",
	"INVALID_STARTING_BALANCE",
	"INVALID_TRANSFER_AMOUNT",
	"TRANSFER_CURRENCY_MISMATCH",
	"TRANSFER_SAME_ACCOUNT",
	"INVALID_EXPENSE_AMOUNT",
	"EXPENSE_REVISION_CONFLICT",
	"EXPENSE_NOT_FOUND",
	"ACCOUNT_NOT_FOUND",
	"TAG_NOT_FOUND",
	"CATEGORY_CYCLE_MISMATCH",
	"EMPTY_TEXT_REQUIRES_EXPLICIT_CLEAR",
	"INVALID_DATE",
	"INVALID_DATE_RANGE",
	"CYCLE_OVERLAP",
	"CYCLE_HAS_EXPENSES",
	"INVALID_PLANNED_AMOUNT",
	"ONBOARDING_CYCLE_REQUIRED",
	"IDEMPOTENCY_CONFLICT",
	"NOT_FOUND",
]);

const REQUEST_ID = /\[Request ID: ([a-f0-9]{16,64})\]/i;

function getConvexCode(error: unknown): string | undefined {
	if (!(error instanceof ConvexError)) {
		return undefined;
	}
	if (typeof error.data === "string") {
		return error.data;
	}
	if (
		error.data &&
		typeof error.data === "object" &&
		"code" in error.data &&
		typeof error.data.code === "string"
	) {
		return error.data.code;
	}
	return undefined;
}

export function isExpectedError(error: unknown): boolean {
	const code = getConvexCode(error);
	return code !== undefined && EXPECTED_CODES.has(code);
}

export function getDiagnosticTags(error: unknown): Record<string, string> {
	const tags: Record<string, string> = {};
	const code = getConvexCode(error);
	if (code === "INTERNAL_ERROR" || code === "RESOURCE_LIMIT_EXCEEDED") {
		tags.error_code = code;
	}
	if (error instanceof Error) {
		const requestId = REQUEST_ID.exec(error.message)?.[1];
		if (requestId) {
			tags.convex_request_id = requestId.toLowerCase();
		}
	}
	return tags;
}
