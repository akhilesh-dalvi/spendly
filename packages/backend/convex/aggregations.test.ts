import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const createBackendTest = () => convexTest(schema, modules);
type BackendTest = ReturnType<typeof createBackendTest>;
type ReportClient = Pick<BackendTest, "query">;

type CategoryFixture = Pick<
	Doc<"categories">,
	"name" | "plannedAmount" | "categoryTypeId" | "icon" | "isHidden"
> & { amounts?: number[]; accountId?: Id<"accounts"> };

const createAuthenticatedUser = async (test: BackendTest, subject: string) => {
	const client = test.withIdentity({
		email: `${subject}@example.com`,
		subject,
	});
	const userId = await client.mutation(api.users.create, {
		email: `${subject}@example.com`,
		name: subject,
	});
	return { client, userId };
};

const seedCycle = async (
	test: BackendTest,
	userId: Id<"users">,
	options: {
		name?: string;
		startDate?: string;
		endDate?: string;
		categories?: CategoryFixture[];
		uncategorizedAmounts?: number[];
	} = {}
) =>
	await test.run(async (ctx) => {
		const startDate = options.startDate ?? "2026-09-01";
		const cycleId = await ctx.db.insert("expense_cycles", {
			createdAt: 1,
			endDate: options.endDate ?? "2026-10-01",
			name: options.name ?? "September",
			startDate,
			userId,
		});
		const categoryIds: Id<"categories">[] = [];
		for (const [order, category] of (options.categories ?? []).entries()) {
			const { amounts = [], accountId, ...fields } = category;
			const categoryId = await ctx.db.insert("categories", {
				...fields,
				createdAt: 1,
				cycleId,
				order,
				userId,
			});
			categoryIds.push(categoryId);
			for (const amount of amounts) {
				await ctx.db.insert("expenses", {
					accountId,
					amount,
					categoryId,
					createdAt: 1,
					cycleId,
					date: startDate,
					userId,
				});
			}
		}
		for (const amount of options.uncategorizedAmounts ?? []) {
			await ctx.db.insert("expenses", {
				amount,
				createdAt: 1,
				cycleId,
				date: startDate,
				userId,
			});
		}
		return { categoryIds, cycleId };
	});

const reports = [
	{
		name: "cycle summary",
		query: (client: ReportClient, cycleId: Id<"expense_cycles">) =>
			client.query(api.aggregations.getCycleSummary, { cycleId }),
	},
	{
		name: "historical category stats",
		query: (client: ReportClient, cycleId: Id<"expense_cycles">) =>
			client.query(api.aggregations.getHistoricalCategoryStats, {
				currentCycleId: cycleId,
			}),
	},
	{
		name: "cycle comparison",
		query: (client: ReportClient, cycleId: Id<"expense_cycles">) =>
			client.query(api.aggregations.compareMultiple, {
				cycleIds: [cycleId, cycleId],
			}),
	},
];

afterEach(() => {
	vi.useRealTimers();
});

describe("aggregation authentication and ownership", () => {
	it.each(reports)("requires a provisioned user for $name", async ({
		query,
	}) => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "auth-owner");
		const { cycleId } = await seedCycle(test, owner.userId);

		await expect(query(test, cycleId)).rejects.toThrow("UNAUTHENTICATED");
		await expect(
			query(test.withIdentity({ subject: "unprovisioned" }), cycleId)
		).rejects.toThrow("User not found");
	});

	it("denies foreign and missing cycles without exposing report data", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "owner");
		const other = await createAuthenticatedUser(test, "other");
		const foreign = await seedCycle(test, other.userId, {
			uncategorizedAmounts: [999],
		});
		const missing = await seedCycle(test, owner.userId);
		await test.run(async (ctx) => {
			await ctx.db.delete(missing.cycleId);
		});
		const own = await seedCycle(test, owner.userId);

		for (const cycleId of [foreign.cycleId, missing.cycleId]) {
			await expect(
				owner.client.query(api.aggregations.getCycleSummary, { cycleId })
			).rejects.toThrow("UNAUTHORIZED");
			expect(
				await owner.client.query(api.aggregations.getHistoricalCategoryStats, {
					currentCycleId: cycleId,
				})
			).toBeNull();
			await expect(
				owner.client.query(api.aggregations.compareMultiple, {
					cycleIds: [own.cycleId, cycleId],
				})
			).rejects.toThrow("not found or access denied");
		}
	});
});

