import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { normalizeSpentOnForSearch } from "../../domain/expenseOperations";
import { forEachSequential } from "../../lib/async";

const MAXIMUM_CLEANUP_BATCH_SIZE = 500;
const MIGRATION_PAGE_SIZE = 100;

const migrationResultValidator = v.object({
	continueCursor: v.union(v.string(), v.null()),
	isDone: v.boolean(),
	updated: v.number(),
});

export const initializeExpenseRevisions = internalMutation({
	args: { cursor: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const page = await ctx.db.query("expenses").paginate({
			cursor: args.cursor ?? null,
			numItems: MIGRATION_PAGE_SIZE,
		});
		let updated = 0;
		await forEachSequential(page.page, async (expense) => {
			if (expense.revision === undefined) {
				await ctx.db.patch(expense._id, { revision: 1 });
				updated += 1;
			}
		});
		return {
			continueCursor: page.isDone ? null : page.continueCursor,
			isDone: page.isDone,
			updated,
		};
	},
	returns: migrationResultValidator,
});

export const initializeExpenseSearchFields = internalMutation({
	args: { cursor: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const page = await ctx.db.query("expenses").paginate({
			cursor: args.cursor ?? null,
			numItems: MIGRATION_PAGE_SIZE,
		});
		let updated = 0;
		await forEachSequential(page.page, async (expense) => {
			const normalizedSpentOn = normalizeSpentOnForSearch(expense.spentOn);
			if (expense.normalizedSpentOn !== normalizedSpentOn) {
				await ctx.db.patch(expense._id, { normalizedSpentOn });
				updated += 1;
			}
		});
		return {
			continueCursor: page.isDone ? null : page.continueCursor,
			isDone: page.isDone,
			updated,
		};
	},
	returns: migrationResultValidator,
});

export const initializeAccountRevisions = internalMutation({
	args: { cursor: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const page = await ctx.db.query("accounts").paginate({
			cursor: args.cursor ?? null,
			numItems: MIGRATION_PAGE_SIZE,
		});
		let updated = 0;
		await forEachSequential(page.page, async (account) => {
			if (account.revision === undefined) {
				await ctx.db.patch(account._id, { revision: 1 });
				updated += 1;
			}
		});
		return {
			continueCursor: page.isDone ? null : page.continueCursor,
			isDone: page.isDone,
			updated,
		};
	},
	returns: migrationResultValidator,
});

export const cleanupExpired = internalMutation({
	args: { now: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const now = args.now ?? Date.now();
		const [
			idempotencyRecords,
			deletionConfirmations,
			cycleDeletionConfirmations,
		] = await Promise.all([
			ctx.db
				.query("cli_idempotency")
				.withIndex("by_expiresAt", (queryBuilder) =>
					queryBuilder.lt("expiresAt", now)
				)
				.take(MAXIMUM_CLEANUP_BATCH_SIZE),
			ctx.db
				.query("cli_deletion_confirmations")
				.withIndex("by_expiresAt", (queryBuilder) =>
					queryBuilder.lt("expiresAt", now)
				)
				.take(MAXIMUM_CLEANUP_BATCH_SIZE),
			ctx.db
				.query("cli_cycle_deletion_confirmations")
				.withIndex("by_expiresAt", (queryBuilder) =>
					queryBuilder.lt("expiresAt", now)
				)
				.take(MAXIMUM_CLEANUP_BATCH_SIZE),
		]);
		await forEachSequential(
			[
				...idempotencyRecords,
				...deletionConfirmations,
				...cycleDeletionConfirmations,
			],
			async (record) => {
				await ctx.db.delete(record._id);
			}
		);
		return {
			deletionConfirmations:
				deletionConfirmations.length + cycleDeletionConfirmations.length,
			idempotencyRecords: idempotencyRecords.length,
		};
	},
	returns: v.object({
		deletionConfirmations: v.number(),
		idempotencyRecords: v.number(),
	}),
});
