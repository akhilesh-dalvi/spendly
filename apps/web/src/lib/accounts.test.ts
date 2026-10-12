import { describe, expect, it } from "vitest";
import {
	formatAccountMoney,
	formatTransactionType,
	getAccountActionErrorMessage,
} from "./accounts";

describe("account display helpers", () => {
	it.each([
		["opening_balance", "Opening balance"],
		["expense", "Expense"],
		["manual_adjustment", "Balance adjustment"],
		["transfer_in", "Transfer in"],
		["transfer_out", "Transfer out"],
		["unknown", "unknown"],
	])("labels transaction type %s", (type, label) => {
		expect(formatTransactionType(type)).toBe(label);
	});

	it("formats default dollars, negative balances, and Indian grouping", () => {
		expect(formatAccountMoney(1234.5)).toBe("$1,234.50");
		expect(formatAccountMoney(-12.5, "USD")).toBe("-$12.50");
		expect(formatAccountMoney(123_456.78, "INR")).toBe("₹1,23,456.78");
	});
});

describe("account action errors", () => {
	it("recognizes backend codes in errors and Convex data payloads", () => {
		expect(
			getAccountActionErrorMessage(
				new Error("Server Error: ACCOUNT_ARCHIVED"),
				"Failed"
			)
		).toBe(
			"This account is archived. Reactivate it before changing its balance."
		);
		expect(
			getAccountActionErrorMessage(
				{ data: "TRANSFER_CURRENCY_MISMATCH" },
				"Failed"
			)
		).toBe("Transfers require both accounts to use the same currency.");
	});

	it.each([
		new Error("Unexpected server failure"),
		{ data: { private: "payload" } },
		{ data: null },
		{},
		null,
		undefined,
		"ACCOUNT_ARCHIVED",
	])("uses a safe fallback for unrecognized error %#", (error) => {
		expect(
			getAccountActionErrorMessage(error, "Could not update account.")
		).toBe("Could not update account.");
	});
});
