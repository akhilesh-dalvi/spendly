import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = async () => {
	const test = convexTest(schema, modules);
	const client = test.withIdentity({ subject: "cycle-owner" });
	const userId = await client.mutation(api.users.create, {
		email: "cycle-owner@example.com",
	});
	return { test, client, userId };
};

const input = {
	name: "  September  ",
	startDate: "2026-09-01",
	endDateExclusive: "2026-10-01",
};

const expectCode = async (operation: Promise<unknown>, code: string) => {
	let caught: unknown;
	try {
		await operation;
	} catch (error) {
		caught = error;
	}
	const data =
		typeof caught === "object" && caught !== null && "data" in caught
			? caught.data
			: undefined;
	if (
		typeof data !== "object" ||
		data === null ||
		!("code" in data) ||
		data.code !== code ||
		!("retryable" in data) ||
		data.retryable !== false
	) {
		throw new Error(`Expected ${code}, received ${JSON.stringify(data)}`);
	}
};

const sourceFixture = async () => {
	const setupResult = await setup();
	const { client } = setupResult;
	const source = await client.mutation(api.cycles.create, {
		name: "August",
		startDate: "2026-08-01",
		endDate: "2026-09-01",
	});
	if (!source) {
		throw new Error("Expected source cycle");
	}
	const food = await client.mutation(api.categories.create, {
		cycleId: source._id,
		name: "Food",
		plannedAmount: 100,
		order: 0,
		icon: "utensils",
		isHidden: true,
	});
	const rent = await client.mutation(api.categories.create, {
		cycleId: source._id,
		name: "Rent",
		plannedAmount: 500,
		order: 1,
	});
	if (!(food && rent)) {
		throw new Error("Expected source categories");
	}
	return { ...setupResult, source, food, rent };
};