describe("cycle summary", () => {
	it("groups spending and plans by category and type, including hidden and uncategorized spending", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "summary");
		const types = await owner.client.query(api.categories.listTypes, {});
		const needs = types.find((type) => type.name === "Needs");
		const wants = types.find((type) => type.name === "Wants");
		const [accountType] = await owner.client.query(api.accountTypes.list, {});
		if (!(needs && wants && accountType)) {
			throw new Error("Expected default category and account types");
		}
		const accountIds = await test.run(async (ctx) => {
			const ids: Id<"accounts">[] = [];
			for (const isArchived of [false, true]) {
				ids.push(
					await ctx.db.insert("accounts", {
						accountTypeId: accountType._id,
						createdAt: 1,
						currentBalance: 1000,
						isArchived,
						name: isArchived ? "Archived" : "Active",
						startingBalance: 1000,
						userId: owner.userId,
					})
				);
			}
			return ids;
		});
		const { cycleId, categoryIds } = await seedCycle(test, owner.userId, {
			categories: [
				{
					name: "Food",
					plannedAmount: 100,
					categoryTypeId: needs._id,
					icon: "🍴",
					amounts: [20, 30],
					accountId: accountIds[0],
				},
				{
					name: "Rent",
					plannedAmount: 50,
					categoryTypeId: needs._id,
					isHidden: true,
					amounts: [70],
					accountId: accountIds[1],
				},
				{ name: "Snacks", amounts: [5] },
				{ name: "Spare", plannedAmount: 0, amounts: [3] },
				{ name: "Fun", plannedAmount: 25, categoryTypeId: wants._id },
			],
			uncategorizedAmounts: [7, 8],
		});
		await seedCycle(test, owner.userId, { uncategorizedAmounts: [500] });
		const other = await createAuthenticatedUser(test, "summary-other");
		await seedCycle(test, other.userId, { uncategorizedAmounts: [900] });
		await test.run(async (ctx) => {
			await ctx.db.insert("expenses", {
				amount: 400,
				createdAt: 1,
				date: "2026-09-01",
				userId: owner.userId,
			});
		});

		const summary = await owner.client.query(api.aggregations.getCycleSummary, {
			cycleId,
		});

		expect(summary).toMatchObject({
			cycleId,
			cycleName: "September",
			startDate: "2026-09-01",
			endDate: "2026-10-01",
			totalSpent: 143,
			totalPlanned: 175,
			remaining: 32,
		});
		expect(summary.categoryStats).toEqual([
			{
				categoryId: categoryIds[0],
				name: "Food",
				icon: "🍴",
				typeId: needs._id,
				typeName: "Needs",
				typeColor: "#3b82f6",
				planned: 100,
				spent: 50,
				isHidden: false,
				diff: 50,
				progress: 50,
			},
			{
				categoryId: categoryIds[1],
				name: "Rent",
				icon: null,
				typeId: needs._id,
				typeName: "Needs",
				typeColor: "#3b82f6",
				planned: 50,
				spent: 70,
				isHidden: true,
				diff: -20,
				progress: 140,
			},
			{
				categoryId: categoryIds[2],
				name: "Snacks",
				icon: null,
				typeId: null,
				typeName: null,
				typeColor: null,
				planned: null,
				spent: 5,
				isHidden: false,
				diff: null,
				progress: null,
			},
			{
				categoryId: categoryIds[3],
				name: "Spare",
				icon: null,
				typeId: null,
				typeName: null,
				typeColor: null,
				planned: 0,
				spent: 3,
				isHidden: false,
				diff: -3,
				progress: null,
			},
			{
				categoryId: categoryIds[4],
				name: "Fun",
				icon: null,
				typeId: wants._id,
				typeName: "Wants",
				typeColor: "#f59e0b",
				planned: 25,
				spent: 0,
				isHidden: false,
				diff: 25,
				progress: 0,
			},
			{
				categoryId: "uncategorized",
				name: "Uncategorized",
				icon: "❓",
				typeId: null,
				typeName: "Uncategorized",
				typeColor: null,
				planned: null,
				spent: 15,
				isHidden: false,
				diff: null,
				progress: null,
			},
		]);
		expect(summary.typeStats).toMatchObject([
			{
				typeId: needs._id,
				typeName: "Needs",
				typeColor: "#3b82f6",
				totalPlanned: 150,
				totalSpent: 120,
				categories: [summary.categoryStats[0], summary.categoryStats[1]],
			},
			{
				typeId: wants._id,
				totalPlanned: 25,
				totalSpent: 0,
				categories: [summary.categoryStats[4]],
			},
			{ typeName: "Savings", totalPlanned: 0, totalSpent: 0, categories: [] },
			{
				typeId: null,
				typeName: "Uncategorized",
				typeColor: null,
				totalPlanned: 0,
				totalSpent: 23,
				categories: [
					summary.categoryStats[2],
					summary.categoryStats[3],
					summary.categoryStats[5],
				],
			},
		]);
	});

	it("returns zero totals and empty groupings for an empty cycle", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "empty");
		const { cycleId } = await seedCycle(test, owner.userId);

		const summary = await owner.client.query(api.aggregations.getCycleSummary, {
			cycleId,
		});

		expect(summary).toMatchObject({
			totalSpent: 0,
			totalPlanned: 0,
			remaining: 0,
			categoryStats: [],
		});
		expect(summary.typeStats).toHaveLength(4);
		for (const type of summary.typeStats) {
			expect(type).toMatchObject({
				totalSpent: 0,
				totalPlanned: 0,
				categories: [],
			});
		}
	});

	it.each([
		{ endDate: "2026-09-18", daysRemaining: 2 },
		{ endDate: "2026-09-16", daysRemaining: null },
		{ endDate: "2026-09-15", daysRemaining: null },
	])("uses UTC today for days remaining when the cycle ends $endDate", async ({
		endDate,
		daysRemaining,
	}) => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-09-15T23:30:00-07:00"));
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "days");
		const { cycleId } = await seedCycle(test, owner.userId, { endDate });

		const summary = await owner.client.query(api.aggregations.getCycleSummary, {
			cycleId,
		});

		expect(summary.daysRemaining).toBe(daysRemaining);
	});
});

