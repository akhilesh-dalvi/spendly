import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	accountCreateResultSchema,
	accountUpdatePreviewSchema,
	balanceAdjustmentPreviewSchema,
	balanceAdjustmentResultSchema,
	transferPreviewSchema,
	transferResultSchema,
} from "../domain/account-mutation-schemas.js";
import {
	expenseCreateResultSchema,
	expenseDeleteResultSchema,
	expenseUpdatePreviewSchema,
} from "../domain/mutation-schemas.js";
import {
	renderAccountAddResult,
	renderAccountEditPreview,
	renderAccountLifecyclePreview,
	renderBalanceAdjustmentPreview,
	renderBalanceAdjustmentResult,
	renderTransferPreview,
	renderTransferResult,
} from "./account-mutation-terminal.js";
import {
	renderExpenseAddResult,
	renderExpenseDeleteResult,
	renderExpenseEditPreview,
} from "./mutation-terminal.js";

const readFixture = (name: string): Record<string, unknown> =>
	JSON.parse(
		readFileSync(
			new URL(`../../test/fixtures/${name}.json`, import.meta.url),
			"utf8"
		)
	) as Record<string, unknown>;

describe("human mutation hierarchy", () => {
	it("shows only changed expense fields", () => {
		const fixture = readFixture("expense-mutations");
		const output = renderExpenseEditPreview(
			expenseUpdatePreviewSchema.parse(fixture.updatePreview)
		);

		expect(output).toContain("Edit expense preview");
		expect(output).toContain("Expense: 2026-09-02 · Lunch · INR 250.00");
		expect(output).toContain("Changes:");
		expect(output).toContain("- Amount: INR 250.00 -> INR 300.00");
		expect(output).toContain("- Category: Food -> Uncategorized");
		expect(output).not.toContain("Before\n");
		expect(output).not.toContain("After\n");
	});

	it("shows only changed account fields", () => {
		const fixture = readFixture("account-mutations");
		const output = renderAccountEditPreview(
			accountUpdatePreviewSchema.parse(fixture.accountUpdatePreview)
		);

		expect(output).toContain("Edit account preview:");
		expect(output).toContain("- Name: Daily Wallet -> Everyday Wallet");
		expect(output).not.toContain("Opening balance:");
		expect(output).not.toContain("account-wallet");
	});

	it("uses lifecycle-specific account preview vocabulary", () => {
		const fixture = readFixture("account-mutations");
		const preview = accountUpdatePreviewSchema.parse(
			fixture.accountUpdatePreview
		);

		expect(renderAccountLifecyclePreview(preview, "archive")).toContain(
			"Archive account preview: Daily Wallet"
		);
		expect(renderAccountLifecyclePreview(preview, "reactivate")).toContain(
			"Reactivate account preview: Daily Wallet"
		);
	});

	it("distinguishes desired balance from the computed adjustment", () => {
		const fixture = readFixture("account-mutations");
		const output = renderBalanceAdjustmentPreview(
			balanceAdjustmentPreviewSchema.parse(fixture.balanceAdjustmentPreview)
		);

		expect(output).toContain("Desired final balance:");
		expect(output).toContain("Computed adjustment:");
		expect(output).toContain("[NEGATIVE_BALANCE]");
	});

	it("leads a transfer with its direction and warning", () => {
		const fixture = readFixture("account-mutations");
		const output = renderTransferPreview(
			transferPreviewSchema.parse(fixture.transferPreview)
		);

		expect(output).toContain("Daily Wallet -> Savings");
		expect(output).toContain("[NEGATIVE_SOURCE_BALANCE]");
	});

	it("adds contextual read commands after successful mutations", () => {
		const accountFixture = readFixture("account-mutations");
		const expenseFixture = readFixture("expense-mutations");

		const addedExpense = renderExpenseAddResult(
			expenseCreateResultSchema.parse(expenseFixture.createResult)
		);
		expect(addedExpense).toContain("OK - Expense added successfully");
		expect(addedExpense).toContain("Next: spendly expenses get expense-lunch");
		expect(
			renderExpenseDeleteResult(
				expenseDeleteResultSchema.parse(expenseFixture.deleteResult)
			)
		).toContain("Next: spendly expenses list");
		const addedAccount = renderAccountAddResult(
			accountCreateResultSchema.parse(accountFixture.accountCreateResult)
		);
		expect(addedAccount).toContain("OK - Account added");
		expect(addedAccount).toContain("Next: spendly accounts get account-travel");
		expect(addedAccount).not.toContain("transaction-opening-travel");
		expect(addedAccount).not.toContain("opening_balance");
		expect(
			renderBalanceAdjustmentResult(
				balanceAdjustmentResultSchema.parse(
					accountFixture.balanceAdjustmentResult
				)
			)
		).toContain("Next: spendly accounts transactions account-wallet");
		expect(
			renderTransferResult(
				transferResultSchema.parse(accountFixture.transferResult)
			)
		).toContain("Next: spendly accounts transactions account-wallet");
	});
});