describe("authenticated CLI cycle CRUD", () => {
	it.each([
		"foreign-category",
		"cross-cycle-expense",
	] as const)("blocks deletion of inconsistent legacy relationships: %s", async (scenario) => {
		const { test, client, source, food } = await sourceFixture();
		if (scenario === "foreign-category") {
			const foreign = test.withIdentity({ subject: "foreign-cycle-owner" });
			const foreignUserId = await foreign.mutation(api.users.create, {
				email: "foreign-cycle-owner@example.com",
			});
			await test.run(async (ctx) => {
				await ctx.db.patch(food._id, { userId: foreignUserId });
			});
		} else {
			await client.mutation(api.cli.v1.cycles.create, {
				...input,
				idempotencyKey: "linked-cycle-create",
			});
			const expense = await client.mutation(api.cli.v1.expenses.create, {
				amount: 10,
				date: "2026-09-02",
				idempotencyKey: "legacy-linked-expense",
			});
			await test.run(async (ctx) => {
				await ctx.db.patch(expense.id, { categoryId: food._id });
			});
		}
		await expectCode(
			client.mutation(api.cli.v1.cycles.previewDelete, {
				cycleId: source._id,
			}),
			scenario === "foreign-category"
				? "RESOURCE_NOT_FOUND"
				: "CYCLE_HAS_EXPENSES"
		);
		expect(
			await client.query(api.cli.v1.cycles.get, { cycleId: source._id })
		).toMatchObject({ id: source._id, name: "August" });
	});
	it.each([
		"all",
		"subset",
		"none",
		"amounts",
		"overrides",
	] as const)("previews and commits category copy: %s", async (mode) => {
		const { client, source, food, rent } = await sourceFixture();
		const copyCategoryIds = mode === "subset" ? [food._id] : undefined;
		const request = {
			...input,
			copyFromCycleId: source._id,
			copyCategoryIds: mode === "none" ? [] : copyCategoryIds,
			includePlannedAmounts: mode === "amounts" || mode === "overrides",
			categoryPlannedOverrides:
				mode === "overrides"
					? [{ id: food._id }, { id: rent._id, plannedAmount: 0 }]
					: undefined,
		};
		let expected = [
			{
				sourceCategoryId: food._id,
				name: "Food",
				plannedAmount: mode === "amounts" ? 100 : null,
			},
			{
				sourceCategoryId: rent._id,
				name: "Rent",
				plannedAmount: mode === "amounts" ? 500 : null,
			},
		];
		if (mode === "subset") {
			expected = expected.slice(0, 1);
		}
		if (mode === "none") {
			expected = [];
		}
		if (mode === "overrides") {
			expected[1] = {
				sourceCategoryId: rent._id,
				name: "Rent",
				plannedAmount: 0,
			};
		}
		expect(
			await client.query(api.cli.v1.cycles.previewCreate, request)
		).toMatchObject({ copiedCategories: expected });
		expect(
			await client.query(api.cli.v1.resources.listCycles, {})
		).toHaveLength(1);
		const result = await client.mutation(api.cli.v1.cycles.create, {
			...request,
			idempotencyKey: `copy-${mode}-cycle`,
		});
		expect(result.copiedCategories).toEqual(expected);
		const categories = await client.query(api.cli.v1.resources.listCategories, {
			cycleId: result.cycle.id,
		});
		expect(
			categories.map(({ name, plannedAmount }) => ({ name, plannedAmount }))
		).toEqual(
			expected.map(({ name, plannedAmount }) => ({ name, plannedAmount }))
		);
		if (categories.length) {
			expect(categories[0]).toMatchObject({
				icon: "utensils",
				isHidden: true,
				order: 0,
			});
		}
	});
	it("keeps empty copy options without a source compatible with web creation", async () => {
		const { client } = await setup();
		const options = {
			copyCategoryIds: [],
			categoryPlannedOverrides: [],
			includePlannedAmounts: true,
		};
		expect(
			await client.query(api.cli.v1.cycles.previewCreate, {
				...input,
				...options,
			})
		).toMatchObject({ copiedCategories: [] });
		const cycle = await client.mutation(api.cycles.create, {
			name: input.name,
			startDate: input.startDate,
			endDate: input.endDateExclusive,
			...options,
		});
		expect(
			await client.query(api.cli.v1.resources.listCategories, {
				cycleId: cycle._id,
			})
		).toEqual([]);
	});

	it("maps malformed identifiers to INVALID_INPUT inside the CLI facade", async () => {
		const { client } = await setup();
		await expectCode(
			client.query(api.cli.v1.cycles.get, { cycleId: "malformed" }),
			"INVALID_INPUT"
		);
		await expectCode(
			client.query(api.cli.v1.cycles.previewUpdate, {
				cycleId: "malformed",
				name: "Edit",
			}),
			"INVALID_INPUT"
		);
		await expectCode(
			client.mutation(api.cli.v1.cycles.previewDelete, {
				cycleId: "malformed",
			}),
			"INVALID_INPUT"
		);
		await expectCode(
			client.query(api.cli.v1.cycles.previewCreate, {
				...input,
				copyFromCycleId: "malformed",
			}),
			"INVALID_INPUT"
		);
		const { cycle } = await client.mutation(api.cli.v1.cycles.create, {
			...input,
			idempotencyKey: "malformed-category",
		});
		await expectCode(
			client.query(api.cli.v1.cycles.previewCreate, {
				name: "October",
				startDate: "2026-10-01",
				endDateExclusive: "2026-11-01",
				copyFromCycleId: cycle.id,
				copyCategoryIds: ["malformed"],
			}),
			"INVALID_INPUT"
		);
	});

	it("confirms deletion without financial writes, cascades categories, clears onboarding and replays the committed result", async () => {
		const { client, test, userId, source, food } = await sourceFixture();
		await test.run(async (ctx) => {
			await ctx.db.patch(userId, {
				onboardingCycleId: source._id,
				onboardingPath: "plan",
				onboardingStep: "categories",
			});
		});
		const preview = await client.mutation(api.cli.v1.cycles.previewDelete, {
			cycleId: source._id,
		});
		expect(preview).toMatchObject({
			cycle: { id: source._id, revision: 1 },
			categoryCount: 2,
			confirmationToken: expect.any(String),
			expiresAt: expect.any(String),
		});
		expect(
			await client.query(api.cli.v1.resources.listCycles, {})
		).toHaveLength(1);
		expect(
			await client.query(api.cli.v1.resources.listCategories, {
				cycleId: source._id,
			})
		).toHaveLength(2);
		const request = {
			cycleId: source._id,
			expectedRevision: 1,
			confirmationToken: preview.confirmationToken,
			idempotencyKey: "delete-confirmed-cycle",
		};
		const result = await client.mutation(api.cli.v1.cycles.remove, request);
		expect(result).toEqual({
			cycle: preview.cycle,
			deleted: true,
			deletedCategoryCount: 2,
		});
		expect(await client.mutation(api.cli.v1.cycles.remove, request)).toEqual(
			result
		);
		expect(await client.query(api.cli.v1.resources.listCycles, {})).toEqual([]);
		await expect(
			client.query(api.categories.get, { id: food._id })
		).rejects.toBeDefined();
		expect(
			(await client.query(api.users.getOnboardingState, {}))?.cycle
		).toBeNull();
		await expectCode(
			client.mutation(api.cli.v1.cycles.remove, {
				...request,
				idempotencyKey: "used-confirmation-key",
			}),
			"DELETION_CONFIRMATION_INVALID"
		);
		await expectCode(
			client.mutation(api.cli.v1.cycles.remove, { ...request, agent: true }),
			"IDEMPOTENCY_CONFLICT"
		);
	});

	it("guards deletion when expenses exist or are linked after preview, including expenses outside edited dates", async () => {
		const { client, source } = await sourceFixture();
		const preview = await client.mutation(api.cli.v1.cycles.previewDelete, {
			cycleId: source._id,
		});
		await client.mutation(api.cli.v1.expenses.create, {
			date: "2026-08-02",
			amount: 2,
			idempotencyKey: "expense-after-preview",
		});
		await client.mutation(api.cycles.update, {
			id: source._id,
			startDate: "2026-08-03",
		});
		await expectCode(
			client.mutation(api.cli.v1.cycles.previewDelete, { cycleId: source._id }),
			"CYCLE_HAS_EXPENSES"
		);
		await expectCode(
			client.mutation(api.cli.v1.cycles.remove, {
				cycleId: source._id,
				expectedRevision: 1,
				confirmationToken: preview.confirmationToken,
				idempotencyKey: "stale-delete-cycle",
			}),
			"CYCLE_REVISION_CONFLICT"
		);
		await expect(
			client.mutation(api.cycles.remove, { id: source._id })
		).rejects.toBeDefined();
		const { cycle } = await client.mutation(api.cli.v1.cycles.create, {
			...input,
			idempotencyKey: "another-delete-cycle",
		});
		const another = await client.mutation(api.cli.v1.cycles.previewDelete, {
			cycleId: cycle.id,
		});
		await client.mutation(api.cli.v1.expenses.create, {
			date: "2026-09-02",
			amount: 3,
			idempotencyKey: "second-expense-after-preview",
		});
		await expectCode(
			client.mutation(api.cli.v1.cycles.remove, {
				cycleId: cycle.id,
				expectedRevision: 1,
				confirmationToken: another.confirmationToken,
				idempotencyKey: "guard-delete-cycle",
			}),
			"CYCLE_HAS_EXPENSES"
		);
	});

	it("expires confirmations at the five-minute boundary", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
			const { client, source } = await sourceFixture();
			const preview = await client.mutation(api.cli.v1.cycles.previewDelete, {
				cycleId: source._id,
			});
			expect(preview.expiresAt).toBe("2026-09-01T00:05:00.000Z");
			vi.setSystemTime(new Date("2026-09-01T00:05:00Z"));
			await expectCode(
				client.mutation(api.cli.v1.cycles.remove, {
					cycleId: source._id,
					expectedRevision: 1,
					confirmationToken: preview.confirmationToken,
					idempotencyKey: "expired-delete-cycle",
				}),
				"DELETION_CONFIRMATION_EXPIRED"
			);
			expect(
				await client.query(api.cli.v1.resources.listCycles, {})
			).toHaveLength(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([
		"add",
		"edit",
		"remove",
	] as const)("invalidates confirmation when category snapshot changes: %s", async (change) => {
		const { client, source, food } = await sourceFixture();
		const preview = await client.mutation(api.cli.v1.cycles.previewDelete, {
			cycleId: source._id,
		});
		if (change === "add") {
			await client.mutation(api.categories.create, {
				cycleId: source._id,
				name: "New",
			});
		}
		if (change === "edit") {
			await client.mutation(api.categories.update, {
				id: food._id,
				name: "Changed",
			});
		}
		if (change === "remove") {
			await client.mutation(api.categories.remove, { categoryId: food._id });
		}
		await expectCode(
			client.mutation(api.cli.v1.cycles.remove, {
				cycleId: source._id,
				expectedRevision: 1,
				confirmationToken: preview.confirmationToken,
				idempotencyKey: "snapshot-delete-cycle",
			}),
			"DELETION_CONFIRMATION_INVALID"
		);
		const fresh = await client.mutation(api.cli.v1.cycles.previewDelete, {
			cycleId: source._id,
		});
		expect(
			(
				await client.mutation(api.cli.v1.cycles.remove, {
					cycleId: source._id,
					expectedRevision: 1,
					confirmationToken: fresh.confirmationToken,
					idempotencyKey: "fresh-snapshot-delete",
				})
			).deletedCategoryCount
		).toBe(fresh.categoryCount);
	});

	it("rejects foreign, mismatched and malformed deletion confirmations without exposing another user's cycle", async () => {
		const { test, client, source } = await sourceFixture();
		const other = test.withIdentity({ subject: "delete-other" });
		await other.mutation(api.users.create, {
			email: "delete-other@example.com",
		});
		const { cycle } = await client.mutation(api.cli.v1.cycles.create, {
			...input,
			idempotencyKey: "token-other-cycle",
		});
		const preview = await client.mutation(api.cli.v1.cycles.previewDelete, {
			cycleId: source._id,
		});
		await expectCode(
			other.mutation(api.cli.v1.cycles.previewDelete, { cycleId: source._id }),
			"RESOURCE_NOT_FOUND"
		);
		await expectCode(
			other.mutation(api.cli.v1.cycles.remove, {
				cycleId: source._id,
				expectedRevision: 1,
				confirmationToken: preview.confirmationToken,
				idempotencyKey: "foreign-token-delete",
			}),
			"DELETION_CONFIRMATION_INVALID"
		);
		for (const invalid of [
			{ cycleId: cycle.id },
			{ expectedRevision: 2 },
			{ confirmationToken: "not-a-token" },
		]) {
			await expectCode(
				client.mutation(api.cli.v1.cycles.remove, {
					cycleId: source._id,
					expectedRevision: 1,
					confirmationToken: preview.confirmationToken,
					idempotencyKey: "invalid-token-delete",
					...invalid,
				}),
				"DELETION_CONFIRMATION_INVALID"
			);
		}
	});

	it("previews partial updates, detects web edits, and commits without reassigning expenses", async () => {
		const { client } = await setup();
		const { cycle } = await client.mutation(api.cli.v1.cycles.create, {
			...input,
			idempotencyKey: "cycle-for-update",
		});
		const linked = await client.mutation(api.cli.v1.expenses.create, {
			amount: 10,
			date: "2026-09-05",
			idempotencyKey: "linked-expense",
		});
		const unassigned = await client.mutation(api.cli.v1.expenses.create, {
			amount: 20,
			date: "2026-10-05",
			idempotencyKey: "unassigned-expense",
		});
		const preview = await client.query(api.cli.v1.cycles.previewUpdate, {
			cycleId: cycle.id,
			name: "  Revised  ",
			startDate: "2026-09-10",
			endDateExclusive: "2026-10-10",
			expectedRevision: 1,
		});
		expect(preview).toEqual({
			before: cycle,
			after: {
				...cycle,
				name: "Revised",
				startDate: "2026-09-10",
				endDateExclusive: "2026-10-10",
				revision: 2,
			},
		});
		expect(
			await client.query(api.cli.v1.cycles.get, { cycleId: cycle.id })
		).toEqual(cycle);
		await client.mutation(api.cycles.update, {
			id: cycle.id,
			name: "Web edit",
		});
		const request = {
			cycleId: cycle.id,
			name: "Revised",
			startDate: "2026-09-10",
			endDateExclusive: "2026-10-10",
			expectedRevision: 1,
			idempotencyKey: "update-revised",
		};
		await expectCode(
			client.mutation(api.cli.v1.cycles.update, request),
			"CYCLE_REVISION_CONFLICT"
		);
		await expectCode(
			client.query(api.cli.v1.cycles.previewUpdate, {
				cycleId: cycle.id,
				expectedRevision: 1,
			}),
			"CYCLE_REVISION_CONFLICT"
		);
		const result = await client.mutation(api.cli.v1.cycles.update, {
			...request,
			expectedRevision: 2,
		});
		expect(result).toEqual({ ...preview.after, revision: 3 });
		expect(
			await client.mutation(api.cli.v1.cycles.update, {
				...request,
				expectedRevision: 2,
			})
		).toEqual(result);
		expect(
			(await client.query(api.cli.v1.expenses.get, { expenseId: linked.id }))
				.cycle?.id
		).toBe(cycle.id);
		expect(
			(
				await client.query(api.cli.v1.expenses.get, {
					expenseId: unassigned.id,
				})
			).cycle
		).toBeNull();
		await expectCode(
			client.mutation(api.cli.v1.cycles.update, {
				...request,
				expectedRevision: 3,
			}),
			"IDEMPOTENCY_CONFLICT"
		);
	});

	it("defaults legacy revisions to one and increments every onboarding cycle write", async () => {
		const { test, client, userId } = await setup();
		const cycleId = await test.run(async (ctx) => {
			const id = await ctx.db.insert("expense_cycles", {
				userId,
				name: "Legacy",
				startDate: "2026-09-01",
				endDate: "2026-10-01",
				createdAt: 1,
			});
			await ctx.db.patch(userId, {
				onboardingCycleId: id,
				onboardingPath: "plan",
				onboardingStep: "cycle",
			});
			return id;
		});
		expect(
			(await client.query(api.cli.v1.cycles.get, { cycleId })).revision
		).toBe(1);
		await client.mutation(api.cycles.saveOnboardingCycle, {
			name: "Onboarding",
			startDate: "2026-09-01",
			endDate: "2026-10-01",
		});
		expect(
			(await client.query(api.cli.v1.cycles.get, { cycleId })).revision
		).toBe(2);
		expect(
			(await client.query(api.users.getOnboardingState, {}))?.cycle?._id
		).toBe(cycleId);
		await client.mutation(api.cycles.update, {
			id: cycleId,
			endDate: "2026-10-02",
		});
		expect(
			(await client.query(api.cli.v1.cycles.get, { cycleId })).revision
		).toBe(3);
	});

	it("validates partial update names, real dates, revisions, and half-open overlap", async () => {
		const { client, source } = await sourceFixture();
		const { cycle } = await client.mutation(api.cli.v1.cycles.create, {
			...input,
			idempotencyKey: "update-validation",
		});
		for (const invalid of [
			{ name: " " },
			{ startDate: "2026-09-31" },
			{ endDateExclusive: "2026-09-01" },
			{ expectedRevision: 0 },
			{ expectedRevision: 1.5 },
		]) {
			await expectCode(
				client.query(api.cli.v1.cycles.previewUpdate, {
					cycleId: cycle.id,
					...invalid,
				}),
				"INVALID_INPUT"
			);
		}
		await expectCode(
			client.query(api.cli.v1.cycles.previewUpdate, {
				cycleId: cycle.id,
				startDate: "2026-08-31",
			}),
			"CYCLE_OVERLAP"
		);
		expect(
			(
				await client.query(api.cli.v1.cycles.previewUpdate, {
					cycleId: source._id,
					endDateExclusive: "2026-09-01",
				})
			).after.revision
		).toBe(2);
	});

	it("rejects unauthenticated reads, foreign resources and unsafe copies through both CLI and web", async () => {
		const { test, client, source, food } = await sourceFixture();
		const other = test.withIdentity({ subject: "other-owner" });
		await other.mutation(api.users.create, {
			email: "other-owner@example.com",
		});
		await expectCode(
			test.query(api.cli.v1.cycles.get, { cycleId: source._id }),
			"AUTHENTICATION_REQUIRED"
		);
		await expectCode(
			other.query(api.cli.v1.cycles.get, { cycleId: source._id }),
			"RESOURCE_NOT_FOUND"
		);
		await expectCode(
			other.query(api.cli.v1.cycles.previewCreate, {
				...input,
				copyFromCycleId: source._id,
			}),
			"RESOURCE_NOT_FOUND"
		);
		await expectCode(
			other.mutation(api.cli.v1.cycles.create, {
				...input,
				copyFromCycleId: source._id,
				idempotencyKey: "foreign-source",
			}),
			"RESOURCE_NOT_FOUND"
		);
		await expect(
			other.mutation(api.cycles.create, {
				name: "Foreign copy",
				startDate: input.startDate,
				endDate: input.endDateExclusive,
				copyFromCycleId: source._id,
			})
		).rejects.toBeDefined();
		const foreignCycle = await other.mutation(api.cycles.create, {
			name: "Other",
			startDate: "2026-07-01",
			endDate: "2026-08-01",
		});
		if (!foreignCycle) {
			throw new Error("Expected foreign cycle");
		}
		const foreignCategory = await other.mutation(api.categories.create, {
			cycleId: foreignCycle._id,
			name: "Private",
		});
		if (!foreignCategory) {
			throw new Error("Expected foreign category");
		}
		for (const copyInput of [
			{ copyCategoryIds: [foreignCategory._id] },
			{
				categoryPlannedOverrides: [
					{ id: foreignCategory._id, plannedAmount: 1 },
				],
			},
		]) {
			await expectCode(
				client.query(api.cli.v1.cycles.previewCreate, {
					...input,
					copyFromCycleId: source._id,
					...copyInput,
				}),
				"RESOURCE_NOT_FOUND"
			);
		}
		const foreignTypeId = await test.run(async (ctx) => {
			const foreignUser = await ctx.db
				.query("users")
				.withIndex("by_clerkId", (q) => q.eq("clerkId", "other-owner"))
				.unique();
			if (!foreignUser) {
				throw new Error("Expected foreign user");
			}
			return await ctx.db.insert("category_types", {
				userId: foreignUser._id,
				name: "Private type",
				createdAt: 1,
			});
		});
		await test.run(async (ctx) => {
			await ctx.db.patch(food._id, { categoryTypeId: foreignTypeId });
		});
		await expectCode(
			client.query(api.cli.v1.cycles.previewCreate, {
				...input,
				copyFromCycleId: source._id,
			}),
			"RESOURCE_NOT_FOUND"
		);
		expect(
			await client.query(api.cli.v1.resources.listCycles, {})
		).toHaveLength(1);
	});

	it.each([
		{ name: " " },
		{ startDate: "2026-02-30" },
		{ startDate: "2026-9-01" },
		{ endDateExclusive: "2026-09-01" },
		{ startDate: "2026-10-02" },
	])("returns INVALID_INPUT for invalid cycle values %j", async (invalid) => {
		const { client } = await setup();
		await expectCode(
			client.query(api.cli.v1.cycles.previewCreate, { ...input, ...invalid }),
			"INVALID_INPUT"
		);
		await expectCode(
			client.mutation(api.cli.v1.cycles.create, {
				...input,
				...invalid,
				idempotencyKey: "invalid-create",
			}),
			"INVALID_INPUT"
		);
		expect(await client.query(api.cli.v1.resources.listCycles, {})).toEqual([]);
	});

	it("rejects bad planned overrides, non-source selections, duplicate IDs and overlap while allowing adjacent cycles", async () => {
		const { client, source, food, rent } = await sourceFixture();
		for (const invalid of [
			{ categoryPlannedOverrides: [{ id: food._id, plannedAmount: -1 }] },
			{
				categoryPlannedOverrides: [
					{ id: food._id, plannedAmount: Number.POSITIVE_INFINITY },
				],
			},
			{ copyCategoryIds: [food._id, food._id] },
			{ categoryPlannedOverrides: [{ id: food._id }, { id: food._id }] },
			{
				copyCategoryIds: [food._id],
				categoryPlannedOverrides: [{ id: rent._id }],
			},
		]) {
			await expectCode(
				client.query(api.cli.v1.cycles.previewCreate, {
					...input,
					copyFromCycleId: source._id,
					...invalid,
				}),
				"INVALID_INPUT"
			);
		}
		await expectCode(
			client.query(api.cli.v1.cycles.previewCreate, {
				...input,
				copyCategoryIds: [food._id],
			}),
			"INVALID_INPUT"
		);
		await expectCode(
			client.query(api.cli.v1.cycles.previewCreate, {
				...input,
				startDate: "2026-08-31",
			}),
			"CYCLE_OVERLAP"
		);
		const result = await client.mutation(api.cli.v1.cycles.create, {
			...input,
			idempotencyKey: "adjacent-create",
		});
		expect(result.copiedCategories).toEqual([]);
		await expectCode(
			client.mutation(api.cli.v1.cycles.create, {
				...input,
				name: "Changed request",
				idempotencyKey: "adjacent-create",
			}),
			"IDEMPOTENCY_CONFLICT"
		);
	});

	it("previews without creating a cycle, creates once, and retrieves a revisioned detail without changing resources", async () => {
		const { client } = await setup();
		expect(await client.query(api.cli.v1.cycles.previewCreate, input)).toEqual({
			...input,
			name: "September",
			copiedCategories: [],
		});
		expect(await client.query(api.cli.v1.resources.listCycles, {})).toEqual([]);
		const request = { ...input, idempotencyKey: "create-september" };
		const result = await client.mutation(api.cli.v1.cycles.create, request);
		expect(result).toMatchObject({
			cycle: { name: "September", revision: 1 },
			copiedCategories: [],
		});
		expect(await client.mutation(api.cli.v1.cycles.create, request)).toEqual(
			result
		);
		expect(
			await client.query(api.cli.v1.cycles.get, { cycleId: result.cycle.id })
		).toEqual(result.cycle);
		const { revision: _revision, ...summary } = result.cycle;
		expect(await client.query(api.cli.v1.resources.listCycles, {})).toEqual([
			summary,
		]);
		expect(
			await client.query(api.cli.v1.resources.getCurrentCycle, {
				date: "2026-09-01",
			})
		).toEqual(summary);
	});
});
