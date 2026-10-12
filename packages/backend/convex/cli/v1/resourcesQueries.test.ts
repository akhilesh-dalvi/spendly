// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "cli-resource-owner" });
	const userId = await owner.mutation(api.users.create, {
		email: "owner@example.com",
	});
	const cycle = await owner.mutation(api.cycles.create, {
		name: "January",
		startDate: "2026-01-01",
		endDate: "2026-02-01",
	});
	return { test, owner, userId, cycle };
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
			name: "Travel",
			balanceNature: "asset",
			color: "#123456",
			icon: "wallet",
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
					userId,
					balanceNature: "asset",
					name: "Legacy",
					normalizedName: "legacy",
					order: 10,
					createdAt: 0,
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
					id: accountType._id,
					isArchived: true,
					color: "#123456",
					icon: "wallet",
				}),
				{
					id: legacyId,
					balanceNature: "asset",
					name: "Legacy",
					order: 10,
					createdAt: "1970-01-01T00:00:00.000Z",
					updatedAt: "1970-01-01T00:00:00.000Z",
					color: null,
					icon: null,
					isArchived: false,
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
			cycleId: cycle._id,
			name: "Typed",
			categoryTypeId: type._id,
			plannedAmount: 0,
			icon: "apple",
			order: 1,
			isHidden: true,
		});
		const legacyId = await test.run(
			async (ctx) =>
				await ctx.db.insert("categories", {
					userId,
					cycleId: cycle._id,
					name: "Legacy",
					order: 0,
					createdAt: 0,
				})
		);
		expect(
			await owner.query(api.cli.v1.resources.listCategories, {
				cycleId: cycle._id,
			})
		).toEqual([
			{
				id: legacyId,
				cycleId: cycle._id,
				name: "Legacy",
				order: 0,
				createdAt: "1970-01-01T00:00:00.000Z",
				categoryType: null,
				icon: null,
				isHidden: false,
				plannedAmount: null,
			},
			expect.objectContaining({
				id: typed?._id,
				categoryType: { id: type._id, name: "Plain", color: null },
				plannedAmount: 0,
				isHidden: true,
				icon: "apple",
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
		).toMatchObject({ id: cycle._id, endDateExclusive: "2026-02-01" });
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
			cycleId: cycle._id,
			name: "Food",
			plannedAmount: 100,
			categoryTypeId: type._id,
		});
		const zero = await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Zero",
			plannedAmount: 0,
			categoryTypeId: type._id,
		});
		await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Unplanned",
		});
		if (!(budgeted && zero)) {
			throw new Error("Expected categories");
		}
		await owner.mutation(api.expenses.create, {
			amount: 25,
			date: "2026-01-03",
			accountId: null,
			categoryId: budgeted._id,
		});
		await owner.mutation(api.expenses.create, {
			amount: 5,
			date: "2026-01-04",
			accountId: null,
			categoryId: budgeted._id,
		});
		await owner.mutation(api.expenses.create, {
			amount: 7,
			date: "2026-01-05",
			accountId: null,
		});
		const summary = await owner.query(api.cli.v1.resources.getSummary, {
			cycleId: cycle._id,
			today: "2026-02-01",
		});
		expect(summary).toMatchObject({
			totalSpent: 37,
			totalPlanned: 100,
			remaining: 63,
			daysRemaining: null,
		});
		expect(summary.categories).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "Food",
					spent: 30,
					difference: 70,
					progressPercent: 30,
				}),
				expect.objectContaining({
					name: "Zero",
					spent: 0,
					planned: 0,
					difference: 0,
					progressPercent: null,
				}),
				expect.objectContaining({
					name: "Unplanned",
					spent: 0,
					planned: null,
					difference: null,
					progressPercent: null,
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
					typeId: type._id,
					totalPlanned: 100,
					totalSpent: 30,
				}),
				expect.objectContaining({
					typeId: null,
					totalPlanned: 0,
					totalSpent: 7,
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
			for (let index = 0; index < 1001; index += 1) {
				await ctx.db.insert("tags", {
					userId,
					name: `Tag ${index}`,
					createdAt: 0,
				});
			}
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
