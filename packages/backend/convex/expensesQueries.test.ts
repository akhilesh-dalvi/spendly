// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { forEachSequential } from "./lib/async";
import schema from "./schema";
import { modules } from "./test.setup";

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "expense-query-owner" });
	const stranger = test.withIdentity({ subject: "expense-query-stranger" });
	await owner.mutation(api.users.create, { email: "owner@example.com" });
	await stranger.mutation(api.users.create, { email: "stranger@example.com" });
	const [accountType] = await owner.query(api.accountTypes.list, {});
	if (!accountType) {
		throw new Error("Expected seeded account type");
	}
	const account = await owner.mutation(api.accounts.create, {
		accountTypeId: accountType._id,
		name: "Wallet",
		startingBalance: 100,
	});
	const cycle = await owner.mutation(api.cycles.create, {
		endDate: "2026-02-01",
		name: "January",
		startDate: "2026-01-01",
	});
	const categoryType = await owner.mutation(api.categories.createType, {
		color: "#123456",
		name: "Essential",
	});
	if (!categoryType) {
		throw new Error("Expected created category type");
	}
	const category = await owner.mutation(api.categories.create, {
		categoryTypeId: categoryType._id,
		cycleId: cycle._id,
		icon: "apple",
		name: "Food",
	});
	if (!category) {
		throw new Error("Expected created category");
	}
	const tag = await owner.mutation(api.tags.create, { name: "shared" });
	const secondTag = await owner.mutation(api.tags.create, { name: "special" });
	const first = await owner.mutation(api.expenses.create, {
		accountId: account._id,
		amount: 10,
		categoryId: category._id,
		date: "2026-01-05",
		spentOn: "Lunch",
		tagIds: [tag, secondTag],
	});
	const second = await owner.mutation(api.expenses.create, {
		accountId: account._id,
		amount: 20,
		categoryId: category._id,
		date: "2026-01-10",
		tagIds: [tag],
	});
	const unlinked = await owner.mutation(api.expenses.create, {
		accountId: null,
		amount: 3,
		date: "2026-02-01",
	});
	return {
		account,
		category,
		cycle,
		first,
		owner,
		second,
		secondTag,
		stranger,
		tag,
		test,
		unlinked,
	};
};

