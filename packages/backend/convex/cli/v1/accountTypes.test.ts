// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../_generated/api";
import { forEachSequential } from "../../lib/async";
import schema from "../../schema";
import { modules } from "../../test.setup";

const { create, edit, previewCreate, previewEdit } = api.cli.v1.accountTypes;

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

const editFixture = async () => {
	const fixture = await setup();
	const type = await fixture.owner.mutation(api.accountTypes.create, {
		balanceNature: "asset",
		color: "#1199aa",
		icon: "wallet",
		name: "Travel cash",
	});
	return { ...fixture, accountTypeId: type._id, type };
};

describe("guarded CLI account creation", () => {
	it("rejects a changed balance nature without creating an account or opening entry", async () => {
		const { accountTypeId, owner, test } = await editFixture();
		const { accounts } = api.cli.v1;
		const input = {
			accountTypeId,
			date: "2026-09-04",
			name: "Holiday reserve",
			startingBalance: 100,
		};
		const preview = await owner.mutation(accounts.previewCreate, input);
		expect(preview.accountType.balanceNature).toBe("asset");
		const typeEdit = { accountTypeId, balanceNature: "liability" } as const;
		const { editSnapshot } = await owner.query(previewEdit, typeEdit);
		await owner.mutation(edit, {
			...typeEdit,
			expectedEditSnapshot: editSnapshot,
			idempotencyKey: "change-unused-type-nature",
		});

		const request = {
			...input,
			expectedBalanceNature: preview.accountType.balanceNature,
			expectedCurrencyMode: preview.currencyMode,
			expectedPreferredCurrency: preview.preferredCurrency,
			idempotencyKey: "create-reviewed-reserve",
		};
		await expect(
			owner.mutation(accounts.create, request)
		).rejects.toMatchObject({
			data: {
				code: "ACCOUNT_TYPE_BALANCE_NATURE_CONFLICT",
				details: {},
				retryable: false,
			},
		});
		expect(await owner.query(accounts.list, {})).toEqual([]);
		expect(
			await test.run(
				async (ctx) => await ctx.db.query("account_transactions").collect()
			)
		).toEqual([]);

		const fresh = await owner.mutation(accounts.previewCreate, input);
		expect(fresh.accountType.balanceNature).toBe("liability");
		const reviewed = {
			...request,
			expectedBalanceNature: fresh.accountType.balanceNature,
		};
		const saved = await owner.mutation(accounts.create, reviewed);
		expect(saved.accountType.balanceNature).toBe("liability");
		const legacy = {
			...input,
			idempotencyKey: "create-legacy-reserve",
			name: "Legacy reserve",
		};
		const legacySaved = await owner.mutation(accounts.create, legacy);
		expect(legacySaved.accountType.balanceNature).toBe("liability");

		await owner.mutation(api.accountTypes.archive, {
			accountTypeId,
			isArchived: true,
		});
		expect(await owner.mutation(accounts.create, reviewed)).toEqual(saved);
		expect(await owner.mutation(accounts.create, legacy)).toEqual(legacySaved);
		await expect(
			owner.mutation(accounts.create, request)
		).rejects.toMatchObject({
			data: { code: "IDEMPOTENCY_CONFLICT" },
		});
		await expect(
			owner.mutation(accounts.create, {
				...reviewed,
				expectedBalanceNature: undefined,
			})
		).rejects.toMatchObject({
			data: { code: "IDEMPOTENCY_CONFLICT" },
		});
		expect(await owner.query(accounts.list, {})).toHaveLength(2);
		expect(
			(await owner.query(accounts.listTransactions, { accountId: saved.id }))
				.items
		).toEqual([saved.openingTransaction]);
	});
});

