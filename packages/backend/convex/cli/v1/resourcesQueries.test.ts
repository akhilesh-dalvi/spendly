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

describe("standalone CLI category editing", () => {
	const editFixture = async () => {
		const fixture = await setup();
		const { cycle, owner } = fixture;
		const [type, replacement] = await owner.query(api.categories.listTypes, {});
		const category = await owner.mutation(api.categories.create, {
			categoryTypeId: type._id,
			cycleId: cycle._id,
			icon: "🚲",
			isHidden: true,
			name: "Repairs",
			order: 4,
			plannedAmount: 100,
		});
		if (!category) {
			throw new Error("Expected category");
		}
		return {
			...fixture,
			category,
			categoryId: category._id,
			replacement,
			type,
		};
	};

	it("previews and edits the same category, retaining omitted fields and financial links", async () => {
		const { category, categoryId, cycle, owner, replacement, type } =
			await editFixture();
		const [accountType] = await owner.query(api.cli.v1.accountTypes.list, {});
		const account = await owner.mutation(api.cli.v1.accounts.create, {
			accountTypeId: accountType.id,
			date: "2026-01-10",
			idempotencyKey: "edit-test-account",
			name: "Synthetic wallet",
			startingBalance: 100,
		});
		const expense = await owner.mutation(api.expenses.create, {
			accountId: account.id,
			amount: 15,
			categoryId,
			date: "2026-01-10",
		});
		const expenseArgs = { expenseId: expense._id };
		const accountArgs = { accountId: account.id };
		const expenseBefore = await owner.query(api.expenses.get, expenseArgs);
		const ledgerBefore = await owner.query(
			api.cli.v1.accounts.listTransactions,
			accountArgs
		);
		const cycleBefore = await owner.query(api.cli.v1.cycles.get, {
			cycleId: cycle._id,
		});
		const edit = { categoryId, icon: " 🔧 ", name: " Bike repairs " };
		const preview = await owner.query(
			api.cli.v1.resources.previewCategoryEdit,
			edit
		);
		expect(preview).toMatchObject({
			after: {
				categoryType: { id: type._id },
				icon: "🔧",
				id: categoryId,
				name: "Bike repairs",
				plannedAmount: 100,
			},
			before: { icon: "🚲", id: categoryId, name: "Repairs" },
			cycleName: cycle.name,
		});
		expect(await owner.query(api.categories.get, { id: categoryId })).toEqual(
			category
		);
		const saved = await owner.mutation(api.cli.v1.resources.editCategory, {
			...edit,
			expectedEditSnapshot: preview.editSnapshot,
			idempotencyKey: "rename-category",
		});
		expect(saved).toEqual(preview.after);

		const editAndSave = async (
			input: { categoryTypeId: string | null; plannedAmount: number | null },
			key: string
		) => {
			const args = { categoryId, ...input };
			const { editSnapshot } = await owner.query(
				api.cli.v1.resources.previewCategoryEdit,
				args
			);
			return await owner.mutation(api.cli.v1.resources.editCategory, {
				...args,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: key,
			});
		};
		const getSummary = async () =>
			await owner.query(api.cli.v1.resources.getSummary, {
				cycleId: cycle._id,
				today: "2026-01-10",
			});
		expect(
			await editAndSave(
				{ categoryTypeId: replacement._id, plannedAmount: 0 },
				"zero-category-plan"
			)
		).toMatchObject({
			categoryType: { id: replacement._id },
			plannedAmount: 0,
		});
		expect(await getSummary()).toMatchObject({
			categories: [
				expect.objectContaining({
					categoryId,
					difference: -15,
					planned: 0,
					spent: 15,
				}),
			],
			totalPlanned: 0,
			totalSpent: 15,
			types: expect.arrayContaining([
				expect.objectContaining({ totalSpent: 15, typeId: replacement._id }),
				expect.objectContaining({ totalSpent: 0, typeId: type._id }),
			]),
		});
		expect(
			await editAndSave(
				{ categoryTypeId: null, plannedAmount: null },
				"clear-category-plan"
			)
		).toEqual({
			...saved,
			categoryType: null,
			plannedAmount: null,
		});
		const stored = await owner.query(api.categories.get, { id: categoryId });
		expect(stored).not.toHaveProperty("categoryTypeId");
		expect(stored).not.toHaveProperty("plannedAmount");
		expect(await getSummary()).toMatchObject({
			categories: [
				expect.objectContaining({
					categoryId,
					difference: null,
					planned: null,
					spent: 15,
				}),
			],
			totalSpent: 15,
		});
		expect(await owner.query(api.expenses.get, expenseArgs)).toEqual({
			...expenseBefore,
			categoryIcon: "🔧",
			categoryName: "Bike repairs",
			categoryTypeColor: null,
		});
		expect(
			await owner.query(api.cli.v1.accounts.get, accountArgs)
		).toMatchObject({ currentBalance: 85 });
		expect(
			await owner.query(api.cli.v1.accounts.listTransactions, accountArgs)
		).toEqual(ledgerBefore);
		expect(
			await owner.query(api.cli.v1.cycles.get, { cycleId: cycle._id })
		).toEqual(cycleBefore);
	});

	it.each([
		{ before: "Infinity", repair: null, stored: Number.POSITIVE_INFINITY },
		{ before: "-Infinity", repair: 0, stored: Number.NEGATIVE_INFINITY },
		{ before: "NaN", repair: 25.5, stored: Number.NaN },
	])(
		"repairs a stored $before plan through a guarded edit",
		async ({ before, repair, stored }) => {
			const { categoryId, owner } = await editFixture();
			const storeLegacyPlan = async (plannedAmount: number) =>
				await owner.mutation(api.categories.update, {
					id: categoryId,
					plannedAmount,
				});
			await storeLegacyPlan(stored);
			const input = { categoryId, plannedAmount: repair };
			const preview = await owner.query(
				api.cli.v1.resources.previewCategoryEdit,
				input
			);
			expect(preview.before.plannedAmount).toBe(before);
			expect(preview.after.plannedAmount).toBe(repair);
			expect(
				await owner.query(api.categories.get, { id: categoryId })
			).toMatchObject({ plannedAmount: stored });
			await expect(
				owner.query(api.cli.v1.resources.previewCategoryEdit, {
					categoryId,
					name: "New name",
				})
			).rejects.toMatchObject({
				data: { code: "CATEGORY_PLAN_REPAIR_REQUIRED" },
			});
			const request = {
				...input,
				expectedEditSnapshot: preview.editSnapshot,
				idempotencyKey: "repair-legacy-plan",
			};
			await storeLegacyPlan(
				Number.isNaN(stored) ? Number.POSITIVE_INFINITY : Number.NaN
			);
			await expect(
				owner.mutation(api.cli.v1.resources.editCategory, request)
			).rejects.toMatchObject({ data: { code: "CATEGORY_EDIT_CONFLICT" } });
			const fresh = await owner.query(
				api.cli.v1.resources.previewCategoryEdit,
				input
			);
			const saved = await owner.mutation(api.cli.v1.resources.editCategory, {
				...request,
				expectedEditSnapshot: fresh.editSnapshot,
			});
			expect(saved.plannedAmount).toBe(repair);
			expect(
				(await owner.query(api.categories.get, { id: categoryId }))
					?.plannedAmount
			).toBe(repair ?? undefined);
		}
	);

	it("binds the snapshot to the category and patch and rejects stale Web changes", async () => {
		const { category, categoryId, cycle, owner } = await editFixture();
		const other = await owner.mutation(api.categories.create, {
			categoryTypeId: category.categoryTypeId,
			cycleId: cycle._id,
			icon: category.icon,
			name: category.name,
			plannedAmount: category.plannedAmount,
		});
		if (!other) {
			throw new Error("Expected a duplicate category");
		}
		const input = { categoryId, plannedAmount: null };
		const { editSnapshot } = await owner.query(
			api.cli.v1.resources.previewCategoryEdit,
			input
		);
		const request = {
			...input,
			expectedEditSnapshot: editSnapshot,
			idempotencyKey: "edit-snapshot-binding",
		};
		await forEachSequential(
			[{ categoryId: other._id }, { plannedAmount: 0 }],
			async (change) => {
				await expect(
					owner.mutation(api.cli.v1.resources.editCategory, {
						...request,
						...change,
					})
				).rejects.toMatchObject({
					data: { code: "CATEGORY_EDIT_CONFLICT", retryable: false },
				});
			}
		);
		await owner.mutation(api.categories.update, { icon: "🛠️", id: categoryId });
		await expect(
			owner.mutation(api.cli.v1.resources.editCategory, request)
		).rejects.toMatchObject({ data: { code: "CATEGORY_EDIT_CONFLICT" } });
		expect(await owner.query(api.categories.get, { id: categoryId })).toEqual({
			...category,
			icon: "🛠️",
		});
		expect(await owner.query(api.categories.get, { id: other._id })).toEqual(
			other
		);
	});

	it("replays the original result after intervening edits without writing again", async () => {
		const { categoryId, owner } = await editFixture();
		const input = { categoryId, plannedAmount: null };
		const { after, editSnapshot } = await owner.query(
			api.cli.v1.resources.previewCategoryEdit,
			input
		);
		const request = {
			...input,
			expectedEditSnapshot: editSnapshot,
			idempotencyKey: "edit-replay",
		};
		await owner.mutation(api.cli.v1.resources.editCategory, request);
		const changed = await owner.mutation(api.categories.update, {
			id: categoryId,
			plannedAmount: 200,
		});
		expect(
			await owner.mutation(api.cli.v1.resources.editCategory, request)
		).toEqual(after);
		await expect(
			owner.mutation(api.cli.v1.resources.editCategory, {
				...request,
				plannedAmount: 0,
			})
		).rejects.toMatchObject({ data: { code: "IDEMPOTENCY_CONFLICT" } });
		expect(await owner.query(api.categories.get, { id: categoryId })).toEqual(
			changed
		);
	});

	it("rechecks auth, category and type ownership, and rejects a replacement type deleted after preview", async () => {
		const { category, categoryId, owner, replacement, test } =
			await editFixture();
		const other = test.withIdentity({ subject: "cli-edit-stranger" });
		await other.mutation(api.users.create, { email: "stranger@example.com" });
		const [foreignType] = await other.query(api.categories.listTypes, {});
		const input = { categoryId, categoryTypeId: replacement._id };
		const { editSnapshot } = await owner.query(
			api.cli.v1.resources.previewCategoryEdit,
			input
		);
		const request = {
			...input,
			expectedEditSnapshot: editSnapshot,
			idempotencyKey: "edit-auth-check",
		};
		await forEachSequential(
			[
				[test, "AUTHENTICATION_REQUIRED"],
				[other, "RESOURCE_NOT_FOUND"],
			] as const,
			async ([client, code]) => {
				await expect(
					client.query(api.cli.v1.resources.previewCategoryEdit, input)
				).rejects.toMatchObject({ data: { code } });
				await expect(
					client.mutation(api.cli.v1.resources.editCategory, request)
				).rejects.toMatchObject({ data: { code } });
			}
		);
		await expect(
			owner.query(api.cli.v1.resources.previewCategoryEdit, {
				...input,
				categoryTypeId: foreignType._id,
			})
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
		await expect(
			owner.mutation(api.cli.v1.resources.editCategory, {
				...request,
				categoryTypeId: foreignType._id,
			})
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
		await owner.mutation(api.categories.deleteType, { id: replacement._id });
		await expect(
			owner.mutation(api.cli.v1.resources.editCategory, request)
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
		expect(await owner.query(api.categories.get, { id: categoryId })).toEqual(
			category
		);
	});

	it.each([
		{},
		{ name: "   " },
		{ name: "a".repeat(101) },
		{ name: "embedded\ncontrol" },
		{ icon: "x".repeat(33) },
		{ plannedAmount: -1 },
		{ plannedAmount: Number.NaN },
		{ plannedAmount: Number.POSITIVE_INFINITY },
		{ plannedAmount: 2 ** 46 },
		{ plannedAmount: 0.001 },
	])("rejects invalid category patches %j without writing", async (invalid) => {
		const { category, categoryId, owner } = await editFixture();
		const args = { categoryId, ...invalid };
		await expect(
			owner.query(api.cli.v1.resources.previewCategoryEdit, args)
		).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
		await expect(
			owner.mutation(api.cli.v1.resources.editCategory, {
				...args,
				expectedEditSnapshot: "0".repeat(64),
				idempotencyKey: "invalid-category-edit",
			})
		).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
		expect(await owner.query(api.categories.get, { id: categoryId })).toEqual(
			category
		);
	});

	it("invalidates a copied plan preview only when the effective copy changes", async () => {
		const { categoryId, cycle, owner } = await editFixture();
		const source = { copyFromCycleId: cycle._id, includePlannedAmounts: true };
		const base = {
			...source,
			endDateExclusive: "2026-03-01",
			name: "February",
			startDate: "2026-02-01",
		};
		const omitted = { ...base, includePlannedAmounts: false };
		const empty = { ...base, copyCategoryIds: [] };
		const before = await owner.query(api.cli.v1.cycles.previewCreate, base);
		const skipPlanBefore = await owner.query(
			api.cli.v1.cycles.previewCreate,
			omitted
		);
		const emptyBefore = await owner.query(
			api.cli.v1.cycles.previewCreate,
			empty
		);
		const input = { categoryId, plannedAmount: null };
		const { editSnapshot } = await owner.query(
			api.cli.v1.resources.previewCategoryEdit,
			input
		);
		await owner.mutation(api.cli.v1.resources.editCategory, {
			...input,
			expectedEditSnapshot: editSnapshot,
			idempotencyKey: "edit-copy-source",
		});
		await expect(
			owner.mutation(api.cli.v1.cycles.create, {
				...base,
				expectedCopySnapshot: before.copySnapshot,
				idempotencyKey: "stale-category-copy",
			})
		).rejects.toMatchObject({ data: { code: "CYCLE_COPY_CONFLICT" } });
		expect(await owner.query(api.cli.v1.cycles.previewCreate, omitted)).toEqual(
			skipPlanBefore
		);
		expect(await owner.query(api.cli.v1.cycles.previewCreate, empty)).toEqual(
			emptyBefore
		);
		expect(
			await owner.query(api.cli.v1.cycles.previewCreate, base)
		).toMatchObject({
			copiedCategories: [{ plannedAmount: null, sourceCategoryId: categoryId }],
		});
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
