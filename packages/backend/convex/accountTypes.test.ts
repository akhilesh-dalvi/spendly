// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const DEFAULT_ACCOUNT_TYPE_NAMES = [
	"Cash",
	"Checking",
	"Savings",
	"Credit Card",
	"Wallet",
	"Other",
] as const;

const createBackendTest = () => convexTest(schema, modules);

type BackendTest = ReturnType<typeof createBackendTest>;

const createAuthenticatedUser = async (t: BackendTest, subject: string) => {
	const client = t.withIdentity({
		email: `${subject}@example.com`,
		subject,
	});
	const userId = await client.mutation(api.users.create, {
		email: `${subject}@example.com`,
		name: subject,
	});
	return { client, userId };
};

const expectErrorCode = async (
	operation: Promise<unknown>,
	errorCode: string
): Promise<void> => {
	let caughtError: unknown;
	try {
		await operation;
	} catch (error) {
		caughtError = error;
	}

	if (caughtError === undefined) {
		throw new Error(`Expected ${errorCode} but the operation succeeded`);
	}
	const errorData =
		typeof caughtError === "object" &&
		caughtError !== null &&
		"data" in caughtError
			? caughtError.data
			: caughtError;
	if (!String(errorData).includes(errorCode)) {
		throw new Error(`Expected ${errorCode} but received ${String(errorData)}`);
	}
};

