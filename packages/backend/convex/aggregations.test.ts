import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { forEachSequential } from "./lib/async";
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
		await forEachSequential(
			(options.categories ?? []).entries(),
			async ([order, category]) => {
				const { amounts = [], accountId, ...fields } = category;
				const categoryId = await ctx.db.insert("categories", {
					...fields,
					createdAt: 1,
					cycleId,
					order,
					userId,
				});
				categoryIds.push(categoryId);
				await forEachSequential(amounts, async (amount) => {
					await ctx.db.insert("expenses", {
						accountId,
						amount,
						categoryId,
						createdAt: 1,
						cycleId,
						date: startDate,
						userId,
					});
				});
			}
		);
		await forEachSequential(
			options.uncategorizedAmounts ?? [],
			async (amount) => {
				await ctx.db.insert("expenses", {
					amount,
					createdAt: 1,
					cycleId,
					date: startDate,
					userId,
				});
			}
		);
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
	it.each(reports)(
		"requires a provisioned user for $name",
		async ({ query }) => {
			const test = createBackendTest();
			const owner = await createAuthenticatedUser(test, "auth-owner");
			const { cycleId } = await seedCycle(test, owner.userId);

			await expect(query(test, cycleId)).rejects.toThrow("UNAUTHENTICATED");
			await expect(
				query(test.withIdentity({ subject: "unprovisioned" }), cycleId)
			).rejects.toThrow("User not found");
		}
	);

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

		await forEachSequential(
			[foreign.cycleId, missing.cycleId],
			async (cycleId) => {
				await expect(
					owner.client.query(api.aggregations.getCycleSummary, { cycleId })
				).rejects.toThrow("UNAUTHORIZED");
				expect(
					await owner.client.query(
						api.aggregations.getHistoricalCategoryStats,
						{
							currentCycleId: cycleId,
						}
					)
				).toBeNull();
				await expect(
					owner.client.query(api.aggregations.compareMultiple, {
						cycleIds: [own.cycleId, cycleId],
					})
				).rejects.toThrow("not found or access denied");
			}
		);
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
			await forEachSequential([false, true], async (isArchived) => {
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
			});
			return ids;
		});
		const { cycleId, categoryIds } = await seedCycle(test, owner.userId, {
			categories: [
				{
					accountId: accountIds[0],
					amounts: [20, 30],
					categoryTypeId: needs._id,
					icon: "🍴",
					name: "Food",
					plannedAmount: 100,
				},
				{
					accountId: accountIds[1],
					amounts: [70],
					categoryTypeId: needs._id,
					isHidden: true,
					name: "Rent",
					plannedAmount: 50,
				},
				{ amounts: [5], name: "Snacks" },
				{ amounts: [3], name: "Spare", plannedAmount: 0 },
				{ categoryTypeId: wants._id, name: "Fun", plannedAmount: 25 },
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
			endDate: "2026-10-01",
			remaining: 32,
			startDate: "2026-09-01",
			totalPlanned: 175,
			totalSpent: 143,
		});
		expect(summary.categoryStats).toEqual([
			{
				categoryId: categoryIds[0],
				diff: 50,
				icon: "🍴",
				isHidden: false,
				name: "Food",
				planned: 100,
				progress: 50,
				spent: 50,
				typeColor: "#3b82f6",
				typeId: needs._id,
				typeName: "Needs",
			},
			{
				categoryId: categoryIds[1],
				diff: -20,
				icon: null,
				isHidden: true,
				name: "Rent",
				planned: 50,
				progress: 140,
				spent: 70,
				typeColor: "#3b82f6",
				typeId: needs._id,
				typeName: "Needs",
			},
			{
				categoryId: categoryIds[2],
				diff: null,
				icon: null,
				isHidden: false,
				name: "Snacks",
				planned: null,
				progress: null,
				spent: 5,
				typeColor: null,
				typeId: null,
				typeName: null,
			},
			{
				categoryId: categoryIds[3],
				diff: -3,
				icon: null,
				isHidden: false,
				name: "Spare",
				planned: 0,
				progress: null,
				spent: 3,
				typeColor: null,
				typeId: null,
				typeName: null,
			},
			{
				categoryId: categoryIds[4],
				diff: 25,
				icon: null,
				isHidden: false,
				name: "Fun",
				planned: 25,
				progress: 0,
				spent: 0,
				typeColor: "#f59e0b",
				typeId: wants._id,
				typeName: "Wants",
			},
			{
				categoryId: "uncategorized",
				diff: null,
				icon: "❓",
				isHidden: false,
				name: "Uncategorized",
				planned: null,
				progress: null,
				spent: 15,
				typeColor: null,
				typeId: null,
				typeName: "Uncategorized",
			},
		]);
		expect(summary.typeStats).toMatchObject([
			{
				categories: [summary.categoryStats[0], summary.categoryStats[1]],
				totalPlanned: 150,
				totalSpent: 120,
				typeColor: "#3b82f6",
				typeId: needs._id,
				typeName: "Needs",
			},
			{
				categories: [summary.categoryStats[4]],
				totalPlanned: 25,
				totalSpent: 0,
				typeId: wants._id,
			},
			{ categories: [], totalPlanned: 0, totalSpent: 0, typeName: "Savings" },
			{
				categories: [
					summary.categoryStats[2],
					summary.categoryStats[3],
					summary.categoryStats[5],
				],
				totalPlanned: 0,
				totalSpent: 23,
				typeColor: null,
				typeId: null,
				typeName: "Uncategorized",
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
			categoryStats: [],
			remaining: 0,
			totalPlanned: 0,
			totalSpent: 0,
		});
		expect(summary.typeStats).toHaveLength(4);
		for (const type of summary.typeStats) {
			expect(type).toMatchObject({
				categories: [],
				totalPlanned: 0,
				totalSpent: 0,
			});
		}
	});

	it.each([
		{ daysRemaining: 2, endDate: "2026-09-18" },
		{ daysRemaining: null, endDate: "2026-09-16" },
		{ daysRemaining: null, endDate: "2026-09-15" },
	])(
		"uses UTC today for days remaining when the cycle ends $endDate",
		async ({ endDate, daysRemaining }) => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2026-09-15T23:30:00-07:00"));
			const test = createBackendTest();
			const owner = await createAuthenticatedUser(test, "days");
			const { cycleId } = await seedCycle(test, owner.userId, { endDate });

			const summary = await owner.client.query(
				api.aggregations.getCycleSummary,
				{
					cycleId,
				}
			);

			expect(summary.daysRemaining).toBe(daysRemaining);
		}
	);
});