describe("historical category stats", () => {
	it("selects the owner's nearest earlier cycle by start date and totals categories by name", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "history");
		const current = await seedCycle(test, owner.userId, {
			categories: [{ name: "Food", amounts: [1000] }],
		});
		await seedCycle(test, owner.userId, {
			name: "August",
			startDate: "2026-08-01",
			endDate: "2026-09-01",
			categories: [
				{ name: "Food", amounts: [10, 15] },
				{ name: "Hidden", isHidden: true, amounts: [7] },
				{ name: "Unused" },
			],
			uncategorizedAmounts: [30],
		});
		await seedCycle(test, owner.userId, {
			name: "July",
			startDate: "2026-07-01",
			endDate: "2026-08-01",
			categories: [{ name: "Food", amounts: [999] }],
		});
		await seedCycle(test, owner.userId, {
			name: "October",
			startDate: "2026-10-01",
			endDate: "2026-11-01",
			categories: [{ name: "Food", amounts: [888] }],
		});
		const other = await createAuthenticatedUser(test, "history-other");
		await seedCycle(test, other.userId, {
			startDate: "2026-08-31",
			categories: [{ name: "Food", amounts: [777] }],
		});

		expect(
			await owner.client.query(api.aggregations.getHistoricalCategoryStats, {
				currentCycleId: current.cycleId,
			})
		).toEqual({
			cycleName: "August",
			stats: { Food: 25, Hidden: 7, Unused: 0 },
		});
	});

	it("distinguishes no previous cycle from an empty previous cycle", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "empty-history");
		const current = await seedCycle(test, owner.userId);

		expect(
			await owner.client.query(api.aggregations.getHistoricalCategoryStats, {
				currentCycleId: current.cycleId,
			})
		).toBeNull();
		await seedCycle(test, owner.userId, {
			name: "Empty August",
			startDate: "2026-08-01",
			endDate: "2026-09-01",
		});
		expect(
			await owner.client.query(api.aggregations.getHistoricalCategoryStats, {
				currentCycleId: current.cycleId,
			})
		).toEqual({ cycleName: "Empty August", stats: {} });
	});
});

describe("multi-cycle comparison", () => {
	it("preserves requested order and separates category breakdowns from uncategorized totals", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "compare");
		const populated = await seedCycle(test, owner.userId, {
			categories: [
				{ name: "Food", plannedAmount: 100, amounts: [15, 25] },
				{ name: "Hidden", isHidden: true, plannedAmount: 0, amounts: [5] },
				{ name: "Unplanned" },
			],
			uncategorizedAmounts: [10],
		});
		const empty = await seedCycle(test, owner.userId, {
			name: "October",
			startDate: "2026-10-01",
			endDate: "2026-11-01",
		});

		expect(
			await owner.client.query(api.aggregations.compareMultiple, {
				cycleIds: [empty.cycleId, populated.cycleId],
			})
		).toEqual([
			{
				cycleId: empty.cycleId,
				cycleName: "October",
				startDate: "2026-10-01",
				endDate: "2026-11-01",
				totalSpent: 0,
				totalPlanned: 0,
				categoryBreakdown: [],
			},
			{
				cycleId: populated.cycleId,
				cycleName: "September",
				startDate: "2026-09-01",
				endDate: "2026-10-01",
				totalSpent: 55,
				totalPlanned: 100,
				categoryBreakdown: [
					{ categoryName: "Food", spent: 40, planned: 100 },
					{ categoryName: "Hidden", spent: 5, planned: 0 },
					{ categoryName: "Unplanned", spent: 0, planned: null },
				],
			},
		]);
	});

	it("accepts five cycles and rejects selections outside the two-to-five range", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "comparison-limits");
		const cycleIds: Id<"expense_cycles">[] = [];
		for (const name of ["One", "Two", "Three", "Four", "Five", "Six"]) {
			const { cycleId } = await seedCycle(test, owner.userId, { name });
			cycleIds.push(cycleId);
		}

		const comparison = await owner.client.query(
			api.aggregations.compareMultiple,
			{ cycleIds: cycleIds.slice(0, 5) }
		);
		expect(comparison.map((cycle) => cycle.cycleName)).toEqual([
			"One",
			"Two",
			"Three",
			"Four",
			"Five",
		]);
		for (const selection of [[], cycleIds.slice(0, 1), cycleIds]) {
			await expect(
				owner.client.query(api.aggregations.compareMultiple, {
					cycleIds: selection,
				})
			).rejects.toThrow("Select between 2 and 5 cycles for comparison");
		}
	});
});