describe("guarded CLI account type edit", () => {
	it("keeps an outstanding preview valid on a normalized no-op and replays its original result", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(new Date("2026-09-04T12:00:00Z"));
			const { accountTypeId, owner, type } = await editFixture();
			const realChange = { accountTypeId, name: "Travel wallet" };
			const outstanding = await owner.query(previewEdit, realChange);
			const input = {
				accountTypeId,
				balanceNature: "asset",
				color: "  #1199aa  ",
				icon: "  WALLET  ",
				name: "  Travel cash  ",
			} as const;
			const noop = await owner.query(previewEdit, input);
			expect(noop.after).toEqual(noop.before);
			vi.setSystemTime(new Date("2026-09-04T12:01:00Z"));
			const request = {
				...input,
				expectedEditSnapshot: noop.editSnapshot,
				idempotencyKey: "type-normalized-noop",
			};
			await expect(
				owner.mutation(edit, {
					...request,
					expectedEditSnapshot: outstanding.editSnapshot,
				})
			).rejects.toMatchObject({
				data: { code: "ACCOUNT_TYPE_EDIT_CONFLICT" },
			});
			const saved = await owner.mutation(edit, request);
			expect(saved.updatedAt).toBe("2026-09-04T12:00:00.000Z");
			expect(
				await owner.query(api.accountTypes.get, { accountTypeId })
			).toEqual(type);
			const changed = await owner.mutation(edit, {
				...realChange,
				expectedEditSnapshot: outstanding.editSnapshot,
				idempotencyKey: "type-outstanding-preview",
			});
			expect(changed.name).toBe("Travel wallet");
			expect(await owner.mutation(edit, request)).toEqual(saved);
			expect(
				await owner.query(api.cli.v1.accountTypes.list, {})
			).toContainEqual(changed);
		} finally {
			vi.useRealTimers();
		}
	});

	it("previews and updates an unused archived type by ID while preserving omitted styling and state", async () => {
		const { accountTypeId, owner, test } = await editFixture();
		await owner.mutation(api.accountTypes.archive, {
			accountTypeId,
			isArchived: true,
		});
		const input = {
			accountTypeId,
			balanceNature: "liability",
			icon: " VAULT ",
			name: "  TRAVEL CASH  ",
		} as const;
		const before = await owner.query(api.accountTypes.get, { accountTypeId });
		const preview = await owner.query(previewEdit, input);
		expect(preview.before).toMatchObject({
			balanceNature: "asset",
			icon: "wallet",
			name: "Travel cash",
		});
		expect(preview.after).toEqual({
			balanceNature: "liability",
			color: "#1199AA",
			icon: "vault",
			id: accountTypeId,
			isArchived: true,
			name: "TRAVEL CASH",
		});
		expect(await owner.query(api.accountTypes.get, { accountTypeId })).toEqual(
			before
		);
		expect(
			await test.run(
				async (ctx) => await ctx.db.query("cli_idempotency").collect()
			)
		).toEqual([]);
		const result = await owner.mutation(edit, {
			...input,
			expectedEditSnapshot: preview.editSnapshot,
			idempotencyKey: "edit-archived-type",
		});
		expect(result).toMatchObject(preview.after);
		expect(
			await owner.query(api.accountTypes.get, { accountTypeId })
		).toMatchObject({
			_id: accountTypeId,
			balanceNature: "liability",
			isArchived: true,
			normalizedName: "travel cash",
		});
	});

	it("rejects a name claimed by an archived type after preview", async () => {
		const { accountTypeId, owner, type } = await editFixture();
		const input = { accountTypeId, name: "Offshore cash" };
		const { editSnapshot } = await owner.query(previewEdit, input);
		const duplicate = await owner.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "  OFFSHORE CASH  ",
		});
		await owner.mutation(api.accountTypes.archive, {
			accountTypeId: duplicate._id,
			isArchived: true,
		});
		await expect(
			owner.mutation(edit, {
				...input,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: "blocked-name-edit",
			})
		).rejects.toMatchObject({ data: { code: "ACCOUNT_TYPE_NAME_CONFLICT" } });
		await expect(owner.query(previewEdit, input)).rejects.toMatchObject({
			data: { code: "ACCOUNT_TYPE_NAME_CONFLICT" },
		});
		expect(await owner.query(api.accountTypes.get, { accountTypeId })).toEqual(
			type
		);
	});

	it("blocks a nature change if a reference appeared after preview, even when the account is archived", async () => {
		const { accountTypeId, owner, type } = await editFixture();
		const input = {
			accountTypeId,
			balanceNature: "liability",
			color: "#aabbcc",
		} as const;
		const { editSnapshot } = await owner.query(previewEdit, input);
		const account = await owner.mutation(api.accounts.create, {
			accountTypeId,
			name: "Holiday wallet",
			startingBalance: 80,
		});
		await owner.mutation(api.accounts.archive, {
			accountId: account._id,
			isArchived: true,
		});

		await expect(
			owner.mutation(edit, {
				...input,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: "blocked-nature-edit",
			})
		).rejects.toMatchObject({
			data: { code: "ACCOUNT_TYPE_BALANCE_NATURE_IN_USE" },
		});
		await expect(owner.query(previewEdit, input)).rejects.toMatchObject({
			data: { code: "ACCOUNT_TYPE_BALANCE_NATURE_IN_USE" },
		});
		expect(await owner.query(api.accountTypes.get, { accountTypeId })).toEqual(
			type
		);

		const metadataEdit = {
			accountTypeId,
			balanceNature: "asset",
			color: "#aabbcc",
			name: "Travel wallet",
		} as const;
		const beforeAccount = await owner.query(api.accounts.get, {
			accountId: account._id,
		});
		const ledger = () =>
			owner.query(api.cli.v1.accounts.listTransactions, {
				accountId: account._id,
			});
		const beforeLedger = await ledger();
		const preview = await owner.query(previewEdit, metadataEdit);
		await owner.mutation(edit, {
			...metadataEdit,
			expectedEditSnapshot: preview.editSnapshot,
			idempotencyKey: "metadata-only-edit",
		});
		expect(
			await owner.query(api.accounts.get, { accountId: account._id })
		).toEqual({
			...beforeAccount,
			accountTypeColor: "#AABBCC",
			accountTypeName: "Travel wallet",
		});
		expect(await ledger()).toEqual(beforeLedger);
	});

	it("binds preview to the exact target and patch and rejects stale Web changes", async () => {
		const { accountTypeId, owner } = await editFixture();
		const input = { accountTypeId, name: "Travel wallet" };
		const { editSnapshot } = await owner.query(previewEdit, input);
		const request = {
			...input,
			expectedEditSnapshot: editSnapshot,
			idempotencyKey: "stale-account-type-edit",
		};
		const other = await owner.mutation(api.accountTypes.create, {
			balanceNature: "asset",
			name: "Other wallet",
		});
		await forEachSequential(
			[{ name: "Summer wallet" }, { accountTypeId: other._id }],
			async (change) => {
				await expect(
					owner.mutation(edit, { ...request, ...change })
				).rejects.toMatchObject({
					data: { code: "ACCOUNT_TYPE_EDIT_CONFLICT", retryable: false },
				});
			}
		);
		const updated = await owner.mutation(api.accountTypes.update, {
			accountTypeId,
			color: null,
		});
		await expect(owner.mutation(edit, request)).rejects.toMatchObject({
			data: { code: "ACCOUNT_TYPE_EDIT_CONFLICT" },
		});
		expect(await owner.query(api.accountTypes.get, { accountTypeId })).toEqual(
			updated
		);
		expect(updated.color).toBeUndefined();
	});

	it("replays the original result after a subsequent edit without writing again", async () => {
		const { accountTypeId, owner } = await editFixture();
		const input = { accountTypeId, color: "#123456" };
		const { editSnapshot } = await owner.query(previewEdit, input);
		const request = {
			...input,
			agent: true,
			expectedEditSnapshot: editSnapshot,
			idempotencyKey: "retry-account-type-edit",
		};
		const result = await owner.mutation(edit, request);
		const later = await owner.mutation(api.accountTypes.update, {
			accountTypeId,
			color: "#654321",
		});
		expect(await owner.mutation(edit, request)).toEqual(result);
		await expect(
			owner.mutation(edit, { ...request, color: "#111111" })
		).rejects.toMatchObject({ data: { code: "IDEMPOTENCY_CONFLICT" } });
		expect(await owner.query(api.accountTypes.get, { accountTypeId })).toEqual(
			later
		);
	});

	it("does not disclose foreign targets through preview or commit", async () => {
		const { accountTypeId, owner, test } = await editFixture();
		const stranger = test.withIdentity({
			subject: "other-cli-account-type-owner",
		});
		await stranger.mutation(api.users.create, {
			email: "stranger@example.com",
		});
		const input = { accountTypeId, name: "Private wallet" };
		const { editSnapshot } = await owner.query(previewEdit, input);
		await expect(stranger.query(previewEdit, input)).rejects.toMatchObject({
			data: { code: "RESOURCE_NOT_FOUND" },
		});
		await expect(
			stranger.mutation(edit, {
				...input,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: "foreign-type-edit",
			})
		).rejects.toMatchObject({ data: { code: "RESOURCE_NOT_FOUND" } });
	});

	it.each([
		{ code: "INVALID_INPUT", fields: {} },
		{ code: "INVALID_INPUT", fields: { name: "  " } },
		{ code: "INVALID_INPUT", fields: { name: "Bad\nName" } },
		{ code: "INVALID_ACCOUNT_TYPE_ICON", fields: { icon: "  " } },
		{ code: "INVALID_ACCOUNT_TYPE_ICON", fields: { icon: "unsupported" } },
		{ code: "INVALID_ACCOUNT_TYPE_COLOR", fields: { color: "  " } },
		{ code: "INVALID_ACCOUNT_TYPE_COLOR", fields: { color: "#fff" } },
	])("rejects invalid or empty patches: $fields", async ({ fields, code }) => {
		const { accountTypeId, owner, type } = await editFixture();
		const input = { accountTypeId, ...fields };
		await expect(owner.query(previewEdit, input)).rejects.toMatchObject({
			data: { code },
		});
		await expect(
			owner.mutation(edit, {
				...input,
				expectedEditSnapshot: "a".repeat(64),
				idempotencyKey: "invalid-type-edit",
			})
		).rejects.toMatchObject({ data: { code } });
		expect(await owner.query(api.accountTypes.get, { accountTypeId })).toEqual(
			type
		);
	});
});
