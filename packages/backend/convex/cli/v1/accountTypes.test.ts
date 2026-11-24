// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { forEachSequential } from "../../lib/async";
import schema from "../../schema";
import { modules } from "../../test.setup";

const { create, previewCreate } = api.cli.v1.accountTypes;

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "cli-account-type-owner" });
	const userId = await owner.mutation(api.users.create, {
		email: "owner@example.com",
	});
	return { owner, test, userId };
};

const proposal = { balanceNature: "liability", name: "Mortgage" } as const;

describe("standalone CLI account type creation", () => {
	it("previews without writes and creates only a type usable by accounts add", async () => {
		const { owner, test } = await setup();
		const types = await owner.query(api.accountTypes.list, {});
		const [cashType] = types;
		if (!cashType) {
			throw new Error("Missing seeded account type");
		}
		const cash = await owner.mutation(api.accounts.create, {
			accountTypeId: cashType._id,
			name: "Cash account",
			startingBalance: 25,
		});
		const readFinancialState = async () =>
			await Promise.all([
				owner.query(api.cli.v1.accounts.list, {}),
				owner.query(api.cli.v1.accounts.listTransactions, {
					accountId: cash._id,
				}),
				owner.query(api.users.get, {}),
			]);
		const before = await readFinancialState();
		const input = { ...proposal, name: "  Mortgage  " };
		expect(await owner.query(previewCreate, input)).toEqual(proposal);
		expect(await owner.query(api.accountTypes.list, {})).toEqual(types);
		expect(
			await test.run(
				async (ctx) => await ctx.db.query("cli_idempotency").collect()
			)
		).toEqual([]);

		const request = { ...input, idempotencyKey: "mortgage-type-01" };
		const type = await owner.mutation(create, request);
		expect(type).toEqual({ ...proposal, id: expect.any(String) });
		expect(await owner.mutation(create, request)).toEqual(type);
		await expect(
			owner.mutation(create, { ...request, balanceNature: "asset" })
		).rejects.toMatchObject({ data: { code: "IDEMPOTENCY_CONFLICT" } });
		expect(await readFinancialState()).toEqual(before);
		expect(await owner.query(api.accountTypes.list, {})).toEqual([
			...types,
			expect.objectContaining({
				...proposal,
				_id: type.id,
				isArchived: false,
				normalizedName: "mortgage",
				order: 6,
			}),
		]);
		expect(await owner.query(api.cli.v1.accountTypes.list, {})).toContainEqual(
			expect.objectContaining({
				...type,
				color: null,
				icon: null,
				isArchived: false,
			})
		);
		expect(
			await owner.mutation(api.cli.v1.accounts.create, {
				accountTypeId: type.id,
				date: "2026-07-10",
				idempotencyKey: "mortgage-account-01",
				name: "Home mortgage",
				startingBalance: -500,
			})
		).toMatchObject({
			accountType: type,
			currentBalance: -500,
			isDefault: false,
		});
	});

	it("rechecks the name at commit, including archived names, and scopes names and keys to each user", async () => {
		const { owner, test } = await setup();
		const other = test.withIdentity({ subject: "another-account-type-owner" });
		await other.mutation(api.users.create, { email: "another@example.com" });
		const request = { ...proposal, idempotencyKey: "same-type-key" };
		expect(await owner.query(previewCreate, proposal)).toEqual(proposal);

		const webType = await owner.mutation(api.accountTypes.create, {
			...proposal,
			name: "  mOrTgAgE  ",
		});
		await owner.mutation(api.accountTypes.archive, {
			accountTypeId: webType._id,
			isArchived: true,
		});
		await expect(owner.query(previewCreate, proposal)).rejects.toMatchObject({
			data: { code: "ACCOUNT_TYPE_NAME_CONFLICT" },
		});
		await expect(owner.mutation(create, request)).rejects.toMatchObject({
			data: { code: "ACCOUNT_TYPE_NAME_CONFLICT" },
		});
		const ownType = await owner.mutation(create, {
			...request,
			balanceNature: "asset",
			name: "Brokerage",
		});
		expect(ownType.balanceNature).toBe("asset");
		const otherType = await other.mutation(create, request);
		expect(otherType.id).not.toBe(ownType.id);
		const active = await owner.query(api.cli.v1.accountTypes.list, {});
		const all = await owner.query(api.cli.v1.accountTypes.list, {
			includeArchived: true,
		});
		expect(active.map((type) => type.id)).toContain(ownType.id);
		expect(active.map((type) => type.id)).not.toContain(webType._id);
		expect(all).toContainEqual(
			expect.objectContaining({ id: webType._id, isArchived: true })
		);
		expect(all.map((type) => type.id)).not.toContain(otherType.id);
	});

	it("requires an authenticated, registered owner for both preview and commit", async () => {
		const { test } = await setup();
		const unregistered = test.withIdentity({ subject: "unregistered" });
		const request = { ...proposal, idempotencyKey: "unauthorized-type" };
		await expect(test.query(previewCreate, proposal)).rejects.toMatchObject({
			data: { code: "AUTHENTICATION_REQUIRED" },
		});
		await expect(test.mutation(create, request)).rejects.toMatchObject({
			data: { code: "AUTHENTICATION_REQUIRED" },
		});
		await expect(
			unregistered.query(previewCreate, proposal)
		).rejects.toMatchObject({
			data: { code: "ACCOUNT_SETUP_REQUIRED" },
		});
		await expect(unregistered.mutation(create, request)).rejects.toMatchObject({
			data: { code: "ACCOUNT_SETUP_REQUIRED" },
		});
	});

	it.each(["   ", "Bad\u001bname", "Name\n"])(
		"rejects invalid names in preview and commit without writing: %j",
		async (name) => {
			const { owner } = await setup();
			const input = { ...proposal, name };
			await expect(owner.query(previewCreate, input)).rejects.toMatchObject({
				data: { code: "INVALID_INPUT" },
			});
			await expect(
				owner.mutation(create, { ...input, idempotencyKey: "invalid-type" })
			).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
			expect(await owner.query(api.accountTypes.list, {})).toHaveLength(6);
		}
	);

	it("appends after the last archived type, enforces capacity, and still allows replay", async () => {
		const { owner, test, userId } = await setup();
		const archivedOrders = Array.from({ length: 93 }, (_, index) => index + 10);
		await test.run(async (ctx) => {
			await forEachSequential(archivedOrders, async (order) => {
				await ctx.db.insert("account_types", {
					balanceNature: "asset",
					createdAt: 0,
					isArchived: true,
					name: `Archived ${order}`,
					normalizedName: `archived ${order}`,
					order,
					userId,
				});
			});
		});
		const overflow = { ...proposal, name: "Overflow" };
		expect(await owner.query(previewCreate, overflow)).toEqual(overflow);
		const request = { ...proposal, idempotencyKey: "last-type-key" };
		const type = await owner.mutation(create, request);
		const all = await owner.query(api.cli.v1.accountTypes.list, {
			includeArchived: true,
		});
		expect(all).toHaveLength(100);
		const [last] = all.slice(-1);
		expect(last).toMatchObject({ id: type.id, order: 103 });
		await expect(owner.query(previewCreate, overflow)).rejects.toMatchObject({
			data: { code: "ACCOUNT_TYPE_LIMIT_REACHED" },
		});
		await expect(
			owner.mutation(create, {
				...overflow,
				idempotencyKey: "overflow-type-key",
			})
		).rejects.toMatchObject({ data: { code: "ACCOUNT_TYPE_LIMIT_REACHED" } });
		expect(await owner.mutation(create, request)).toEqual(type);
	});
});
