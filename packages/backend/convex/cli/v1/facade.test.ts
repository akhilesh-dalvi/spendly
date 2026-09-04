// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";

const createBackendTest = () => convexTest(schema, modules);
type BackendTest = ReturnType<typeof createBackendTest>;

const createAuthenticatedUser = async (test: BackendTest, subject: string) => {
	const client = test.withIdentity({
		email: `${subject}@example.com`,
		subject,
	});
	const userId = await client.mutation(api.users.create, {
		email: `${subject}@example.com`,
		name: subject,
	});
	const [accountType] = await client.query(api.accountTypes.list, {});
	if (!accountType) {
		throw new Error("Expected a seeded account type");
	}
	return { accountType, client, userId };
};

const expectCliError = async (
	operation: Promise<unknown>,
	code: string
): Promise<void> => {
	let caught: unknown;
	try {
		await operation;
	} catch (error) {
		caught = error;
	}
	if (caught === undefined) {
		throw new Error(`Expected ${code} but the operation succeeded`);
	}
	const data =
		typeof caught === "object" && caught !== null && "data" in caught
			? caught.data
			: caught;
	if (
		typeof data !== "object" ||
		data === null ||
		!("code" in data) ||
		data.code !== code ||
		!("retryable" in data) ||
		data.retryable !== false
	) {
		throw new Error(`Expected ${code} but received ${JSON.stringify(data)}`);
	}
};

const getCliErrorCode = (error: unknown): unknown => {
	const data =
		typeof error === "object" && error !== null && "data" in error
			? error.data
			: error;
	return typeof data === "object" && data !== null && "code" in data
		? data.code
		: undefined;
};

const createAccount = async (
	client: Awaited<ReturnType<typeof createAuthenticatedUser>>["client"],
	accountTypeId: Id<"account_types">,
	options: { key: string; name: string; startingBalance: number }
) =>
	await client.mutation(api.cli.v1.accounts.create, {
		accountTypeId,
		idempotencyKey: options.key,
		name: options.name,
		startingBalance: options.startingBalance,
	});

