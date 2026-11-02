import { ConvexError } from "convex/values";

export const INITIAL_REVISION = 1;

export const getRevision = (revision: number | undefined): number =>
	revision ?? INITIAL_REVISION;

export const nextRevision = (revision: number | undefined): number =>
	getRevision(revision) + 1;

export const assertRevision = (
	actualRevision: number | undefined,
	expectedRevision: number,
	errorCode:
		| "ACCOUNT_REVISION_CONFLICT"
		| "EXPENSE_REVISION_CONFLICT"
		| "CYCLE_REVISION_CONFLICT"
): void => {
	if (getRevision(actualRevision) !== expectedRevision) {
		throw new ConvexError(errorCode);
	}
};
