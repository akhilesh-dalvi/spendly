import { captureException } from "@sentry/nextjs";
import { getDiagnosticTags, isExpectedError } from "./sentry-errors";

interface ErrorOperation {
	feature:
		| "expenses"
		| "accounts"
		| "account-types"
		| "tags"
		| "auth"
		| "onboarding"
		| "app";
	operation:
		| "create"
		| "update"
		| "delete"
		| "adjust-balance"
		| "transfer"
		| "set-default"
		| "archive"
		| "reactivate"
		| "sync"
		| "render"
		| "start"
		| "complete"
		| "skip";
}

export function reportError(error: unknown, context: ErrorOperation): void {
	if (isExpectedError(error)) {
		return;
	}
	captureException(error, {
		tags: { ...context, surface: "web", ...getDiagnosticTags(error) },
	});
}
