// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
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
		name: "Wallet",
		accountTypeId: accountType._id,
		startingBalance: 100,
	});
	const cycle = await owner.mutation(api.cycles.create, {
		name: "January",
		startDate: "2026-01-01",
		endDate: "2026-02-01",
	});
	const categoryType = await owner.mutation(api.categories.createType, {
		name: "Essential",
		color: "#123456",
	});
	if (!categoryType) {
		throw new Error("Expected created category type");
	}
	const category = await owner.mutation(api.categories.create, {
		cycleId: cycle._id,
		name: "Food",
		categoryTypeId: categoryType._id,
		icon: "apple",
	});
	if (!category) {
		throw new Error("Expected created category");
	}
	const tag = await owner.mutation(api.tags.create, { name: "shared" });
	const secondTag = await owner.mutation(api.tags.create, { name: "special" });
	const first = await owner.mutation(api.expenses.create, {
		amount: 10,
		date: "2026-01-05",
		accountId: account._id,
		categoryId: category._id,
		tagIds: [tag, secondTag],
		spentOn: "Lunch",
	});
	const second = await owner.mutation(api.expenses.create, {
		amount: 20,
		date: "2026-01-10",
		accountId: account._id,
		categoryId: category._id,
		tagIds: [tag],
	});
	const unlinked = await owner.mutation(api.expenses.create, {
		amount: 3,
		date: "2026-02-01",
		accountId: null,
	});
	return {
		test,
		owner,
		stranger,
		account,
		cycle,
		category,
		tag,
		secondTag,
		first,
		second,
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
			categoryName: "Food",
			categoryIcon: "apple",
			categoryTypeColor: "#123456",
			cycleName: "January",
			tagNames: ["shared", "special"],
			amount: 10,
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
					cycleId: cycle._id,
					categoryId: category._id,
					startDate: "2026-01-05",
					endDate: "2026-01-10",
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
					startDate: "2026-01-05",
					endDate: "2026-02-01",
					offset: 1,
					limit: 1,
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

	it("limits recent results without exposing another user's expenses", async () => {
		const { owner, stranger, first, second, unlinked } = await setup();
		await stranger.mutation(api.expenses.create, {
			amount: 99,
			date: "2026-03-01",
			accountId: null,
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
		for (const offset of [-1, 0.5]) {
			await expect(owner.query(api.expenses.list, { offset })).rejects.toThrow(
				"INVALID_OFFSET"
			);
		}
		for (const limit of [0, -1, 1.5]) {
			await expect(owner.query(api.expenses.list, { limit })).rejects.toThrow(
				"INVALID_LIMIT"
			);
			await expect(
				owner.query(api.expenses.listRecent, { limit })
			).rejects.toThrow("INVALID_LIMIT");
		}
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
		for (const filters of [
			{ accountId: account._id },
			{ categoryId: category._id },
		]) {
			await expect(stranger.query(api.expenses.list, filters)).rejects.toThrow(
				"UNAUTHORIZED"
			);
		}
		for (const filters of [{ cycleId: cycle._id }, { tagIds: [tag] }]) {
			await expect(stranger.query(api.expenses.list, filters)).rejects.toThrow(
				"NOT_FOUND"
			);
		}
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