describe("web expense queries", () => {
	it("enriches linked expenses and presents missing optional resources as null", async () => {
		const { owner, account, cycle, category, first, unlinked } = await setup();
		expect(
			await owner.query(api.expenses.get, { expenseId: first._id })
		).toMatchObject({
			accountName: "Wallet",
			accountTypeId: account.accountTypeId,
			amount: 10,
			categoryIcon: "apple",
			categoryName: "Food",
			categoryTypeColor: "#123456",
			cycleName: "January",
			tagNames: ["shared", "special"],
		});
		expect(
			await owner.query(api.expenses.get, { expenseId: unlinked._id })
		).toMatchObject({
			accountName: null,
			accountTypeId: null,
			categoryName: null,
			categoryTypeColor: null,
			cycleName: null,
			tagNames: [],
		});
		expect(
			await owner.query(api.expenses.list, { accountId: account._id })
		).toHaveLength(2);
		expect(
			await owner.query(api.expenses.list, { categoryId: category._id })
		).toHaveLength(2);
		expect(
			await owner.query(api.expenses.list, { cycleId: cycle._id })
		).toHaveLength(2);
	});

	it("combines filters with AND semantics, inclusive start and exclusive end, and pagination", async () => {
		const {
			owner,
			account,
			cycle,
			category,
			tag,
			secondTag,
			first,
			second,
			unlinked,
		} = await setup();
		expect(
			(await owner.query(api.expenses.list, {})).map((expense) => expense._id)
		).toEqual([unlinked._id, second._id, first._id]);
		expect(
			(
				await owner.query(api.expenses.list, {
					accountId: account._id,
					categoryId: category._id,
					cycleId: cycle._id,
					endDate: "2026-01-10",
					startDate: "2026-01-05",
					tagIds: [tag, secondTag],
				})
			).map((expense) => expense._id)
		).toEqual([first._id]);
		expect(
			(await owner.query(api.expenses.list, { startDate: "2026-01-10" })).map(
				(expense) => expense._id
			)
		).toEqual([unlinked._id, second._id]);
		expect(
			(await owner.query(api.expenses.list, { endDate: "2026-01-10" })).map(
				(expense) => expense._id
			)
		).toEqual([first._id]);
		expect(
			(
				await owner.query(api.expenses.list, {
					endDate: "2026-02-01",
					limit: 1,
					offset: 1,
					startDate: "2026-01-05",
				})
			).map((expense) => expense._id)
		).toEqual([first._id]);
		expect(
			await owner.query(api.expenses.list, { offset: 10, tagIds: [] })
		).toEqual([]);
		expect(
			await owner.query(api.expenses.list, {
				categoryId: category._id,
				startDate: "2026-01-11",
			})
		).toEqual([]);
	});

	it("lists only unassigned expenses without changing balances or ledger history", async () => {
		const { owner, stranger, account, first, second, unlinked } = await setup();
		await stranger.mutation(api.expenses.create, {
			accountId: null,
			amount: 99,
			date: "2026-03-01",
		});
		await owner.mutation(api.accounts.archive, {
			accountId: account._id,
			isArchived: true,
		});
		const balanceBefore = await owner.query(api.accounts.get, {
			accountId: account._id,
		});
		const ledgerBefore = await owner.query(api.accounts.listTransactions, {
			accountId: account._id,
		});

		expect(
			(await owner.query(api.expenses.list, { unassigned: true })).map(
				(expense) => expense._id
			)
		).toEqual([unlinked._id]);
		expect(
			(await owner.query(api.expenses.list, { unassigned: false })).map(
				(expense) => expense._id
			)
		).toEqual([unlinked._id, second._id, first._id]);
		expect(
			await owner.query(api.accounts.get, { accountId: account._id })
		).toEqual(balanceBefore);
		expect(
			await owner.query(api.accounts.listTransactions, {
				accountId: account._id,
			})
		).toEqual(ledgerBefore);
	});

	it("combines unassigned with cycle, category, date and all selected tags before pagination", async () => {
		const { owner, cycle, category, tag, secondTag, unlinked } = await setup();
		const matching = await owner.mutation(api.expenses.create, {
			accountId: null,
			amount: 4,
			categoryId: category._id,
			date: "2026-01-05",
			tagIds: [tag, secondTag],
		});
		const missingTag = await owner.mutation(api.expenses.create, {
			accountId: null,
			amount: 5,
			categoryId: category._id,
			date: "2026-01-06",
			tagIds: [tag],
		});
		const filters = {
			categoryId: category._id,
			cycleId: cycle._id,
			endDate: "2026-01-06",
			startDate: "2026-01-05",
			tagIds: [tag, secondTag],
			unassigned: true,
		};
		expect(
			(await owner.query(api.expenses.list, filters)).map(
				(expense) => expense._id
			)
		).toEqual([matching._id]);
		expect(
			await owner.query(api.expenses.list, {
				...filters,
				endDate: "2026-01-05",
			})
		).toEqual([]);
		expect(
			await owner.query(api.expenses.list, { ...filters, offset: 1 })
		).toEqual([]);
		expect(
			(
				await owner.query(api.expenses.list, {
					startDate: "2026-01-06",
					unassigned: true,
				})
			).map((expense) => expense._id)
		).toEqual([unlinked._id, missingTag._id]);
		expect(
			(
				await owner.query(api.expenses.list, {
					endDate: "2026-02-01",
					limit: 1,
					offset: 1,
					unassigned: true,
				})
			).map((expense) => expense._id)
		).toEqual([matching._id]);
	});

	it("keeps uncategorized and unassigned as independent filters", async () => {
		const { owner, account, unlinked } = await setup();
		const assignedUncategorized = await owner.mutation(api.expenses.create, {
			accountId: account._id,
			amount: 5,
			date: "2026-01-08",
		});
		expect(
			(await owner.query(api.expenses.list, { uncategorized: true })).map(
				(expense) => expense._id
			)
		).toEqual([unlinked._id, assignedUncategorized._id]);
		expect(
			(
				await owner.query(api.expenses.list, {
					accountId: account._id,
					uncategorized: true,
				})
			).map((expense) => expense._id)
		).toEqual([assignedUncategorized._id]);
	});

	it("finds older unassigned matches beyond 500 assigned or nonmatching expenses", async () => {
		const {
			test,
			owner,
			account,
			category,
			cycle,
			tag,
			secondTag,
			first,
			unlinked,
		} = await setup();
		const olderUncategorized = await owner.mutation(api.expenses.create, {
			accountId: null,
			amount: 2,
			date: "2025-12-31",
		});
		await owner.mutation(api.expenses.update, {
			accountId: null,
			id: first._id,
		});
		const { userId } = first;
		await test.run(async (ctx) => {
			await forEachSequential(Array.from({ length: 505 }), async () => {
				await ctx.db.insert("expenses", {
					accountId: account._id,
					amount: 1,
					categoryId: category._id,
					createdAt: 0,
					cycleId: cycle._id,
					date: "2026-01-20",
					tagIds: [tag, secondTag],
					userId,
				});
			});
		});
		expect(
			(await owner.query(api.expenses.list, { unassigned: true })).map(
				(expense) => expense._id
			)
		).toContain(first._id);

		await test.run(async (ctx) => {
			await forEachSequential(Array.from({ length: 505 }), async () => {
				await ctx.db.insert("expenses", {
					amount: 1,
					categoryId: category._id,
					createdAt: 0,
					cycleId: cycle._id,
					date: "2026-01-20",
					tagIds: [tag],
					userId,
				});
			});
		});
		await forEachSequential(
			[{}, { cycleId: cycle._id }, { categoryId: category._id }],
			async (filters) => {
				expect(
					(
						await owner.query(api.expenses.list, {
							...filters,
							tagIds: [tag, secondTag],
							unassigned: true,
						})
					).map((expense) => expense._id)
				).toEqual([first._id]);
			}
		);
		expect(
			(
				await owner.query(api.expenses.list, {
					unassigned: true,
					uncategorized: true,
				})
			).map((expense) => expense._id)
		).toEqual([unlinked._id, olderUncategorized._id]);
		expect(
			await owner.query(api.expenses.list, { unassigned: true })
		).toHaveLength(500);
	});

	it("rejects conflicting account filters and validates unassigned filter ownership", async () => {
		const { test, owner, stranger, account, cycle, category, tag } =
			await setup();
		await expect(
			owner.query(api.expenses.list, {
				accountId: account._id,
				unassigned: true,
			})
		).rejects.toThrow("INVALID_FILTERS");
		await expect(
			owner.query(api.expenses.list, {
				categoryId: category._id,
				unassigned: true,
				uncategorized: true,
			})
		).rejects.toThrow("INVALID_FILTERS");
		await expect(
			test.query(api.expenses.list, { unassigned: true })
		).rejects.toThrow("UNAUTHENTICATED");
		await forEachSequential(
			[{ categoryId: category._id }, { cycleId: cycle._id }, { tagIds: [tag] }],
			async (filters) => {
				await expect(
					stranger.query(api.expenses.list, { ...filters, unassigned: true })
				).rejects.toThrow();
			}
		);
	});

	it("limits recent results without exposing another user's expenses", async () => {
		const { owner, stranger, first, second, unlinked } = await setup();
		await stranger.mutation(api.expenses.create, {
			accountId: null,
			amount: 99,
			date: "2026-03-01",
		});
		expect(
			(await owner.query(api.expenses.listRecent, {})).map(
				(expense) => expense._id
			)
		).toEqual([unlinked._id, second._id, first._id]);
		expect(
			(await owner.query(api.expenses.listRecent, { limit: 1 })).map(
				(expense) => expense._id
			)
		).toEqual([unlinked._id]);
		expect(
			await owner.query(api.expenses.listRecent, { limit: 1000 })
		).toHaveLength(3);
	});

	it("rejects invalid pagination and excessive tag filters", async () => {
		const { owner, tag } = await setup();
		await forEachSequential([-1, 0.5], async (offset) => {
			await expect(owner.query(api.expenses.list, { offset })).rejects.toThrow(
				"INVALID_OFFSET"
			);
		});
		await forEachSequential([0, -1, 1.5], async (limit) => {
			await expect(owner.query(api.expenses.list, { limit })).rejects.toThrow(
				"INVALID_LIMIT"
			);
			await expect(
				owner.query(api.expenses.listRecent, { limit })
			).rejects.toThrow("INVALID_LIMIT");
		});
		await expect(
			owner.query(api.expenses.list, {
				tagIds: Array.from({ length: 101 }, () => tag),
			})
		).rejects.toThrow("TOO_MANY_TAG_FILTERS");
	});

	it("requires authentication and ownership for each resource filter and direct lookup", async () => {
		const { test, owner, stranger, account, cycle, category, tag, first } =
			await setup();
		await expect(test.query(api.expenses.list, {})).rejects.toThrow(
			"UNAUTHENTICATED"
		);
		await forEachSequential(
			[{ accountId: account._id }, { categoryId: category._id }],
			async (filters) => {
				await expect(
					stranger.query(api.expenses.list, filters)
				).rejects.toThrow("UNAUTHORIZED");
			}
		);
		await forEachSequential(
			[{ cycleId: cycle._id }, { tagIds: [tag] }],
			async (filters) => {
				await expect(
					stranger.query(api.expenses.list, filters)
				).rejects.toThrow("NOT_FOUND");
			}
		);
		await expect(
			stranger.query(api.expenses.get, { expenseId: first._id })
		).rejects.toThrow("NOT_FOUND");
		await owner.mutation(api.expenses.remove, { id: first._id });
		await expect(
			owner.query(api.expenses.get, { expenseId: first._id })
		).rejects.toThrow("NOT_FOUND");
		await owner.mutation(api.tags.remove, { tagId: tag });
		await expect(
			owner.query(api.expenses.list, { tagIds: [tag] })
		).rejects.toThrow("NOT_FOUND");
	});
});
