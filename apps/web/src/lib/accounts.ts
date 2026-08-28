import type { Doc } from "@spendly/backend/convex/_generated/dataModel";
import { formatCurrency } from "@/lib/utils";

export type AccountTypeBalanceNature = Doc<"account_types">["balanceNature"];

export type ResolvedAccount = Doc<"accounts"> & {
	accountTypeBalanceNature: AccountTypeBalanceNature;
	accountTypeColor: string | null;
	accountTypeIcon: string | null;
	accountTypeName: string;
};

const TRANSACTION_TYPE_LABELS = {
	opening_balance: "Opening balance",
	expense: "Expense",
	manual_adjustment: "Balance adjustment",
	transfer_in: "Transfer in",
	transfer_out: "Transfer out",
} as const;

const ACCOUNT_ACTION_ERROR_MESSAGES = {
	ACCOUNT_ARCHIVED:
		"This account is archived. Reactivate it before changing its balance.",
	ACCOUNT_TYPE_ARCHIVED:
		"This account type is archived. Reactivate it before assigning it.",
	ACCOUNT_TYPE_BALANCE_NATURE_IN_USE:
		"Reassign every account using this type before changing its balance nature.",
	ACCOUNT_TYPE_IN_USE:
		"This account type is still assigned to an account and cannot be deleted.",
	ACCOUNT_TYPE_LIMIT_REACHED:
		"You have reached the limit of 100 account types.",
	ACCOUNT_TYPE_NAME_REQUIRED: "Enter an account type name.",
	ACCOUNT_TYPE_NAME_TAKEN: "An account type with this name already exists.",
	ACCOUNT_TYPE_NOT_FOUND: "This account type no longer exists.",
	INVALID_ACCOUNT_TYPE_COLOR: "Choose a valid six-digit hex color.",
	INVALID_ACCOUNT_TYPE_ICON: "Choose a supported account type icon.",
	INVALID_BALANCE: "Enter a valid account balance.",
	INVALID_TRANSFER_AMOUNT: "Enter a transfer amount greater than zero.",
	TRANSFER_CURRENCY_MISMATCH:
		"Transfers require both accounts to use the same currency.",
	TRANSFER_SAME_ACCOUNT: "Choose a different destination account.",
	UNAUTHENTICATED: "Sign in again before updating an account.",
	UNAUTHORIZED: "You do not have access to this account.",
} as const;

const getErrorText = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error !== null && "data" in error) {
		const { data } = error as { data?: unknown };
		return typeof data === "string" ? data : "";
	}
	return "";
};

export const formatTransactionType = (type: string): string =>
	TRANSACTION_TYPE_LABELS[type as keyof typeof TRANSACTION_TYPE_LABELS] ?? type;

export const formatAccountMoney = (
	amount: number,
	currency = "USD"
): string => {
	const locale = currency === "INR" ? "en-IN" : "en-US";
	return formatCurrency(amount, currency, locale);
};

export const getAccountActionErrorMessage = (
	error: unknown,
	fallback: string
): string => {
	const errorText = getErrorText(error);
	for (const [code, message] of Object.entries(ACCOUNT_ACTION_ERROR_MESSAGES)) {
		if (errorText.includes(code)) {
			return message;
		}
	}
	return fallback;
};
