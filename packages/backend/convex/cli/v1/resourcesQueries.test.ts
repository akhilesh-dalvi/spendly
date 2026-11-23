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

describe("standalone CLI category creation", () => {
	it("previews without writing and replays a saved category through the same key", async () => {
		const { owner, cycle } = await setup();
		const type = await owner.mutation(api.categories.createType, {
			name: "Repairs",
		});
		if (!type) {
			throw new Error("Expected category type");
		}
		const [accountType] = await owner.query(api.cli.v1.accountTypes.list, {});
		const account = await owner.mutation(api.cli.v1.accounts.create, {
			accountTypeId: accountType.id,
			date: "2026-01-10",
			idempotencyKey: "category-test-account",
			name: "Synthetic wallet",
			startingBalance: 100,
		});
		const expense = await owner.mutation(api.expenses.create, {
			accountId: account.id,
			amount: 15,
			date: "2026-01-10",
			spentOn: "Test purchase",
		});
		const expenseBefore = await owner.query(api.expenses.get, {
			expenseId: expense._id,
		});
		const input = {
			categoryTypeId: type._id,
			cycleId: cycle._id,
			icon: "🔧",
			name: "  Bike repairs  ",
			plannedAmount: 0,
		};
		expect(
			await owner.query(api.cli.v1.resources.previewCategoryCreate, input)
		).toEqual({
			categoryType: { color: null, id: type._id, name: "Repairs" },
			cycleId: cycle._id,
			cycleName: "January",
			icon: "🔧",
			name: "Bike repairs",
			plannedAmount: 0,
		});
		expect(
			await owner.query(api.categories.list, { cycleId: cycle._id })
		).toEqual([]);

		const request = { ...input, idempotencyKey: "category-bike-001" };
		// Discard the first response, as a caller would after a lost reply.
		await owner.mutation(api.cli.v1.resources.createCategory, request);
		const [persisted] = await owner.query(api.categories.list, {
			cycleId: cycle._id,
		});
		const saved = await owner.mutation(
			api.cli.v1.resources.createCategory,
			request
		);
		expect(saved.id).toBe(persisted._id);
		await expect(
			owner.mutation(api.cli.v1.resources.createCategory, {
				...request,
				plannedAmount: 1,
			})
		).rejects.toMatchObject({ data: { code: "IDEMPOTENCY_CONFLICT" } });
		expect(
			await owner.query(api.cli.v1.resources.listCategories, {
				cycleId: cycle._id,
			})
		).toEqual([
			expect.objectContaining({
				id: saved.id,
				isHidden: false,
				name: "Bike repairs",
				plannedAmount: 0,
			}),
		]);
		expect(
			await owner.query(api.categories.get, { id: saved.id })
		).toMatchObject({
			categoryTypeId: type._id,
			cycleId: cycle._id,
			icon: "🔧",
			plannedAmount: 0,
		});
		expect(
			await owner.query(api.expenses.get, { expenseId: expense._id })
		).toEqual(expenseBefore);
		expect(
			await owner.query(api.cli.v1.accounts.get, { accountId: account.id })
		).toMatchObject({ currentBalance: 85 });
	});

	it.each([
		{ name: "   " },
		{ name: "control\ncharacter" },
		{ plannedAmount: -1 },
		{ plannedAmount: Number.POSITIVE_INFINITY },
		{ plannedAmount: Number.NaN },
		{ plannedAmount: 2 ** 46 },
		{ plannedAmount: 0.001 },
	])(
		"rejects invalid input %j on preview and commit without writing",
		async (invalid) => {
			const { owner, cycle } = await setup();
			const input = { cycleId: cycle._id, name: "Repairs", ...invalid };
			await expect(
				owner.query(api.cli.v1.resources.previewCategoryCreate, input)
			).rejects.toMatchObject({
				data: { code: "INVALID_INPUT" },
			});
			await expect(
				owner.mutation(api.cli.v1.resources.createCategory, {
					...input,
					idempotencyKey: "invalid-category",
				})
			).rejects.toMatchObject({
				data: { code: "INVALID_INPUT" },
			});
			expect(
				await owner.query(api.categories.list, { cycleId: cycle._id })
			).toEqual([]);
		}
	);

	it("checks auth, cycle ownership and type ownership, and rechecks a type removed after preview", async () => {
		const { owner, test, cycle } = await setup();
		const other = test.withIdentity({ subject: "category-stranger" });
		await other.mutation(api.users.create, { email: "stranger@example.com" });
		const [foreignType] = await other.query(api.categories.listTypes, {});
		const type = await owner.mutation(api.categories.createType, {
			name: "To remove",
		});
		if (!type) {
			throw new Error("Expected category type");
		}
		const input = { cycleId: cycle._id, name: "Repairs" };
		const commit = { ...input, idempotencyKey: "category-auth-key" };
		await expect(
			test.mutation(api.cli.v1.resources.createCategory, commit)
		).rejects.toMatchObject({ data: { code: "AUTHENTICATION_REQUIRED" } });
		await expect(
			other.mutation(api.cli.v1.resources.createCategory, commit)
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
		const foreignInput = { ...input, categoryTypeId: foreignType._id };
		await expect(
			owner.query(api.cli.v1.resources.previewCategoryCreate, foreignInput)
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
		await expect(
			owner.mutation(api.cli.v1.resources.createCategory, {
				...commit,
				...foreignInput,
			})
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
		await owner.query(api.cli.v1.resources.previewCategoryCreate, {
			...input,
			categoryTypeId: type._id,
		});
		await owner.mutation(api.categories.deleteType, { id: type._id });
		await expect(
			owner.mutation(api.cli.v1.resources.createCategory, {
				...commit,
				categoryTypeId: type._id,
			})
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
		expect(
			await owner.query(api.categories.list, { cycleId: cycle._id })
		).toEqual([]);
	});

	it("allows a separate create with the same name and keeps omitted plans unset", async () => {
		const { owner, cycle } = await setup();
		await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Repairs",
			order: 8,
		});
		const saved = await owner.mutation(api.cli.v1.resources.createCategory, {
			cycleId: cycle._id,
			idempotencyKey: "category-same-name",
			name: "Repairs",
		});
		expect(saved).toMatchObject({
			categoryType: null,
			icon: null,
			isHidden: false,
			order: 9,
			plannedAmount: null,
		});
		expect(
			await owner.query(api.categories.get, { id: saved.id })
		).not.toHaveProperty("plannedAmount");
		expect(
			await owner.query(api.cli.v1.resources.listCategories, {
				cycleId: cycle._id,
			})
		).toHaveLength(2);
	});
});

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
