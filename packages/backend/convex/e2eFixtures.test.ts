// biome-ignore-all lint/style/useFilenamingConvention: Match the Convex module name.

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const TEST_DEPLOYMENT_URL = "https://spendly-e2e-123.convex.cloud";
const FIXTURE_EMAIL =
	"spendly-e2e-12345678-1234-1234-1234-123456789abc+clerk_test@example.com";
const cleanupArgs = {
	clerkId: "user_e2e_fixture",
	email: FIXTURE_EMAIL,
	expectedDeploymentUrl: TEST_DEPLOYMENT_URL,
};
const removeUser = makeFunctionReference<"mutation", typeof cleanupArgs, null>(
	"e2eFixtures:removeUser"
);
const createBackendTest = () => convexTest(schema, modules);
type BackendTest = ReturnType<typeof createBackendTest>;

const seedUser = async (
	testContext: BackendTest,
	clerkId = cleanupArgs.clerkId,
	email = FIXTURE_EMAIL
) =>
	await testContext.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			clerkId,
			createdAt: 1,
			email,
		});
		const tagId = await ctx.db.insert("tags", {
			createdAt: 1,
			name: "Keep unless cleanup succeeds",
			userId,
		});
		return { tagId, userId };
	});

const seedAllUserRecords = async (
	testContext: BackendTest,
	clerkId = cleanupArgs.clerkId,
	email = FIXTURE_EMAIL
) => {
	const { tagId, userId } = await seedUser(testContext, clerkId, email);
	return await testContext.run(async (ctx) => {
		const cycleId = await ctx.db.insert("expense_cycles", {
			createdAt: 1,
			endDate: "2026-08-31",
			name: "August",
			startDate: "2026-08-01",
			userId,
		});
		const categoryTypeId = await ctx.db.insert("category_types", {
			createdAt: 1,
			name: "Needs",
			userId,
		});
		const categoryId = await ctx.db.insert("categories", {
			categoryTypeId,
			createdAt: 1,
			cycleId,
			name: "Food",
			order: 0,
			userId,
		});
		const accountTypeId = await ctx.db.insert("account_types", {
			balanceNature: "asset",
			createdAt: 1,
			name: "Bank",
			normalizedName: "bank",
			order: 0,
			userId,
		});
		const accountId = await ctx.db.insert("accounts", {
			accountTypeId,
			createdAt: 1,
			currentBalance: 100,
			name: "Checking",
			startingBalance: 100,
			userId,
		});
		const otherAccountId = await ctx.db.insert("accounts", {
			accountTypeId,
			createdAt: 1,
			currentBalance: 0,
			isArchived: true,
			name: "Archived savings",
			startingBalance: 0,
			userId,
		});
		const expenseId = await ctx.db.insert("expenses", {
			accountId,
			amount: 5,
			categoryId,
			createdAt: 1,
			cycleId,
			date: "2026-08-01",
			tagIds: [tagId],
			userId,
		});
		const transferId = await ctx.db.insert("account_transfers", {
			amount: 10,
			createdAt: 1,
			date: "2026-08-02",
			fromAccountId: accountId,
			toAccountId: otherAccountId,
			userId,
		});
		const transactionId = await ctx.db.insert("account_transactions", {
			accountId,
			amount: -5,
			balanceAfter: 95,
			createdAt: 1,
			date: "2026-08-01",
			expenseId,
			type: "expense",
			userId,
		});
		const idempotencyId = await ctx.db.insert("cli_idempotency", {
			createdAt: 1,
			expiresAt: 2,
			key: "create-expense",
			operation: "expense.create",
			requestFingerprint: "fixture",
			result: { expenseId },
			userId,
		});
		const confirmationId = await ctx.db.insert("cli_deletion_confirmations", {
			createdAt: 1,
			expenseId,
			expiresAt: 2,
			revision: 1,
			userId,
		});
		await ctx.db.patch(userId, {
			defaultAccountId: accountId,
			onboardingCycleId: cycleId,
		});
		return {
			ids: {
				account_transactions: transactionId,
				account_transfers: transferId,
				account_types: accountTypeId,
				accounts: accountId,
				categories: categoryId,
				category_types: categoryTypeId,
				cli_deletion_confirmations: confirmationId,
				cli_idempotency: idempotencyId,
				expense_cycles: cycleId,
				expenses: expenseId,
				otherAccount: otherAccountId,
				tags: tagId,
				users: userId,
			},
			userId,
		};
	});
};

const readUserRecords = async (
	testContext: BackendTest,
	seeded: Awaited<ReturnType<typeof seedAllUserRecords>>
) =>
	await testContext.run(
		async (ctx) =>
			await Promise.all(Object.values(seeded.ids).map((id) => ctx.db.get(id)))
	);

