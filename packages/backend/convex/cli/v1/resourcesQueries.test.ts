// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { forEachSequential } from "../../lib/async";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "cli-resource-owner" });
	const userId = await owner.mutation(api.users.create, {
		email: "owner@example.com",
	});
	const cycle = await owner.mutation(api.cycles.create, {
		endDate: "2026-02-01",
		name: "January",
		startDate: "2026-01-01",
	});
	return { cycle, owner, test, userId };
};

describe("CLI identity and resource queries", () => {
	it("distinguishes unauthenticated, authenticated-unregistered, and registered identities", async () => {
		const { test, owner, userId } = await setup();
		await expect(test.query(api.cli.v1.auth.identity, {})).rejects.toThrow(
			"UNAUTHENTICATED"
		);
		const unregistered = test.withIdentity({ subject: "not-registered" });
		expect(await unregistered.query(api.cli.v1.auth.identity, {})).toEqual({
			authenticated: true,
			backendUserId: null,
			currency: null,
			identitySubject: "not-registered",
			subjectMatchesBackendUser: false,
		});
		expect(await owner.query(api.cli.v1.auth.identity, {})).toEqual({
			authenticated: true,
			backendUserId: userId,
			currency: "USD",
			identitySubject: "cli-resource-owner",
			subjectMatchesBackendUser: true,
		});
	});

	it("lists account types in order, hides archived types by default, and presents legacy metadata", async () => {
		const { test, owner, userId } = await setup();
		const accountType = await owner.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			color: "#123456",
			icon: "wallet",
			name: "Travel",
		});
		expect(
			await owner.query(api.accountTypes.getUsage, {
				accountTypeId: accountType._id,
			})
		).toEqual({ accountCount: 0, canDelete: true, hasMoreAccounts: false });
		await owner.mutation(api.accountTypes.archive, {
			accountTypeId: accountType._id,
			isArchived: true,
		});
		const legacyId = await test.run(
			async (ctx) =>
				await ctx.db.insert("account_types", {
					balanceNature: "asset",
					createdAt: 0,
					name: "Legacy",
					normalizedName: "legacy",
					order: 10,
					userId,
				})
		);
		expect(
			(await owner.query(api.cli.v1.accountTypes.list, {})).map(
				(type) => type.id
			)
		).not.toContain(accountType._id);
		const all = await owner.query(api.cli.v1.accountTypes.list, {
			includeArchived: true,
		});
		expect(all).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					color: "#123456",
					icon: "wallet",
					id: accountType._id,
					isArchived: true,
				}),
				{
					balanceNature: "asset",
					color: null,
					createdAt: "1970-01-01T00:00:00.000Z",
					icon: null,
					id: legacyId,
					isArchived: false,
					name: "Legacy",
					order: 10,
					updatedAt: "1970-01-01T00:00:00.000Z",
				},
			])
		);
		expect(all.map((type) => type.order)).toEqual(
			[...all.map((type) => type.order)].sort((a, b) => a - b)
		);
	});

	it("presents typed and untyped categories and alphabetically sorted tags", async () => {
		const { test, owner, userId, cycle } = await setup();
		const type = await owner.mutation(api.categories.createType, {
			name: "Plain",
		});
		if (!type) {
			throw new Error("Expected type");
		}
		const typed = await owner.mutation(api.categories.create, {
			categoryTypeId: type._id,
			cycleId: cycle._id,
			icon: "apple",
			isHidden: true,
			name: "Typed",
			order: 1,
			plannedAmount: 0,
		});
		const legacyId = await test.run(
			async (ctx) =>
				await ctx.db.insert("categories", {
					createdAt: 0,
					cycleId: cycle._id,
					name: "Legacy",
					order: 0,
					userId,
				})
		);
		expect(
			await owner.query(api.cli.v1.resources.listCategories, {
				cycleId: cycle._id,
			})
		).toEqual([
			{
				categoryType: null,
				createdAt: "1970-01-01T00:00:00.000Z",
				cycleId: cycle._id,
				icon: null,
				id: legacyId,
				isHidden: false,
				name: "Legacy",
				order: 0,
				plannedAmount: null,
			},
			expect.objectContaining({
				categoryType: { color: null, id: type._id, name: "Plain" },
				icon: "apple",
				id: typed?._id,
				isHidden: true,
				plannedAmount: 0,
			}),
		]);
		await owner.mutation(api.tags.create, { name: "Zulu" });
		await owner.mutation(api.tags.create, { name: "Alpha" });
		expect(
			(await owner.query(api.cli.v1.resources.listTags, {})).map(
				(tag) => tag.name
			)
		).toEqual(["Alpha", "Zulu"]);
		expect(
			await owner.query(api.cli.v1.resources.getCurrentCycle, {
				date: "2026-01-01",
			})
		).toMatchObject({ endDateExclusive: "2026-02-01", id: cycle._id });
		expect(
			await owner.query(api.cli.v1.resources.getCurrentCycle, {
				date: "2026-02-01",
			})
		).toBeNull();
	});

	it("summarizes uncategorized spending, missing and zero budgets, and ended cycles", async () => {
		const { owner, cycle } = await setup();
		const [type] = await owner.query(api.categories.listTypes, {});
		if (!type) {
			throw new Error("Expected type");
		}
		const budgeted = await owner.mutation(api.categories.create, {
			categoryTypeId: type._id,
			cycleId: cycle._id,
			name: "Food",
			plannedAmount: 100,
		});
		const zero = await owner.mutation(api.categories.create, {
			categoryTypeId: type._id,
			cycleId: cycle._id,
			name: "Zero",
			plannedAmount: 0,
		});
		await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Unplanned",
		});
		if (!(budgeted && zero)) {
			throw new Error("Expected categories");
		}
		await owner.mutation(api.expenses.create, {
			accountId: null,
			amount: 25,
			categoryId: budgeted._id,
			date: "2026-01-03",
		});
		await owner.mutation(api.expenses.create, {
			accountId: null,
			amount: 5,
			categoryId: budgeted._id,
			date: "2026-01-04",
		});
		await owner.mutation(api.expenses.create, {
			accountId: null,
			amount: 7,
			date: "2026-01-05",
		});
		const summary = await owner.query(api.cli.v1.resources.getSummary, {
			cycleId: cycle._id,
			today: "2026-02-01",
		});
		expect(summary).toMatchObject({
			daysRemaining: null,
			remaining: 63,
			totalPlanned: 100,
			totalSpent: 37,
		});
		expect(summary.categories).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					difference: 70,
					name: "Food",
					progressPercent: 30,
					spent: 30,
				}),
				expect.objectContaining({
					difference: 0,
					name: "Zero",
					planned: 0,
					progressPercent: null,
					spent: 0,
				}),
				expect.objectContaining({
					difference: null,
					name: "Unplanned",
					planned: null,
					progressPercent: null,
					spent: 0,
				}),
				expect.objectContaining({
					categoryId: null,
					name: "Uncategorized",
					spent: 7,
				}),
			])
		);
		expect(summary.types).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					totalPlanned: 100,
					totalSpent: 30,
					typeId: type._id,
				}),
				expect.objectContaining({
					totalPlanned: 0,
					totalSpent: 7,
					typeId: null,
				}),
			])
		);
		expect(
			await owner.query(api.cli.v1.resources.getSummary, {
				cycleId: cycle._id,
				today: "2026-01-31",
			})
		).toMatchObject({ daysRemaining: 1 });
	});

	it("returns stable public errors for authentication, setup, ownership, and invalid dates", async () => {
		const { test, owner, cycle } = await setup();
		await expect(
			test.query(api.cli.v1.resources.listTags, {})
		).rejects.toMatchObject({
			data: {
				code: "AUTHENTICATION_REQUIRED",
				details: {},
				message: "Authentication is required",
				retryable: false,
			},
		});
		await expect(
			test
				.withIdentity({ subject: "unregistered" })
				.query(api.cli.v1.accountTypes.list, {})
		).rejects.toMatchObject({
			data: { code: "ACCOUNT_SETUP_REQUIRED", retryable: false },
		});
		const stranger = test.withIdentity({ subject: "stranger" });
		await stranger.mutation(api.users.create, {
			email: "stranger@example.com",
		});
		await expect(
			stranger.query(api.cli.v1.resources.listCategories, {
				cycleId: cycle._id,
			})
		).rejects.toMatchObject({
			data: { code: "RESOURCE_NOT_FOUND", retryable: false },
		});
		await expect(
			owner.query(api.cli.v1.resources.getCurrentCycle, { date: "2026-02-30" })
		).rejects.toMatchObject({
			data: { code: "INVALID_INPUT", retryable: false },
		});
	});

	it("fails safely instead of returning truncated tags beyond the resource limit", async () => {
		const { test, owner, userId } = await setup();
		await test.run(async (ctx) => {
			await forEachSequential(
				Array.from({ length: 1001 }, (_, index) => index),
				async (index) => {
					await ctx.db.insert("tags", {
						createdAt: 0,
						name: `Tag ${index}`,
						userId,
					});
				}
			);
		});
		await expect(
			owner.query(api.cli.v1.resources.listTags, {})
		).rejects.toMatchObject({
			data: {
				code: "RESOURCE_LIMIT_EXCEEDED",
				message: "The requested summary is too large to calculate safely",
				retryable: false,
			},
		});
	});
});
