import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const createBackendTest = () => convexTest(schema, modules);

type BackendTest = ReturnType<typeof createBackendTest>;

const createAuthenticatedUser = async (
	testContext: BackendTest,
	subject: string
) => {
	const client = testContext.withIdentity({
		email: `${subject}@example.com`,
		subject,
	});
	await client.mutation(api.users.create, {
		email: `${subject}@example.com`,
		name: subject,
	});
	return client;
};

const beginWithCycle = async (testContext: BackendTest, subject: string) => {
	const client = await createAuthenticatedUser(testContext, subject);
	await client.mutation(api.users.beginOnboarding, {
		currency: "USD",
		path: "plan",
	});
	const cycleId = await client.mutation(api.cycles.saveOnboardingCycle, {
		endDate: "2026-08-31",
		name: "August 2026",
		startDate: "2026-08-01",
	});
	return { client, cycleId };
};

describe("onboarding persistence", () => {
	it("waits for the authenticated user profile to be provisioned", async () => {
		const testContext = createBackendTest();
		const client = testContext.withIdentity({
			email: "new-user@example.com",
			subject: "new-user",
		});

		const state = await client.query(api.users.getOnboardingState, {});

		expect(state).toBeNull();
	});

	it("updates the first cycle in place when the user goes back", async () => {
		const testContext = createBackendTest();
		const { client, cycleId } = await beginWithCycle(testContext, "cycle-back");

		const updatedCycleId = await client.mutation(
			api.cycles.saveOnboardingCycle,
			{
				cycleId,
				endDate: "2026-08-30",
				name: "August pay period",
				startDate: "2026-08-02",
			}
		);
		const cycles = await client.query(api.cycles.list, {});

		expect(updatedCycleId).toBe(cycleId);
		expect(cycles).toHaveLength(1);
		expect(cycles[0]).toMatchObject({
			endDate: "2026-08-30",
			name: "August pay period",
			startDate: "2026-08-02",
		});
	});

	it("keeps a blank planned amount absent and explicit zero intact", async () => {
		const testContext = createBackendTest();
		const { client, cycleId } = await beginWithCycle(testContext, "amounts");

		await client.mutation(api.categories.saveOnboardingCategories, {
			categories: [
				{ icon: "🏠", name: "Rent" },
				{ icon: "🛒", name: "Groceries", plannedAmount: 0 },
			],
			cycleId,
		});
		const categories = await client.query(api.categories.list, { cycleId });
		const rent = categories.find((category) => category.name === "Rent");
		const groceries = categories.find(
			(category) => category.name === "Groceries"
		);

		expect(rent?.plannedAmount).toBeUndefined();
		expect(groceries?.plannedAmount).toBe(0);
	});

	it("updates an existing onboarding category without replacing its id", async () => {
		const testContext = createBackendTest();
		const { client, cycleId } = await beginWithCycle(
			testContext,
			"category-back"
		);

		await client.mutation(api.categories.saveOnboardingCategories, {
			categories: [{ name: "Rent", plannedAmount: 1000 }],
			cycleId,
		});
		const [createdCategory] = await client.query(api.categories.list, {
			cycleId,
		});
		if (!createdCategory) {
			throw new Error("Expected an onboarding category");
		}

		await client.mutation(api.categories.saveOnboardingCategories, {
			categories: [{ categoryId: createdCategory._id, name: "Home" }],
			cycleId,
		});
		const categories = await client.query(api.categories.list, { cycleId });

		expect(categories).toHaveLength(1);
		expect(categories[0]).toMatchObject({
			_id: createdCategory._id,
			name: "Home",
		});
		expect(categories[0]?.plannedAmount).toBeUndefined();
	});

	it("persists skipped account setup as completed onboarding", async () => {
		const testContext = createBackendTest();
		const { client } = await beginWithCycle(testContext, "skip-account");

		await client.mutation(api.users.completeOnboarding, {
			accountStatus: "skipped",
		});
		const state = await client.query(api.users.getOnboardingState, {});

		expect(state).toMatchObject({
			accountStatus: "skipped",
			step: "complete",
		});
	});

	it("creates the first account, opening entry, and completed status", async () => {
		const testContext = createBackendTest();
		const { client } = await beginWithCycle(testContext, "create-account");
		const accountTypes = await client.query(api.accountTypes.list, {});
		const accountType = accountTypes[0];
		if (!accountType) {
			throw new Error("Expected a default account type");
		}

		const accountId = await client.mutation(
			api.accounts.createOnboardingAccount,
			{
				accountTypeId: accountType._id,
				name: "Everyday checking",
				openingBalance: 125,
			}
		);
		const state = await client.query(api.users.getOnboardingState, {});
		const persisted = await testContext.run(async (ctx) => {
			const account = await ctx.db.get(accountId);
			const openingEntry = await ctx.db
				.query("account_transactions")
				.withIndex("by_accountId_date", (queryBuilder) =>
					queryBuilder.eq("accountId", accountId)
				)
				.unique();
			return { account, openingEntry };
		});

		expect(state).toMatchObject({
			accountStatus: "completed",
			step: "complete",
		});
		expect(persisted.account).toMatchObject({
			currentBalance: 125,
			startingBalance: 125,
		});
		expect(persisted.account).not.toHaveProperty("currency");
		expect(persisted.openingEntry).toMatchObject({
			amount: 125,
			balanceAfter: 125,
			type: "opening_balance",
		});
	});
});