describe("account types", () => {
	it("isolates account types and protected actions by user", async () => {
		const t = createBackendTest();
		const alice = await createAuthenticatedUser(t, "alice");
		const bob = await createAuthenticatedUser(t, "bob");
		const brokerage = await alice.client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Brokerage",
		});

		const [aliceTypes, bobTypes] = await Promise.all([
			alice.client.query(api.accountTypes.list, { includeArchived: true }),
			bob.client.query(api.accountTypes.list, { includeArchived: true }),
		]);
		expect(
			aliceTypes.some((accountType) => accountType._id === brokerage._id)
		).toBe(true);
		expect(
			bobTypes.every((accountType) => accountType.userId === bob.userId)
		).toBe(true);
		expect(
			bobTypes.some((accountType) => accountType._id === brokerage._id)
		).toBe(false);

		await expectErrorCode(
			bob.client.query(api.accountTypes.get, {
				accountTypeId: brokerage._id,
			}),
			"UNAUTHORIZED"
		);
		await expectErrorCode(
			bob.client.mutation(api.accountTypes.update, {
				accountTypeId: brokerage._id,
				name: "Stolen",
			}),
			"UNAUTHORIZED"
		);
		await expectErrorCode(
			bob.client.mutation(api.accountTypes.archive, {
				accountTypeId: brokerage._id,
				isArchived: true,
			}),
			"UNAUTHORIZED"
		);
		await expectErrorCode(
			bob.client.mutation(api.accountTypes.remove, {
				accountTypeId: brokerage._id,
			}),
			"UNAUTHORIZED"
		);
	});

	it("supports create, update, archive, reactivate, and delete", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "lifecycle");
		const created = await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			color: "#aabbcc",
			icon: "vault",
			name: "  Investments  ",
		});
		expect(created).toMatchObject({
			balanceNature: "asset",
			color: "#AABBCC",
			icon: "vault",
			name: "Investments",
			normalizedName: "investments",
		});

		const updated = await client.mutation(api.accountTypes.update, {
			accountTypeId: created._id,
			balanceNature: "liability",
			color: "#123456",
			icon: "building-2",
			name: "Margin Loan",
		});
		expect(updated).toMatchObject({
			balanceNature: "liability",
			color: "#123456",
			icon: "building-2",
			name: "Margin Loan",
		});

		const archived = await client.mutation(api.accountTypes.archive, {
			accountTypeId: created._id,
			isArchived: true,
		});
		expect(archived.isArchived).toBe(true);
		const activeTypes = await client.query(api.accountTypes.list, {});
		expect(
			activeTypes.some((accountType) => accountType._id === created._id)
		).toBe(false);

		const reactivated = await client.mutation(api.accountTypes.archive, {
			accountTypeId: created._id,
			isArchived: false,
		});
		expect(reactivated.isArchived).toBe(false);
		expect(
			await client.mutation(api.accountTypes.remove, {
				accountTypeId: created._id,
			})
		).toEqual({ success: true });
		await expectErrorCode(
			client.query(api.accountTypes.get, { accountTypeId: created._id }),
			"ACCOUNT_TYPE_NOT_FOUND"
		);
	});

	it("rejects case-insensitive duplicate names", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "duplicates");
		await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Brokerage",
		});

		await expectErrorCode(
			client.mutation(api.accountTypes.create, {
				balanceNature: "asset",
				name: "  bRoKeRaGe  ",
			}),
			"ACCOUNT_TYPE_NAME_TAKEN"
		);
	});

	it("protects deletion and balance nature while a type is in use", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "in-use");
		const accountType = await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Brokerage",
		});
		await client.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "USD",
			name: "Investments",
			startingBalance: 100,
		});

		const usage = await client.query(api.accountTypes.getUsage, {
			accountTypeId: accountType._id,
		});
		expect(usage).toMatchObject({ accountCount: 1, canDelete: false });
		await expectErrorCode(
			client.mutation(api.accountTypes.remove, {
				accountTypeId: accountType._id,
			}),
			"ACCOUNT_TYPE_IN_USE"
		);
		await expectErrorCode(
			client.mutation(api.accountTypes.update, {
				accountTypeId: accountType._id,
				balanceNature: "liability",
			}),
			"ACCOUNT_TYPE_BALANCE_NATURE_IN_USE"
		);
	});

	it("rejects foreign and archived types during account writes", async () => {
		const t = createBackendTest();
		const alice = await createAuthenticatedUser(t, "account-owner");
		const bob = await createAuthenticatedUser(t, "type-owner");
		const aliceTypes = await alice.client.query(api.accountTypes.list, {});
		const bobType = await bob.client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Bob Wallet",
		});
		const archivedType = await alice.client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Old Wallet",
		});
		await alice.client.mutation(api.accountTypes.archive, {
			accountTypeId: archivedType._id,
			isArchived: true,
		});

		await expectErrorCode(
			alice.client.mutation(api.accounts.create, {
				accountTypeId: bobType._id,
				name: "Foreign",
				startingBalance: 0,
			}),
			"UNAUTHORIZED"
		);
		await expectErrorCode(
			alice.client.mutation(api.accounts.create, {
				accountTypeId: archivedType._id,
				name: "Archived",
				startingBalance: 0,
			}),
			"ACCOUNT_TYPE_ARCHIVED"
		);

		const defaultAccountType = aliceTypes[0];
		expect(defaultAccountType).toBeDefined();
		if (!defaultAccountType) {
			throw new Error("Expected a default account type");
		}
		const account = await alice.client.mutation(api.accounts.create, {
			accountTypeId: defaultAccountType._id,
			name: "Everyday",
			startingBalance: 50,
		});
		await expectErrorCode(
			alice.client.mutation(api.accounts.update, {
				accountId: account._id,
				accountTypeId: bobType._id,
			}),
			"UNAUTHORIZED"
		);
		await expectErrorCode(
			alice.client.mutation(api.accounts.update, {
				accountId: account._id,
				accountTypeId: archivedType._id,
			}),
			"ACCOUNT_TYPE_ARCHIVED"
		);
	});

	it("seeds exactly six ordered defaults and remains idempotent", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "seeding");
		const initialTypes = await client.query(api.accountTypes.list, {
			includeArchived: true,
		});
		expect(initialTypes.map((accountType) => accountType.name)).toEqual(
			DEFAULT_ACCOUNT_TYPE_NAMES
		);
		expect(initialTypes.map((accountType) => accountType.order)).toEqual([
			0, 1, 2, 3, 4, 5,
		]);

		const checking = initialTypes[1];
		expect(checking).toBeDefined();
		if (!checking) {
			throw new Error("Expected the Checking default account type");
		}
		await client.mutation(api.accountTypes.update, {
			accountTypeId: checking._id,
			color: "#112233",
			icon: "vault",
		});
		const firstRecovery = await client.mutation(
			api.accountTypes.seedDefaults,
			{}
		);
		const secondRecovery = await client.mutation(
			api.accountTypes.seedDefaults,
			{}
		);
		expect(firstRecovery).toMatchObject({ createdCount: 0 });
		expect(secondRecovery).toMatchObject({ createdCount: 0 });

		const afterRecovery = await client.query(api.accountTypes.list, {
			includeArchived: true,
		});
		expect(afterRecovery).toHaveLength(6);
		expect(afterRecovery[1]).toMatchObject({
			_id: checking._id,
			color: "#112233",
			icon: "vault",
			order: 1,
		});
	});

	it("resolves current type metadata in account queries", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "metadata");
		const accountType = await client.mutation(api.accountTypes.create, {
			balanceNature: "liability",
			color: "#AA5500",
			icon: "hand-coins",
			name: "Personal Loan",
		});
		const account = await client.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "USD",
			name: "Family loan",
			startingBalance: -500,
		});

		const [accountList, accountDetail, summary] = await Promise.all([
			client.query(api.accounts.list, { includeArchived: true }),
			client.query(api.accounts.get, { accountId: account._id }),
			client.query(api.accounts.getSummary, {}),
		]);
		const expectedMetadata = {
			accountTypeBalanceNature: "liability",
			accountTypeColor: "#AA5500",
			accountTypeIcon: "hand-coins",
			accountTypeName: "Personal Loan",
		};
		expect(accountList.find((item) => item._id === account._id)).toMatchObject(
			expectedMetadata
		);
		expect(accountDetail).toMatchObject(expectedMetadata);
		expect(
			summary.accounts.find((item) => item._id === account._id)
		).toMatchObject(expectedMetadata);
	});

	it("keeps ledger arithmetic independent from account type metadata", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "ledger");
		const accountType = await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Custom Asset",
		});
		const source = await client.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "USD",
			name: "Source",
			startingBalance: 100,
		});
		const destination = await client.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			currency: "USD",
			name: "Destination",
			startingBalance: 40,
		});
		await client.mutation(api.accounts.updateBalance, {
			accountId: source._id,
			newBalance: 150,
		});
		await client.mutation(api.accountTypes.update, {
			accountTypeId: accountType._id,
			color: "#ABCDEF",
			name: "Renamed Asset",
		});
		await client.mutation(api.accounts.transfer, {
			amount: 25,
			fromAccountId: source._id,
			toAccountId: destination._id,
		});

		const [updatedSource, updatedDestination, transactions] = await Promise.all(
			[
				client.query(api.accounts.get, { accountId: source._id }),
				client.query(api.accounts.get, { accountId: destination._id }),
				client.query(api.accounts.listTransactions, {
					accountId: source._id,
					limit: 10,
				}),
			]
		);
		expect(updatedSource.currentBalance).toBe(125);
		expect(updatedDestination.currentBalance).toBe(65);
		expect(updatedSource.accountTypeName).toBe("Renamed Asset");
		expect(
			transactions
				.map((transaction) => transaction.amount)
				.sort((a, b) => a - b)
		).toEqual([-25, 50, 100]);
	});

	it("keeps archived type metadata visible on historical accounts and expenses", async () => {
		const t = createBackendTest();
		const { client, userId } = await createAuthenticatedUser(t, "history");
		const accountType = await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			color: "#445566",
			icon: "coins",
			name: "Travel Cash",
		});
		const account = await client.mutation(api.accounts.create, {
			accountTypeId: accountType._id,
			name: "Holiday wallet",
			startingBalance: 250,
		});
		const expenseId = await t.run(async (ctx) => {
			return await ctx.db.insert("expenses", {
				accountId: account._id,
				amount: 30,
				createdAt: Date.now(),
				date: "2026-08-17",
				spentOn: "Museum",
				userId,
			});
		});
		await client.mutation(api.accountTypes.archive, {
			accountTypeId: accountType._id,
			isArchived: true,
		});

		const [accounts, expenses] = await Promise.all([
			client.query(api.accounts.list, { includeArchived: true }),
			client.query(api.expenses.list, {}),
		]);
		expect(accounts.find((item) => item._id === account._id)).toMatchObject({
			accountTypeColor: "#445566",
			accountTypeIcon: "coins",
			accountTypeName: "Travel Cash",
		});
		expect(expenses.find((expense) => expense._id === expenseId)).toMatchObject(
			{
				accountName: "Holiday wallet",
				accountTypeColor: "#445566",
				accountTypeIcon: "coins",
				accountTypeName: "Travel Cash",
			}
		);
	});

	it("allows deletion after account reassignment without changing rejected ledger data", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "reassignment");
		const defaultTypes = await client.query(api.accountTypes.list, {});
		const replacementType = defaultTypes[0];
		expect(replacementType).toBeDefined();
		if (!replacementType) {
			throw new Error("Expected a default replacement account type");
		}

		const customType = await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Temporary Asset",
		});
		const account = await client.mutation(api.accounts.create, {
			accountTypeId: customType._id,
			currency: "USD",
			name: "Temporary account",
			startingBalance: 100,
		});
		await client.mutation(api.expenses.create, {
			accountId: account._id,
			amount: 25,
			date: "2026-08-17",
			spentOn: "Acceptance expense",
		});

		const beforeRejectedUpdate = await client.query(api.accounts.get, {
			accountId: account._id,
		});
		const transactionsBefore = await client.query(
			api.accounts.listTransactions,
			{ accountId: account._id, limit: 10 }
		);
		expect(beforeRejectedUpdate.currentBalance).toBe(75);

		await expectErrorCode(
			client.mutation(api.accountTypes.update, {
				accountTypeId: customType._id,
				balanceNature: "liability",
			}),
			"ACCOUNT_TYPE_BALANCE_NATURE_IN_USE"
		);
		const afterRejectedUpdate = await client.query(api.accounts.get, {
			accountId: account._id,
		});
		const transactionsAfter = await client.query(
			api.accounts.listTransactions,
			{ accountId: account._id, limit: 10 }
		);
		expect(afterRejectedUpdate.currentBalance).toBe(75);
		expect(transactionsAfter).toEqual(transactionsBefore);

		await client.mutation(api.accounts.update, {
			accountId: account._id,
			accountTypeId: replacementType._id,
		});
		expect(
			await client.mutation(api.accountTypes.remove, {
				accountTypeId: customType._id,
			})
		).toEqual({ success: true });
		const reassignedAccount = await client.query(api.accounts.get, {
			accountId: account._id,
		});
		expect(reassignedAccount.accountTypeName).toBe(replacementType.name);
	});

	it("supports account lifecycle and expense sync with sparse metadata and currencies", async () => {
		const t = createBackendTest();
		const { client } = await createAuthenticatedUser(t, "account-lifecycle");
		const sparseAsset = await client.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "A very long custom account type name for international holdings",
		});
		const sparseLiability = await client.mutation(api.accountTypes.create, {
			balanceNature: "liability",
			name: "Unsecured liability",
		});
		const source = await client.mutation(api.accounts.create, {
			accountTypeId: sparseAsset._id,
			currency: "USD",
			name: "Negative USD account",
			startingBalance: -20,
		});
		const destination = await client.mutation(api.accounts.create, {
			accountTypeId: sparseLiability._id,
			currency: "EUR",
			name: "Euro liability",
			startingBalance: 500,
		});

		const expense = await client.mutation(api.expenses.create, {
			accountId: source._id,
			amount: 10,
			date: "2026-08-17",
			spentOn: "Initial expense",
		});
		expect(
			(await client.query(api.accounts.get, { accountId: source._id }))
				.currentBalance
		).toBe(-30);

		await client.mutation(api.expenses.update, {
			id: expense._id,
			accountId: destination._id,
			amount: 15,
			spentOn: "Moved expense",
		});
		const [sourceAfterMove, destinationAfterMove] = await Promise.all([
			client.query(api.accounts.get, { accountId: source._id }),
			client.query(api.accounts.get, { accountId: destination._id }),
		]);
		expect(sourceAfterMove).toMatchObject({
			accountTypeColor: null,
			accountTypeIcon: null,
			currentBalance: -20,
		});
		expect(destinationAfterMove).toMatchObject({
			accountTypeColor: null,
			accountTypeIcon: null,
			currentBalance: 485,
		});

		await client.mutation(api.accounts.archive, {
			accountId: source._id,
			isArchived: true,
		});
		expect(
			(await client.query(api.accounts.list, {})).some(
				(item) => item._id === source._id
			)
		).toBe(false);
		await client.mutation(api.accounts.archive, {
			accountId: source._id,
			isArchived: false,
		});
		const editedSource = await client.mutation(api.accounts.update, {
			accountId: source._id,
			accountTypeId: sparseLiability._id,
			currency: "GBP",
			name: "Renamed international negative-balance account",
		});
		expect(editedSource).toMatchObject({
			accountTypeBalanceNature: "liability",
			accountTypeName: "Unsecured liability",
			currency: "GBP",
			currentBalance: -20,
		});

		expect(
			await client.mutation(api.expenses.remove, { id: expense._id })
		).toEqual({ success: true });
		expect(
			(await client.query(api.accounts.get, { accountId: destination._id }))
				.currentBalance
		).toBe(500);
	});
});