describe("cli/v1 facade", () => {
	it("returns stable authentication and cross-user ownership errors", async () => {
		const test = createBackendTest();
		await expectCliError(
			test.query(api.cli.v1.context.get, { date: "2026-09-02" }),
			"AUTHENTICATION_REQUIRED"
		);
		const alice = await createAuthenticatedUser(test, "facade-alice");
		const bob = await createAuthenticatedUser(test, "facade-bob");
		const expense = await alice.client.mutation(api.cli.v1.expenses.create, {
			amount: 12,
			date: "2026-09-01",
			idempotencyKey: "alice-expense-1",
		});

		await expectCliError(
			bob.client.query(api.cli.v1.expenses.get, { expenseId: expense.id }),
			"RESOURCE_NOT_FOUND"
		);
	});

	it("keeps create dry runs, commits, replay, and revisions consistent", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "expense-flow");
		const account = await createAccount(owner.client, owner.accountType._id, {
			key: "expense-account",
			name: "Everyday",
			startingBalance: 100,
		});
		const input = {
			amount: 15,
			date: "2026-09-01",
			spentOn: "  Lunch  ",
		};
		const preview = await owner.client.query(
			api.cli.v1.expenses.previewCreate,
			input
		);
		const created = await owner.client.mutation(api.cli.v1.expenses.create, {
			...input,
			idempotencyKey: "expense-create-key",
		});
		const replay = await owner.client.mutation(api.cli.v1.expenses.create, {
			...input,
			idempotencyKey: "expense-create-key",
		});

		expect(preview).toMatchObject({
			accountId: account.id,
			accountSource: "user_default",
			amount: created.amount,
			date: created.date,
			revision: 1,
			spentOn: "Lunch",
		});
		expect(replay).toEqual(created);
		expect(
			(await owner.client.query(api.cli.v1.expenses.list, {})).items
		).toHaveLength(1);
		await expectCliError(
			owner.client.mutation(api.cli.v1.expenses.create, {
				...input,
				amount: 20,
				idempotencyKey: "expense-create-key",
			}),
			"IDEMPOTENCY_CONFLICT"
		);

		const updated = await owner.client.mutation(api.cli.v1.expenses.update, {
			amount: 18,
			expectedRevision: created.revision,
			expenseId: created.id,
			idempotencyKey: "expense-update-key",
		});
		const updateReplay = await owner.client.mutation(
			api.cli.v1.expenses.update,
			{
				amount: 18,
				expectedRevision: created.revision,
				expenseId: created.id,
				idempotencyKey: "expense-update-key",
			}
		);
		expect(updated.revision).toBe(2);
		expect(updateReplay).toEqual(updated);
		await expectCliError(
			owner.client.mutation(api.cli.v1.expenses.update, {
				amount: 19,
				expectedRevision: created.revision,
				expenseId: created.id,
				idempotencyKey: "expense-stale-key",
			}),
			"EXPENSE_REVISION_CONFLICT"
		);
	});

	it("requires a current single-use deletion confirmation and replays success", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "delete-flow");
		const expense = await owner.client.mutation(api.cli.v1.expenses.create, {
			amount: 10,
			date: "2026-09-01",
			idempotencyKey: "delete-expense-key",
		});
		const preview = await owner.client.mutation(
			api.cli.v1.expenses.previewDelete,
			{ expenseId: expense.id }
		);
		const deleted = await owner.client.mutation(api.cli.v1.expenses.remove, {
			confirmationToken: preview.confirmationToken,
			expectedRevision: preview.revision,
			expenseId: expense.id,
			idempotencyKey: "expense-delete-key",
		});
		const replay = await owner.client.mutation(api.cli.v1.expenses.remove, {
			confirmationToken: preview.confirmationToken,
			expectedRevision: preview.revision,
			expenseId: expense.id,
			idempotencyKey: "expense-delete-key",
		});

		expect(deleted).toMatchObject({
			deleted: true,
			expense: { id: expense.id },
		});
		expect(replay).toEqual(deleted);
		await expectCliError(
			owner.client.mutation(api.cli.v1.expenses.remove, {
				confirmationToken: preview.confirmationToken,
				expectedRevision: preview.revision,
				expenseId: expense.id,
				idempotencyKey: "another-delete-key",
			}),
			"DELETION_CONFIRMATION_INVALID"
		);
	});

	it("rejects expired deletion capabilities and cleans expired records", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "expiry-flow");
		const expense = await owner.client.mutation(api.cli.v1.expenses.create, {
			amount: 8,
			date: "2026-09-01",
			idempotencyKey: "expiry-create-key",
		});
		const preview = await owner.client.mutation(
			api.cli.v1.expenses.previewDelete,
			{ expenseId: expense.id }
		);
		await test.run(async (ctx) => {
			await ctx.db.patch(preview.confirmationToken, { expiresAt: 1 });
			const record = await ctx.db
				.query("cli_idempotency")
				.withIndex("by_userId_key", (queryBuilder) =>
					queryBuilder.eq("userId", owner.userId).eq("key", "expiry-create-key")
				)
				.unique();
			if (!record) {
				throw new Error("Expected an idempotency record");
			}
			await ctx.db.patch(record._id, { expiresAt: 1 });
		});
		await expectCliError(
			owner.client.mutation(api.cli.v1.expenses.remove, {
				confirmationToken: preview.confirmationToken,
				expectedRevision: preview.revision,
				expenseId: expense.id,
				idempotencyKey: "expiry-delete-key",
			}),
			"DELETION_CONFIRMATION_EXPIRED"
		);

		const cleanup = await test.mutation(
			internal.cli.v1.maintenance.cleanupExpired,
			{ now: 2 }
		);
		expect(cleanup).toEqual({
			deletionConfirmations: 1,
			idempotencyRecords: 1,
		});
		const afterRetention = await owner.client.mutation(
			api.cli.v1.expenses.create,
			{
				amount: 8,
				date: "2026-09-01",
				idempotencyKey: "expiry-create-key",
			}
		);
		expect(afterRetention.id).not.toBe(expense.id);
	});

	it("invalidates a deletion preview when the expense revision changes", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "stale-delete");
		const expense = await owner.client.mutation(api.cli.v1.expenses.create, {
			amount: 9,
			date: "2026-09-01",
			idempotencyKey: "stale-delete-create",
		});
		const preview = await owner.client.mutation(
			api.cli.v1.expenses.previewDelete,
			{ expenseId: expense.id }
		);
		await owner.client.mutation(api.cli.v1.expenses.update, {
			amount: 11,
			expectedRevision: expense.revision,
			expenseId: expense.id,
			idempotencyKey: "stale-delete-update",
		});

		await expectCliError(
			owner.client.mutation(api.cli.v1.expenses.remove, {
				confirmationToken: preview.confirmationToken,
				expectedRevision: preview.revision,
				expenseId: expense.id,
				idempotencyKey: "stale-delete-commit",
			}),
			"EXPENSE_REVISION_CONFLICT"
		);
	});

	it("binds transfers to both account revisions and replays atomically", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "transfer-flow");
		const source = await createAccount(owner.client, owner.accountType._id, {
			key: "source-account",
			name: "Source",
			startingBalance: 100,
		});
		const destination = await createAccount(
			owner.client,
			owner.accountType._id,
			{ key: "destination-account", name: "Destination", startingBalance: 25 }
		);
		const preview = await owner.client.query(
			api.cli.v1.accounts.previewTransfer,
			{
				amount: 30,
				expectedFromRevision: source.revision,
				expectedToRevision: destination.revision,
				fromAccountId: source.id,
				toAccountId: destination.id,
			}
		);
		expect(preview).toMatchObject({
			fromBalanceAfter: 70,
			toBalanceAfter: 55,
		});

		await owner.client.mutation(api.cli.v1.accounts.adjustBalance, {
			accountId: destination.id,
			expectedRevision: destination.revision,
			idempotencyKey: "destination-adjustment",
			newBalance: 30,
		});
		await expectCliError(
			owner.client.mutation(api.cli.v1.accounts.transfer, {
				amount: 30,
				expectedFromRevision: source.revision,
				expectedToRevision: destination.revision,
				fromAccountId: source.id,
				idempotencyKey: "stale-transfer",
				toAccountId: destination.id,
			}),
			"ACCOUNT_REVISION_CONFLICT"
		);
		const currentDestination = await owner.client.query(
			api.cli.v1.accounts.get,
			{ accountId: destination.id }
		);
		const transfer = await owner.client.mutation(api.cli.v1.accounts.transfer, {
			amount: 30,
			expectedFromRevision: source.revision,
			expectedToRevision: currentDestination.revision,
			fromAccountId: source.id,
			idempotencyKey: "valid-transfer",
			toAccountId: destination.id,
		});
		const replay = await owner.client.mutation(api.cli.v1.accounts.transfer, {
			amount: 30,
			expectedFromRevision: source.revision,
			expectedToRevision: currentDestination.revision,
			fromAccountId: source.id,
			idempotencyKey: "valid-transfer",
			toAccountId: destination.id,
		});
		expect(transfer.fromAccount.currentBalance).toBe(70);
		expect(transfer.toAccount.currentBalance).toBe(60);
		expect(replay).toEqual(transfer);
	});

	it("keeps account create and update dry runs aligned with commits", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "account-dry-runs");
		const createInput = {
			accountTypeId: owner.accountType._id,
			date: "2026-09-02",
			name: "  Daily cash  ",
			startingBalance: -10,
		};
		const preview = await owner.client.query(
			api.cli.v1.accounts.previewCreate,
			createInput
		);
		const created = await owner.client.mutation(api.cli.v1.accounts.create, {
			...createInput,
			idempotencyKey: "account-dry-run-create",
		});
		expect(created).toMatchObject({
			accountType: preview.accountType,
			currency: preview.currency,
			currentBalance: preview.currentBalance,
			name: preview.name,
			revision: preview.revision,
			startingBalance: preview.startingBalance,
		});

		const updateInput = {
			accountId: created.id,
			expectedRevision: created.revision,
			name: "  Pocket cash  ",
		};
		const updatePreview = await owner.client.query(
			api.cli.v1.accounts.previewUpdate,
			updateInput
		);
		const updated = await owner.client.mutation(api.cli.v1.accounts.update, {
			...updateInput,
			idempotencyKey: "account-dry-run-update",
		});
		expect(updated).toMatchObject({
			name: updatePreview.after.name,
			revision: updatePreview.after.revision,
		});
		expect(updatePreview.before).toMatchObject({
			name: created.name,
			revision: created.revision,
		});
	});

	it("allows only one competing update at the same expense revision", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "concurrent-updates");
		const expense = await owner.client.mutation(api.cli.v1.expenses.create, {
			amount: 5,
			date: "2026-09-02",
			idempotencyKey: "concurrent-create-key",
		});

		const results = await Promise.allSettled([
			owner.client.mutation(api.cli.v1.expenses.update, {
				amount: 6,
				expectedRevision: expense.revision,
				expenseId: expense.id,
				idempotencyKey: "concurrent-update-one",
			}),
			owner.client.mutation(api.cli.v1.expenses.update, {
				amount: 7,
				expectedRevision: expense.revision,
				expenseId: expense.id,
				idempotencyKey: "concurrent-update-two",
			}),
		]);
		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const rejected = results.filter((result) => result.status === "rejected");

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(getCliErrorCode(rejected[0]?.reason)).toBe(
			"EXPENSE_REVISION_CONFLICT"
		);
		const current = await owner.client.query(api.cli.v1.expenses.get, {
			expenseId: expense.id,
		});
		expect(current.revision).toBe(2);
	});

	it("returns aggregated context and cursor-stable account transactions", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "context-flow");
		const account = await createAccount(owner.client, owner.accountType._id, {
			key: "context-account",
			name: "Wallet",
			startingBalance: 100,
		});
		const context = await owner.client.query(api.cli.v1.context.get, {
			date: "2026-09-01",
			timezone: "Asia/Kolkata",
		});
		expect(context).toMatchObject({
			accounts: [{ id: account.id }],
			capabilities: { schemaVersion: 1 },
			currency: "USD",
			dateSource: "explicit",
			timezone: "Asia/Kolkata",
			userId: owner.userId,
		});
		await owner.client.mutation(api.cli.v1.accounts.adjustBalance, {
			accountId: account.id,
			expectedRevision: account.revision,
			idempotencyKey: "context-adjustment",
			newBalance: 90,
		});

		const firstPage = await owner.client.query(
			api.cli.v1.accounts.listTransactions,
			{ accountId: account.id, limit: 1 }
		);
		expect(firstPage.items).toHaveLength(1);
		const allIds = new Set(firstPage.items.map((item) => item.id));
		if (firstPage.nextCursor) {
			const secondPage = await owner.client.query(
				api.cli.v1.accounts.listTransactions,
				{
					accountId: account.id,
					cursor: firstPage.nextCursor,
					limit: 1,
				}
			);
			for (const item of secondPage.items) {
				expect(allIds.has(item.id)).toBe(false);
			}
		}
	});

	it("initializes legacy revisions and increments Web and ledger mutations", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "revision-migration");
		const legacy = await test.run(async (ctx) => {
			const accountId = await ctx.db.insert("accounts", {
				accountTypeId: owner.accountType._id,
				createdAt: 1,
				currentBalance: 50,
				name: "Legacy account",
				startingBalance: 50,
				userId: owner.userId,
			});
			const expenseId = await ctx.db.insert("expenses", {
				accountId,
				amount: 5,
				createdAt: 1,
				date: "2026-09-01",
				userId: owner.userId,
			});
			return { accountId, expenseId };
		});

		const [accountMigration, expenseMigration] = await Promise.all([
			test.mutation(internal.cli.v1.maintenance.initializeAccountRevisions, {}),
			test.mutation(internal.cli.v1.maintenance.initializeExpenseRevisions, {}),
		]);
		expect(accountMigration.updated).toBe(1);
		expect(expenseMigration.updated).toBe(1);
		const initialized = await test.run(async (ctx) => ({
			account: await ctx.db.get(legacy.accountId),
			expense: await ctx.db.get(legacy.expenseId),
		}));
		expect(initialized.account?.revision).toBe(1);
		expect(initialized.expense?.revision).toBe(1);

		const webExpense = await owner.client.mutation(api.expenses.create, {
			accountId: legacy.accountId,
			amount: 10,
			date: "2026-09-02",
		});
		expect(webExpense.revision).toBe(1);
		const webUpdated = await owner.client.mutation(api.expenses.update, {
			amount: 12,
			id: webExpense._id,
		});
		expect(webUpdated.revision).toBe(2);
		const accountAfterLedgerWrites = await owner.client.query(
			api.cli.v1.accounts.get,
			{ accountId: legacy.accountId }
		);
		expect(accountAfterLedgerWrites.revision).toBe(3);
	});

	it("applies category inference only to create after three matching histories", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "category-inference");
		const august = await owner.client.mutation(api.cycles.create, {
			endDate: "2026-09-01",
			name: "August",
			startDate: "2026-08-01",
		});
		const september = await owner.client.mutation(api.cycles.create, {
			endDate: "2026-10-01",
			name: "September",
			startDate: "2026-09-01",
		});
		if (!(august && september)) {
			throw new Error("Expected cycles");
		}
		const augustCategory = await owner.client.mutation(api.categories.create, {
			cycleId: august._id,
			name: "Groceries",
		});
		const septemberCategory = await owner.client.mutation(
			api.categories.create,
			{ cycleId: september._id, name: "Groceries" }
		);
		if (!(augustCategory && septemberCategory)) {
			throw new Error("Expected categories");
		}
		for (const [index, date] of [
			"2026-08-10",
			"2026-08-20",
			"2026-08-30",
		].entries()) {
			await owner.client.mutation(api.cli.v1.expenses.create, {
				amount: 10 + index,
				categoryId: augustCategory._id,
				date,
				idempotencyKey: `history-expense-${index}`,
				spentOn: "Local Market",
			});
		}
		const preview = await owner.client.query(
			api.cli.v1.expenses.previewCreate,
			{ amount: 20, date: "2026-09-02", spentOn: " local market " }
		);
		expect(preview).toMatchObject({
			categoryId: septemberCategory._id,
			categorySource: "history",
		});
	});

	it("increments expense revisions for indirect Web tag and category edits", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "indirect-revisions");
		const cycle = await owner.client.mutation(api.cycles.create, {
			endDate: "2026-10-01",
			name: "September",
			startDate: "2026-09-01",
		});
		if (!cycle) {
			throw new Error("Expected a cycle");
		}
		const category = await owner.client.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Food",
		});
		const tagId = await owner.client.mutation(api.tags.create, {
			name: "work",
		});
		if (!category) {
			throw new Error("Expected a category");
		}
		const expense = await owner.client.mutation(api.cli.v1.expenses.create, {
			amount: 14,
			categoryId: category._id,
			date: "2026-09-02",
			idempotencyKey: "indirect-revision-create",
			tagIds: [tagId],
		});

		await owner.client.mutation(api.tags.remove, { tagId });
		const afterTagRemoval = await owner.client.query(api.cli.v1.expenses.get, {
			expenseId: expense.id,
		});
		expect(afterTagRemoval).toMatchObject({ revision: 2, tags: [] });

		await owner.client.mutation(api.categories.remove, {
			categoryId: category._id,
		});
		const afterCategoryRemoval = await owner.client.query(
			api.cli.v1.expenses.get,
			{ expenseId: expense.id }
		);
		expect(afterCategoryRemoval).toMatchObject({
			category: null,
			revision: 3,
		});
	});

	it("paginates expenses deterministically without duplicate records", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "expense-pagination");
		for (const [index, date] of [
			"2026-09-01",
			"2026-09-02",
			"2026-09-03",
		].entries()) {
			await owner.client.mutation(api.cli.v1.expenses.create, {
				amount: index + 1,
				date,
				idempotencyKey: `pagination-expense-${index}`,
			});
		}

		const seenIds = new Set<string>();
		let cursor: string | undefined;
		do {
			const page = await owner.client.query(api.cli.v1.expenses.list, {
				cursor,
				limit: 1,
			});
			for (const expense of page.items) {
				expect(seenIds.has(expense.id)).toBe(false);
				seenIds.add(expense.id);
			}
			cursor = page.nextCursor ?? undefined;
		} while (cursor);

		expect(seenIds.size).toBe(3);
	});

	it("returns stable supporting reads and exclusive cycle boundaries", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "supporting-reads");
		const other = await createAuthenticatedUser(test, "supporting-reads-other");
		const september = await owner.client.mutation(api.cycles.create, {
			endDate: "2026-10-01",
			name: "September",
			startDate: "2026-09-01",
		});
		const october = await owner.client.mutation(api.cycles.create, {
			endDate: "2026-11-01",
			name: "October",
			startDate: "2026-10-01",
		});
		if (!(september && october)) {
			throw new Error("Expected cycles");
		}
		const category = await owner.client.mutation(api.categories.create, {
			cycleId: september._id,
			name: "Food",
			plannedAmount: 100,
		});
		if (!category) {
			throw new Error("Expected a category");
		}
		await owner.client.mutation(api.tags.create, { name: "essential" });
		await owner.client.mutation(api.cli.v1.expenses.create, {
			amount: 25,
			categoryId: category._id,
			date: "2026-09-30",
			idempotencyKey: "supporting-read-expense",
		});

		const [
			cycles,
			septemberCurrent,
			octoberCurrent,
			categories,
			tags,
			summary,
		] = await Promise.all([
			owner.client.query(api.cli.v1.resources.listCycles, {}),
			owner.client.query(api.cli.v1.resources.getCurrentCycle, {
				date: "2026-09-30",
			}),
			owner.client.query(api.cli.v1.resources.getCurrentCycle, {
				date: "2026-10-01",
			}),
			owner.client.query(api.cli.v1.resources.listCategories, {
				cycleId: september._id,
			}),
			owner.client.query(api.cli.v1.resources.listTags, {}),
			owner.client.query(api.cli.v1.resources.getSummary, {
				cycleId: september._id,
				today: "2026-09-02",
			}),
		]);

		expect(cycles.map((cycle) => cycle.id)).toEqual([
			october._id,
			september._id,
		]);
		expect(septemberCurrent?.id).toBe(september._id);
		expect(octoberCurrent?.id).toBe(october._id);
		expect(categories).toMatchObject([
			{ id: category._id, name: "Food", plannedAmount: 100 },
		]);
		expect(tags).toMatchObject([{ name: "essential" }]);
		expect(summary).toMatchObject({
			cycle: { id: september._id },
			daysRemaining: 29,
			remaining: 75,
			totalPlanned: 100,
			totalSpent: 25,
		});
		await expectCliError(
			other.client.query(api.cli.v1.resources.listCategories, {
				cycleId: september._id,
			}),
			"RESOURCE_NOT_FOUND"
		);
	});

	it("preserves the CLI local-default date source in context", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "local-context-date");
		const context = await owner.client.query(api.cli.v1.context.get, {
			date: "2026-09-02",
			dateSource: "local_default",
			timezone: "Asia/Kolkata",
		});

		expect(context).toMatchObject({
			dateSource: "local_default",
			effectiveDate: "2026-09-02",
			timezone: "Asia/Kolkata",
		});
	});
});
