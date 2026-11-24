// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { forEachSequential } from "../../lib/async";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = async () => {
	const test = convexTest(schema, modules);
	const owner = test.withIdentity({ subject: "tag-owner" });
	const userId = await owner.mutation(api.users.create, {
		email: "owner@example.com",
	});
	return { owner, test, userId };
};

const { previewTagRename: preview, renameTag: rename } = api.cli.v1.resources;
const error = (code: string) => ({ data: { code, retryable: false } });

const request = (
	tagId: string,
	name: string,
	expectedEditSnapshot: string
) => ({
	expectedEditSnapshot,
	idempotencyKey: "rename-tag-key",
	name,
	tagId,
});

describe("standalone CLI tag rename", () => {
	it("previews without writing and relabels an in-use tag without changing expense or financial state", async () => {
		const { owner } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Work" });
		const [type] = await owner.query(api.accountTypes.list, {});
		if (!type) {
			throw new Error("Expected an account type");
		}
		await owner.mutation(api.cycles.create, {
			endDate: "2026-02-01",
			name: "January",
			startDate: "2026-01-01",
		});
		const { id: accountId } = await owner.mutation(api.cli.v1.accounts.create, {
			accountTypeId: type._id,
			date: "2026-01-01",
			idempotencyKey: "seed-rename-account",
			name: "Wallet",
			startingBalance: 100,
		});
		const { id: expenseId } = await owner.mutation(api.cli.v1.expenses.create, {
			accountId,
			amount: 5,
			date: "2026-01-02",
			idempotencyKey: "seed-rename-expense",
			tagIds: [tagId],
		});
		const readExpense = () => owner.query(api.expenses.get, { expenseId });
		const readTagUsage = () => owner.query(api.tags.listWithUsage, {});
		const readFinancialState = () =>
			Promise.all([
				owner.query(api.cli.v1.accounts.get, { accountId }),
				owner.query(api.cli.v1.accounts.listTransactions, { accountId }),
			]);
		const before = await readExpense();
		const financialState = await readFinancialState();
		const tags = await readTagUsage();
		const name = "  Work travel  ";
		const proposed = await owner.query(preview, { name, tagId });
		expect(proposed).toEqual({
			beforeName: "Work",
			editSnapshot: expect.any(String),
			id: tagId,
			name: "Work travel",
		});
		expect(await readTagUsage()).toEqual(tags);

		expect(
			await owner.mutation(rename, request(tagId, name, proposed.editSnapshot))
		).toEqual({ id: tagId, name: "Work travel" });
		expect(await readTagUsage()).toEqual([
			{ ...tags[0], _id: tagId, name: "Work travel", usageCount: 1 },
		]);
		expect(await readExpense()).toEqual({
			...before,
			tagIds: [tagId],
			tagNames: ["Work travel"],
		});
		expect(await readFinancialState()).toEqual(financialState);
	});

	it("allows case and padding cleanup but rejects exact no-ops and other tags' normalized names", async () => {
		const { owner } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: " Work " });
		const duplicate = await owner.mutation(api.tags.create, { name: "wORK" });
		await expect(
			owner.query(preview, { name: "work", tagId })
		).rejects.toMatchObject(error("TAG_NAME_CONFLICT"));
		await owner.mutation(api.tags.update, { name: "Other", tagId: duplicate });
		const clean = await owner.query(preview, { name: "Work", tagId });
		expect(
			await owner.mutation(rename, request(tagId, "Work", clean.editSnapshot))
		).toEqual({ id: tagId, name: "Work" });
		await expect(
			owner.query(preview, { name: "  Work  ", tagId })
		).rejects.toMatchObject(error("TAG_RENAME_NO_CHANGE"));
		const changeCase = await owner.query(preview, { name: "WORK", tagId });
		expect(
			await owner.mutation(rename, {
				...request(tagId, "WORK", changeCase.editSnapshot),
				idempotencyKey: "rename-case-key",
			})
		).toEqual({ id: tagId, name: "WORK" });
	});

	it("repairs legacy names without accepting invalid new names", async () => {
		const { owner } = await setup();
		const oldName = `\u001b[31m\n${"x".repeat(101)}`;
		const tagId = await owner.mutation(api.tags.create, { name: oldName });
		await owner.mutation(api.tags.update, {
			name: oldName,
			tagId: await owner.mutation(api.tags.create, { name: "Other" }),
		});
		const newName = "🌱".repeat(100);
		const proposed = await owner.query(preview, { name: newName, tagId });
		expect(proposed.beforeName).toBe(oldName);
		await forEachSequential(
			[" ", "🌱".repeat(101), "Work\u0007", "\nWork", "Work\u2028tag"],
			async (name) => {
				await expect(
					owner.query(preview, { name, tagId })
				).rejects.toMatchObject(error("INVALID_INPUT"));
				await expect(
					owner.mutation(rename, request(tagId, name, proposed.editSnapshot))
				).rejects.toMatchObject(error("INVALID_INPUT"));
			}
		);
		expect(
			await owner.mutation(
				rename,
				request(tagId, newName, proposed.editSnapshot)
			)
		).toEqual({ id: tagId, name: newName });
	});

	it("requires a registered owner and does not distinguish malformed, missing, or foreign IDs", async () => {
		const { owner, test, userId } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Private" });
		const name = "Renamed";
		const proposed = await owner.query(preview, { name, tagId });
		const args = request(tagId, name, proposed.editSnapshot);
		const other = test.withIdentity({ subject: "another-owner" });
		await forEachSequential(
			[
				[test, "AUTHENTICATION_REQUIRED"],
				[other, "ACCOUNT_SETUP_REQUIRED"],
			] as const,
			async ([client, code]) => {
				await expect(
					client.query(preview, { name, tagId })
				).rejects.toMatchObject(error(code));
				await expect(client.mutation(rename, args)).rejects.toMatchObject(
					error(code)
				);
			}
		);
		await other.mutation(api.users.create, { email: "other@example.com" });
		await other.mutation(api.tags.create, { name });
		const notFound = error("RESOURCE_NOT_FOUND");
		await expect(other.query(preview, { name, tagId })).rejects.toMatchObject(
			notFound
		);
		await expect(other.mutation(rename, args)).rejects.toMatchObject(notFound);
		await expect(
			owner.query(preview, { name, tagId: "invalid" })
		).rejects.toMatchObject(notFound);
		await expect(
			owner.mutation(rename, { ...args, tagId: userId })
		).rejects.toMatchObject(notFound);
		await owner.mutation(api.tags.remove, { tagId });
		await expect(owner.query(preview, { name, tagId })).rejects.toMatchObject(
			notFound
		);
		await expect(owner.mutation(rename, args)).rejects.toMatchObject(notFound);
	});

	it("binds the preview to the exact ID, requested name, and raw stored name", async () => {
		const { owner } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Old" });
		const otherId = await owner.mutation(api.tags.create, { name: "Old " });
		await owner.mutation(api.tags.update, { name: "Old", tagId: otherId });
		const name = "New";
		const { editSnapshot } = await owner.query(preview, { name, tagId });
		const args = request(tagId, name, editSnapshot);
		const conflict = error("TAG_RENAME_CONFLICT");
		await expect(
			owner.mutation(rename, { ...args, tagId: otherId })
		).rejects.toMatchObject(conflict);
		await expect(
			owner.mutation(rename, { ...args, name: "Edited request" })
		).rejects.toMatchObject(conflict);
		await expect(
			owner.mutation(rename, { ...args, expectedEditSnapshot: "invalid" })
		).rejects.toMatchObject(error("INVALID_INPUT"));
		await owner.mutation(api.tags.update, { name: " Old ", tagId });
		await expect(owner.mutation(rename, args)).rejects.toMatchObject(conflict);
		expect(await owner.query(api.tags.list, {})).toEqual([
			expect.objectContaining({ _id: tagId, name: " Old " }),
			expect.objectContaining({ _id: otherId, name: "Old" }),
		]);
	});

	it("rechecks a name claimed after preview and rejects competing CLI saves", async () => {
		const { owner } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Old" });
		const otherId = await owner.mutation(api.tags.create, { name: "Other" });
		const name = "New";
		const { editSnapshot } = await owner.query(preview, { name, tagId });
		const args = request(tagId, name, editSnapshot);
		await owner.mutation(api.tags.update, { name: " nEW ", tagId: otherId });
		await expect(owner.mutation(rename, args)).rejects.toMatchObject(
			error("TAG_NAME_CONFLICT")
		);
		await owner.mutation(api.tags.update, { name: "Other", tagId: otherId });
		const second = await owner.query(preview, {
			name: " new ",
			tagId: otherId,
		});
		const results = await Promise.allSettled([
			owner.mutation(rename, args),
			owner.mutation(rename, {
				...request(otherId, " new ", second.editSnapshot),
				idempotencyKey: "other-rename-key",
			}),
		]);
		expect(results).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ status: "fulfilled" }),
				expect.objectContaining({
					reason: expect.objectContaining({
						data: expect.objectContaining({
							code: "TAG_NAME_CONFLICT",
							retryable: false,
						}),
					}),
					status: "rejected",
				}),
			])
		);
		expect(
			(await owner.query(api.tags.list, {})).filter(
				(tag) => tag.name.toLowerCase() === "new"
			)
		).toHaveLength(1);
	});

	it("replays the original result without overwriting a later Web edit", async () => {
		const { owner } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Old" });
		const name = "New";
		const { editSnapshot } = await owner.query(preview, { name, tagId });
		const args = { ...request(tagId, name, editSnapshot), agent: true };
		const saved = await owner.mutation(rename, args);
		await owner.mutation(api.tags.update, { name: "Later", tagId });
		expect(await owner.mutation(rename, args)).toEqual(saved);
		await expect(
			owner.mutation(rename, { ...args, agent: false })
		).rejects.toMatchObject(error("IDEMPOTENCY_CONFLICT"));
		await expect(
			owner.mutation(rename, { ...args, idempotencyKey: "fresh-rename-key" })
		).rejects.toMatchObject(error("TAG_RENAME_CONFLICT"));
		expect(await owner.query(api.tags.list, {})).toEqual([
			expect.objectContaining({ _id: tagId, name: "Later" }),
		]);
	});

	it("renames at capacity, fails closed above it, and still permits a saved replay", async () => {
		const { owner, test, userId } = await setup();
		const tagId = await owner.mutation(api.tags.create, { name: "Old" });
		await test.run(async (ctx) => {
			await forEachSequential(
				Array.from({ length: 999 }, (_, index) => index),
				async (index) => {
					await ctx.db.insert("tags", {
						createdAt: 0,
						name: `Tag ${index}`,
						userId,
					});
				}
			);
		});
		const { editSnapshot } = await owner.query(preview, { name: "New", tagId });
		const args = request(tagId, "New", editSnapshot);
		const saved = await owner.mutation(rename, args);
		expect(saved).toEqual({ id: tagId, name: "New" });
		const next = await owner.query(preview, { name: "Later", tagId });
		await owner.mutation(api.tags.create, { name: "Overflow" });
		const limit = error("RESOURCE_LIMIT_EXCEEDED");
		await expect(
			owner.query(preview, { name: next.name, tagId })
		).rejects.toMatchObject(limit);
		await expect(
			owner.mutation(rename, {
				...request(tagId, next.name, next.editSnapshot),
				idempotencyKey: "overflow-rename-key",
			})
		).rejects.toMatchObject(limit);
		expect(await owner.mutation(rename, args)).toEqual(saved);
	});
});