describe("historical category stats", () => {
	it("selects the owner's nearest earlier cycle by start date and totals categories by name", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "history");
		const current = await seedCycle(test, owner.userId, {
			categories: [{ amounts: [1000], name: "Food" }],
		});
		await seedCycle(test, owner.userId, {
			categories: [
				{ amounts: [10, 15], name: "Food" },
				{ amounts: [7], isHidden: true, name: "Hidden" },
				{ name: "Unused" },
			],
			endDate: "2026-09-01",
			name: "August",
			startDate: "2026-08-01",
			uncategorizedAmounts: [30],
		});
		await seedCycle(test, owner.userId, {
			categories: [{ amounts: [999], name: "Food" }],
			endDate: "2026-08-01",
			name: "July",
			startDate: "2026-07-01",
		});
		await seedCycle(test, owner.userId, {
			categories: [{ amounts: [888], name: "Food" }],
			endDate: "2026-11-01",
			name: "October",
			startDate: "2026-10-01",
		});
		const other = await createAuthenticatedUser(test, "history-other");
		await seedCycle(test, other.userId, {
			categories: [{ amounts: [777], name: "Food" }],
			startDate: "2026-08-31",
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
			endDate: "2026-09-01",
			name: "Empty August",
			startDate: "2026-08-01",
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
				{ amounts: [15, 25], name: "Food", plannedAmount: 100 },
				{ amounts: [5], isHidden: true, name: "Hidden", plannedAmount: 0 },
				{ name: "Unplanned" },
			],
			uncategorizedAmounts: [10],
		});
		const empty = await seedCycle(test, owner.userId, {
			endDate: "2026-11-01",
			name: "October",
			startDate: "2026-10-01",
		});

		expect(
			await owner.client.query(api.aggregations.compareMultiple, {
				cycleIds: [empty.cycleId, populated.cycleId],
			})
		).toEqual([
			{
				categoryBreakdown: [],
				cycleId: empty.cycleId,
				cycleName: "October",
				endDate: "2026-11-01",
				startDate: "2026-10-01",
				totalPlanned: 0,
				totalSpent: 0,
			},
			{
				categoryBreakdown: [
					{ categoryName: "Food", planned: 100, spent: 40 },
					{ categoryName: "Hidden", planned: 0, spent: 5 },
					{ categoryName: "Unplanned", planned: null, spent: 0 },
				],
				cycleId: populated.cycleId,
				cycleName: "September",
				endDate: "2026-10-01",
				startDate: "2026-09-01",
				totalPlanned: 100,
				totalSpent: 55,
			},
		]);
	});

	it("accepts five cycles and rejects selections outside the two-to-five range", async () => {
		const test = createBackendTest();
		const owner = await createAuthenticatedUser(test, "comparison-limits");
		const cycleIds: Id<"expense_cycles">[] = [];
		await forEachSequential(
			["One", "Two", "Three", "Four", "Five", "Six"],
			async (name) => {
				const { cycleId } = await seedCycle(test, owner.userId, { name });
				cycleIds.push(cycleId);
			}
		);

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
		await forEachSequential(
			[[], cycleIds.slice(0, 1), cycleIds],
			async (selection) => {
				await expect(
					owner.client.query(api.aggregations.compareMultiple, {
						cycleIds: selection,
					})
				).rejects.toThrow("Select between 2 and 5 cycles for comparison");
			}
		);
	});
});
