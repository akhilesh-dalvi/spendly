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
	expenseProposalSchema,
	expenseUpdatePreviewSchema,
} from "../domain/mutation-schemas.js";
import {
	renderAccountAddResult,
	renderAccountEditPreview,
	renderAccountLifecycleBatchPreview,
	renderAccountLifecycleBatchSuccess,
	renderAccountLifecyclePreview,
	renderAccountSuccess,
	renderBalanceAdjustmentPreview,
	renderBalanceAdjustmentResult,
	renderSetDefaultPreview,
	renderTransferPreview,
	renderTransferResult,
} from "./account-mutation-terminal.js";
import {
	renderExpenseAddResult,
	renderExpenseDeleteResult,
	renderExpenseEditPreview,
	renderExpenseProposal,
} from "./mutation-terminal.js";

const readFixture = (name: string): Record<string, unknown> =>
	JSON.parse(
		readFileSync(
			new URL(`../../test/fixtures/${name}.json`, import.meta.url),
			"utf8"
		)
	) as Record<string, unknown>;

describe("human mutation hierarchy", () => {
	it("shows no visible changes for identical unassigned expense snapshots", () => {
		const preview = expenseUpdatePreviewSchema.parse(
			readFixture("expense-mutations").updatePreview
		);
		const expense = {
			...preview.before,
			account: null,
			category: null,
			spentOn: null,
			tags: [],
		};
		const output = renderExpenseEditPreview({
			...preview,
			accountEffects: [],
			after: expense,
			before: expense,
		});
		expect(output).toContain("No description");
		expect(output).toContain("- No visible field changes");
		expect(output).toContain("Account balance effects: none");
	});

	it("shows fallback names in proposals and deleted expenses", () => {
		const fixture = readFixture("expense-mutations");
		const result = expenseCreateResultSchema.parse(fixture.createResult);
		const proposal = expenseProposalSchema.parse({
			...result,
			accountEffects: [],
			accountId: null,
			categoryId: null,
			cycleId: null,
			spentOn: null,
			tagIds: [],
		});
		const output = renderExpenseProposal(proposal);
		expect(output).toContain("Spent on: none");
		expect(output).toContain("Category: Uncategorized");
		expect(output).toContain("Account: Unassigned");
		expect(output).toContain("Cycle: none");
		expect(output).toContain("Tags: none");
		const deleted = expenseDeleteResultSchema.parse(fixture.deleteResult);
		expect(
			renderExpenseDeleteResult({
				...deleted,
				expense: { ...deleted.expense, spentOn: null },
			})
		).toContain("Spent on: none");
	});

	it("describes liability, archived, default accounts and no-op account previews", () => {
		const preview = accountUpdatePreviewSchema.parse(
			readFixture("account-mutations").accountUpdatePreview
		);
		const account = {
			...preview.before,
			accountType: {
				...preview.before.accountType,
				balanceNature: "liability" as const,
			},
			isArchived: true,
			isDefault: true,
		};
		const output = renderAccountSuccess(account, "Account updated");
		expect(output).toContain("(Liability)");
		expect(output).toContain("Default: Yes");
		expect(output).toContain("Status: Archived");
		expect(
			renderAccountEditPreview({ ...preview, after: account, before: account })
		).toContain("No visible field changes");
		expect(renderSetDefaultPreview(account)).toContain(
			"Previous default: none"
		);
		expect(renderSetDefaultPreview(account, preview.before)).toContain(
			`Previous default: ${preview.before.name}`
		);
	});

	it.each(["archive", "reactivate"] as const)(
		"shows both states in %s batch previews and results",
		(action) => {
			const preview = accountUpdatePreviewSchema.parse(
				readFixture("account-mutations").accountUpdatePreview
			);
			const active = { ...preview.before, isArchived: false };
			const archived = { ...preview.after, isArchived: true };
			const output = renderAccountLifecycleBatchPreview(
				[
					{ ...preview, after: archived, before: active },
					{ ...preview, after: active, before: archived },
				],
				action
			);
			expect(output).toContain("Status: Active -> Archived");
			expect(output).toContain("Status: Archived -> Active");
			const success = renderAccountLifecycleBatchSuccess(
				[active, archived],
				action
			);
			expect(success).toContain(
				action === "archive" ? "accounts archived" : "accounts reactivated"
			);
			expect(success).toContain(`${active.name}: Active`);
			expect(success).toContain(`${archived.name}: Archived`);
		}
	);

	it("renders no-op ledger adjustments and transfers without notes or warnings", () => {
		const result = balanceAdjustmentResultSchema.parse(
			readFixture("account-mutations").balanceAdjustmentResult
		);
		const output = renderBalanceAdjustmentResult({
			...result,
			adjustment: 0,
			transaction: null,
			warnings: [],
		});
		expect(output).toContain("Warnings: none");
		expect(output).toContain("Ledger: no entry (balance unchanged)");
		const transfer = transferPreviewSchema.parse(
			readFixture("account-mutations").transferPreview
		);
		expect(
			renderTransferPreview({
				...transfer,
				note: null,
				warnings: [],
			})
		).toContain("Warnings: none");
		expect(renderTransferPreview({ ...transfer, note: null })).toContain(
			"Note: none"
		);
	});
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
