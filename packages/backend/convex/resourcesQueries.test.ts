// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "resource-owner" });
	const stranger = test.withIdentity({ subject: "resource-stranger" });
	await owner.mutation(api.users.create, { email: "owner@example.com" });
	await stranger.mutation(api.users.create, { email: "stranger@example.com" });
	const cycle = await owner.mutation(api.cycles.create, {
		name: "January",
		startDate: "2026-01-01",
		endDate: "2026-02-01",
	});
	return { test, owner, stranger, cycle };
};

describe("web categories and tags", () => {
	it("counts category type usage and detaches categories when a type is deleted", async () => {
		const { owner, cycle } = await setup();
		const type = await owner.mutation(api.categories.createType, {
			name: "Custom",
			color: "#112233",
		});
		if (!type) {
			throw new Error("Expected category type");
		}
		expect(type.order).toBe(3);
		const unused = await owner.mutation(api.categories.createType, {
			name: "Unused",
			order: 20,
		});
		const category = await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Food",
			categoryTypeId: type._id,
		});
		await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Rent",
			categoryTypeId: type._id,
		});
		await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Other",
			order: 10,
			isHidden: true,
		});
		expect(await owner.query(api.categories.listTypesWithUsage, {})).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ _id: type._id, usageCount: 2 }),
				expect.objectContaining({ _id: unused?._id, usageCount: 0 }),
			])
		);
		expect(
			await owner.query(api.categories.list, { cycleId: cycle._id })
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "Food",
					typeName: "Custom",
					typeColor: "#112233",
				}),
				expect.objectContaining({ name: "Other", isHidden: true }),
			])
		);
		await expect(
			owner.mutation(api.categories.createType, { name: "Custom" })
		).rejects.toThrow("already exists");
		await expect(
			owner.mutation(api.categories.updateType, {
				id: type._id,
				name: "Unused",
			})
		).rejects.toThrow("already exists");
		expect(
			await owner.mutation(api.categories.updateType, {
				id: type._id,
				name: "Custom",
				color: "#445566",
				order: 5,
			})
		).toMatchObject({ name: "Custom", color: "#445566", order: 5 });
		expect(
			await owner.mutation(api.categories.updateType, {
				id: type._id,
				name: "Renamed",
				color: "#778899",
				order: 6,
			})
		).toMatchObject({ name: "Renamed" });
		expect(
			await owner.mutation(api.categories.deleteType, { id: type._id })
		).toEqual({ success: true });
		if (!category) {
			throw new Error("Expected category");
		}
		expect(
			await owner.query(api.categories.get, { id: category._id })
		).not.toHaveProperty("categoryTypeId");
		expect(
			(await owner.query(api.categories.listTypes, {})).map((item) => item._id)
		).not.toContain(type._id);
	});

	it("blocks foreign and deleted category types and categories", async () => {
		const { owner, stranger, cycle } = await setup();
		const type = await owner.mutation(api.categories.createType, {
			name: "Private",
		});
		const category = await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Private",
		});
		if (!(type && category)) {
			throw new Error("Expected resources");
		}
		await expect(
			stranger.mutation(api.categories.updateType, {
				id: type._id,
				name: "Stolen",
			})
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			stranger.mutation(api.categories.deleteType, { id: type._id })
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			stranger.query(api.categories.get, { id: category._id })
		).rejects.toThrow("NOT_FOUND");
		await expect(
			stranger.query(api.categories.list, { cycleId: cycle._id })
		).rejects.toThrow("UNAUTHORIZED");
		await owner.mutation(api.categories.deleteType, { id: type._id });
		await expect(
			owner.mutation(api.categories.updateType, { id: type._id, name: "Gone" })
		).rejects.toThrow("UNAUTHORIZED");
		await expect(
			owner.mutation(api.categories.deleteType, { id: type._id })
		).rejects.toThrow("UNAUTHORIZED");
		await owner.mutation(api.categories.remove, { categoryId: category._id });
		await expect(
			owner.query(api.categories.get, { id: category._id })
		).rejects.toThrow("NOT_FOUND");
	});

	it("offers only previous-cycle names not already used, case insensitively", async () => {
		const { owner, cycle } = await setup();
		expect(
			await owner.query(api.categories.listPreviousCycleUnused, {
				currentCycleId: cycle._id,
			})
		).toEqual([]);
		await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Food",
		});
		const rent = await owner.mutation(api.categories.create, {
			cycleId: cycle._id,
			name: "Rent",
		});
		const next = await owner.mutation(api.cycles.create, {
			name: "February",
			startDate: "2026-02-01",
			endDate: "2026-03-01",
		});
		await owner.mutation(api.categories.create, {
			cycleId: next._id,
			name: "FOOD",
		});
		expect(
			await owner.query(api.categories.listPreviousCycleUnused, {
				currentCycleId: next._id,
			})
		).toEqual([rent]);
	});

	it("seeds defaults once for a legacy user without category types", async () => {
		const test = convexTest(schema, modules);
		const owner = test.withIdentity({ subject: "legacy-types" });
		await test.run(
			async (ctx) =>
				await ctx.db.insert("users", {
					clerkId: "legacy-types",
					email: "legacy@example.com",
					createdAt: 0,
				})
		);
		await owner.mutation(api.categories.seedDefaults, {});
		await owner.mutation(api.categories.seedDefaults, {});
		expect(
			(await owner.query(api.categories.listTypes, {})).map((type) => type.name)
		).toEqual(["Needs", "Wants", "Savings"]);
	});

	it("deduplicates tags, reports usage, and removes only the deleted tag from expenses", async () => {
		const { owner, cycle } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Shared" });
		const otherId = await owner.mutation(api.tags.create, { name: "Other" });
		expect(await owner.mutation(api.tags.create, { name: "Shared" })).toBe(
			tagId
		);
		const expense = await owner.mutation(api.expenses.create, {
			amount: 5,
			date: "2026-01-03",
			accountId: null,
			tagIds: [tagId, otherId],
		});
		await owner.mutation(api.expenses.create, {
			amount: 2,
			date: "2026-01-04",
			accountId: null,
			tagIds: [tagId],
		});
		const untouched = await owner.mutation(api.expenses.create, {
			amount: 1,
			date: "2026-01-05",
			accountId: null,
		});
		expect(await owner.query(api.tags.listWithUsage, {})).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ _id: tagId, usageCount: 2 }),
				expect.objectContaining({ _id: otherId, usageCount: 1 }),
			])
		);
		expect(
			await owner.mutation(api.tags.update, { tagId, name: "Renamed" })
		).toMatchObject({ name: "Renamed" });
		expect(await owner.mutation(api.tags.remove, { tagId })).toEqual({
			success: true,
		});
		expect(
			await owner.query(api.expenses.get, { expenseId: expense._id })
		).toMatchObject({
			tagIds: [otherId],
			tagNames: ["Other"],
			revision: 2,
			lastModifiedSource: "web",
			cycleId: cycle._id,
		});
		expect(
			await owner.query(api.expenses.get, { expenseId: untouched._id })
		).toMatchObject({ revision: 1, tagNames: [] });
		expect(
			(await owner.query(api.tags.list, {})).map((tag) => tag._id)
		).toEqual([otherId]);
		await owner.mutation(api.tags.remove, { tagId: otherId });
		expect(await owner.query(api.tags.listWithUsage, {})).toEqual([]);
	});

	it("rejects tag modifications by strangers or after deletion", async () => {
		const { owner, stranger } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Private" });
		expect(await stranger.query(api.tags.list, {})).toEqual([]);
		await expect(
			stranger.mutation(api.tags.update, { tagId, name: "Stolen" })
		).rejects.toThrow("Tag not found");
		await expect(stranger.mutation(api.tags.remove, { tagId })).rejects.toThrow(
			"Tag not found"
		);
		await owner.mutation(api.tags.remove, { tagId });
		await expect(
			owner.mutation(api.tags.update, { tagId, name: "Gone" })
		).rejects.toThrow("Tag not found");
		await expect(owner.mutation(api.tags.remove, { tagId })).rejects.toThrow(
			"Tag not found"
		);
	});
});