const userRecordsExist = async (
	testContext: BackendTest,
	seeded: Awaited<ReturnType<typeof seedUser>>
) => {
	const records = await testContext.run(async (ctx) => ({
		tag: await ctx.db.get(seeded.tagId),
		user: await ctx.db.get(seeded.userId),
	}));
	return records.user !== null && records.tag !== null;
};

beforeEach(() => {
	vi.stubEnv("SPENDLY_E2E_ENABLED", "true");
	vi.stubEnv("CONVEX_CLOUD_URL", TEST_DEPLOYMENT_URL);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("internal E2E cleanup", () => {
	it("returns null for an absent Clerk ID without deleting a user with the same email", async () => {
		const testContext = createBackendTest();
		const otherUser = await seedAllUserRecords(testContext, "user_other_clerk");
		const recordsBefore = await readUserRecords(testContext, otherUser);

		await expect(
			testContext.mutation(removeUser, cleanupArgs)
		).resolves.toBeNull();
		expect(await readUserRecords(testContext, otherUser)).toEqual(
			recordsBefore
		);
	});

	it("returns null again when cleanup is repeated", async () => {
		const testContext = createBackendTest();
		const fixture = await seedAllUserRecords(testContext);

		await expect(
			testContext.mutation(removeUser, cleanupArgs)
		).resolves.toBeNull();
		await expect(
			testContext.mutation(removeUser, cleanupArgs)
		).resolves.toBeNull();
		expect(await readUserRecords(testContext, fixture)).toEqual(
			new Array<null>(13).fill(null)
		);
	});

	it("allows exactly 1000 owned rows even when another user exceeds the cap", async () => {
		const testContext = createBackendTest();
		const fixture = await seedUser(testContext);
		const otherUser = await seedUser(
			testContext,
			"user_real",
			"real-user@example.com"
		);
		const extraIds = await testContext.run(async (ctx) => {
			const ids: Id<"tags">[] = [];
			for (let index = 0; index < 1000; index += 1) {
				ids.push(
					await ctx.db.insert("tags", {
						createdAt: 1,
						name: `Other tag ${index}`,
						userId: otherUser.userId,
					})
				);
				if (index < 999) {
					await ctx.db.insert("tags", {
						createdAt: 1,
						name: `Fixture tag ${index}`,
						userId: fixture.userId,
					});
				}
			}
			return ids;
		});

		await expect(
			testContext.mutation(removeUser, cleanupArgs)
		).resolves.toBeNull();
		const fixtureTags = await testContext.run(
			async (ctx) =>
				await ctx.db
					.query("tags")
					.withIndex("by_userId", (query) => query.eq("userId", fixture.userId))
					.take(1001)
		);
		expect(fixtureTags).toEqual([]);
		expect(await userRecordsExist(testContext, fixture)).toBe(false);
		expect(await userRecordsExist(testContext, otherUser)).toBe(true);
		const extraRecords = await testContext.run(
			async (ctx) => await Promise.all(extraIds.map((id) => ctx.db.get(id)))
		);
		expect(extraRecords.every((record) => record !== null)).toBe(true);
	});

	it.each([
		"accounts",
		"account_types",
		"account_transactions",
		"account_transfers",
		"expenses",
		"categories",
		"category_types",
		"tags",
		"expense_cycles",
		"cli_idempotency",
		"cli_deletion_confirmations",
	] as const)("aborts all deletion when %s exceeds 1000 owned rows", async (table) => {
		const testContext = createBackendTest();
		const fixture = await seedAllUserRecords(testContext);
		const recordsBefore = await readUserRecords(testContext, fixture);
		const extraIds = await testContext.run(async (ctx) => {
			const record = await ctx.db.get(fixture.ids[table]);
			if (!record) {
				throw new Error("Expected a seeded record");
			}
			const {
				_id: _ignoredId,
				_creationTime: _ignoredTime,
				...fields
			} = record;
			const ids: Id<typeof table>[] = [];
			const extraCount = table === "accounts" ? 999 : 1000;
			for (let index = 0; index < extraCount; index += 1) {
				ids.push(await ctx.db.insert(table, fields));
			}
			return ids;
		});

		await expect(testContext.mutation(removeUser, cleanupArgs)).rejects.toThrow(
			"E2E cleanup exceeds the per-table row limit"
		);

		expect(await readUserRecords(testContext, fixture)).toEqual(recordsBefore);
		const extraRecords = await testContext.run(
			async (ctx) => await Promise.all(extraIds.map((id) => ctx.db.get(id)))
		);
		expect(extraRecords.every((record) => record !== null)).toBe(true);
	});

	it("deletes all owned records without changing another user's data", async () => {
		const testContext = createBackendTest();
		const fixture = await seedAllUserRecords(testContext);
		const otherUser = await seedAllUserRecords(
			testContext,
			"user_real",
			"real-user@example.com"
		);
		const otherRecordsBefore = await readUserRecords(testContext, otherUser);

		await expect(
			testContext.mutation(removeUser, cleanupArgs)
		).resolves.toBeNull();

		const fixtureRecords = await readUserRecords(testContext, fixture);
		expect(fixtureRecords).toEqual(new Array<null>(13).fill(null));
		expect(await readUserRecords(testContext, otherUser)).toEqual(
			otherRecordsBefore
		);
	});

	it.each([
		"real-user@example.com",
		"spendly-e2e-12345678-1234-1234-1234-123456789abc@example.com",
		"spendly-e2e-------------------------------------+clerk_test@example.com",
		"spendly-e2e-12345678123412341234123456789abc----+clerk_test@example.com",
		"spendly-e2e-12345678-1234-1234-1234-123456789abg+clerk_test@example.com",
		FIXTURE_EMAIL.toUpperCase(),
		`${FIXTURE_EMAIL}\n`,
	])("rejects nonfixture emails even if the stored email matches (%s)", async (email) => {
		const testContext = createBackendTest();
		const seeded = await seedUser(testContext, cleanupArgs.clerkId, email);

		await expect(
			testContext.mutation(removeUser, { ...cleanupArgs, email })
		).rejects.toThrow("E2E cleanup requires a fixture email");
		expect(await userRecordsExist(testContext, seeded)).toBe(true);
	});

	it.each([
		"real-user@example.com",
		"spendly-e2e-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee+clerk_test@example.com",
	])("rejects a stored user whose email does not match (%s)", async (email) => {
		const testContext = createBackendTest();
		const seeded = await seedUser(testContext, cleanupArgs.clerkId, email);

		await expect(testContext.mutation(removeUser, cleanupArgs)).rejects.toThrow(
			"E2E cleanup user email mismatch"
		);
		expect(await userRecordsExist(testContext, seeded)).toBe(true);
	});

	it("rejects the production deployment even when enabled and matching", async () => {
		const testContext = createBackendTest();
		const seeded = await seedUser(testContext);
		const productionUrl = "https://successful-donkey-782.convex.cloud";
		vi.stubEnv("CONVEX_CLOUD_URL", productionUrl);

		await expect(
			testContext.mutation(removeUser, {
				...cleanupArgs,
				expectedDeploymentUrl: productionUrl,
			})
		).rejects.toThrow("E2E cleanup cannot target production");
		expect(await userRecordsExist(testContext, seeded)).toBe(true);
	});

	it.each([
		undefined,
		"https://other-dev-123.convex.cloud",
	])("rejects a missing or mismatched deployment URL (%s)", async (deploymentUrl) => {
		const testContext = createBackendTest();
		const seeded = await seedUser(testContext);
		vi.stubEnv("CONVEX_CLOUD_URL", deploymentUrl);

		await expect(testContext.mutation(removeUser, cleanupArgs)).rejects.toThrow(
			"E2E cleanup deployment URL mismatch"
		);
		expect(await userRecordsExist(testContext, seeded)).toBe(true);
	});

	it.each([
		"http://spendly-e2e-123.convex.cloud",
		"https://spendly-e2e-123.convex.cloud/",
		"https://spendly-e2e-123.convex.cloud/path",
		"https://spendly-e2e-123.convex.cloud?query=1",
		"https://spendly-e2e-123.convex.cloud#fragment",
		"https://admin@spendly-e2e-123.convex.cloud",
		"https://spendly-e2e-123.convex.cloud:443",
		"https://spendly-e2e-123.convex.cloud:8080",
		"https://spendly-e2e-123.convex.cloud.evil.example",
		"https://example.com",
		"https://convex.cloud",
		`${TEST_DEPLOYMENT_URL}\n`,
		"not a URL",
	])("rejects non-bare HTTPS Convex origins (%s)", async (deploymentUrl) => {
		const testContext = createBackendTest();
		const seeded = await seedUser(testContext);
		vi.stubEnv("CONVEX_CLOUD_URL", deploymentUrl);

		await expect(
			testContext.mutation(removeUser, {
				...cleanupArgs,
				expectedDeploymentUrl: deploymentUrl,
			})
		).rejects.toThrow("Expected a bare HTTPS convex.cloud deployment origin");
		expect(await userRecordsExist(testContext, seeded)).toBe(true);
	});

	it.each([
		undefined,
		"false",
		"TRUE",
		"1",
	])("rejects cleanup unless explicitly enabled (%s)", async (enabled) => {
		const testContext = createBackendTest();
		const seeded = await seedUser(testContext);
		vi.stubEnv("SPENDLY_E2E_ENABLED", enabled);

		await expect(testContext.mutation(removeUser, cleanupArgs)).rejects.toThrow(
			"E2E cleanup is disabled"
		);
		expect(await userRecordsExist(testContext, seeded)).toBe(true);
	});
});
