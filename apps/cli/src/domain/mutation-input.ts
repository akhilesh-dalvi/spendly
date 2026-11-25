import { randomUUID } from "node:crypto";
import { CliError } from "../errors.js";
import type { CliRuntime } from "../runtime.js";
import { preferredCurrencyGuardSchema } from "./mutation-schemas.js";

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/u;
const SIGNED_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/u;
const POSITIVE_INTEGER_PATTERN = /^\d+$/u;
const MINIMUM_IDEMPOTENCY_KEY_LENGTH = 8;
const MAXIMUM_IDEMPOTENCY_KEY_LENGTH = 200;

export const parsePreferredCurrencyGuard = (value: string): string => {
	const parsed = preferredCurrencyGuardSchema.safeParse(value);
	if (!parsed.success) {
		throw new CliError(
			"INVALID_INPUT",
			"--if-preferred-currency cannot be empty"
		);
	}
	return parsed.data;
};

export const preferredCurrencyCommitFields = (
	provided: string | undefined,
	previewCurrency?: string
): { expectedPreferredCurrency?: string } => {
	if (
		provided !== undefined &&
		previewCurrency !== undefined &&
		provided !== previewCurrency
	) {
		throw new CliError(
			"PREFERRED_CURRENCY_CONFLICT",
			"The preferred currency differs from the expected value; rerun the preview and review it before committing"
		);
	}
	// An older backend may omit the guard. Do not substitute the transaction currency.
	const expectedPreferredCurrency = provided ?? previewCurrency;
	return expectedPreferredCurrency === undefined
		? {}
		: { expectedPreferredCurrency };
};

export const parseAmount = (value: string): number => {
	if (!DECIMAL_PATTERN.test(value)) {
		throw new CliError(
			"INVALID_INPUT",
			"--amount must be an ordinary positive decimal number"
		);
	}
	const amount = Number(value);
	if (!(Number.isFinite(amount) && amount >= 0.01)) {
		throw new CliError("INVALID_INPUT", "--amount must be at least 0.01");
	}
	return amount;
};

export const parseBalance = (value: string): number => {
	if (!SIGNED_DECIMAL_PATTERN.test(value)) {
		throw new CliError(
			"INVALID_INPUT",
			"--balance must be an ordinary decimal number"
		);
	}
	const balance = Number(value);
	if (!Number.isFinite(balance)) {
		throw new CliError("INVALID_INPUT", "--balance must be finite");
	}
	return balance;
};

export const parseRevision = (value: string): number => {
	if (!POSITIVE_INTEGER_PATTERN.test(value)) {
		throw new CliError(
			"INVALID_INPUT",
			"--if-revision must be a positive whole number"
		);
	}
	const revision = Number(value);
	if (!(Number.isSafeInteger(revision) && revision > 0)) {
		throw new CliError(
			"INVALID_INPUT",
			"--if-revision must be a positive whole number"
		);
	}
	return revision;
};

export const validateMutationText = (
	value: string | undefined,
	optionName: string
): string | undefined => {
	if (value !== undefined && value.trim().length === 0) {
		throw new CliError(
			"INVALID_INPUT",
			`${optionName} cannot be empty; use its explicit clear flag`
		);
	}
	return value;
};

export const validateIdempotencyKey = (
	value: string,
	label = "--idempotency-key"
): string => {
	const key = value.trim();
	if (
		key.length < MINIMUM_IDEMPOTENCY_KEY_LENGTH ||
		key.length > MAXIMUM_IDEMPOTENCY_KEY_LENGTH
	) {
		throw new CliError(
			"INVALID_INPUT",
			`${label} must contain ${MINIMUM_IDEMPOTENCY_KEY_LENGTH} to ${MAXIMUM_IDEMPOTENCY_KEY_LENGTH} characters`
		);
	}
	return key;
};

export const resolveIdempotencyKey = (options: {
	dryRun: boolean;
	nonInteractive: boolean;
	provided?: string;
	runtime: CliRuntime;
}): string | undefined => {
	if (options.provided !== undefined) {
		return validateIdempotencyKey(options.provided);
	}
	if (options.dryRun) {
		return undefined;
	}
	if (options.nonInteractive) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive commits require --idempotency-key"
		);
	}
	return options.runtime.randomIdempotencyKey?.() ?? randomUUID();
};
