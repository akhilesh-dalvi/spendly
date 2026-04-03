import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	findCycleForDate,
	getCurrentUser,
	validateCategoryOwnership,
} from "./helpers";

export const list = query({
	args: {
		cycleId: v.optional(v.id("expense_cycles")),
		categoryId: v.optional(v.id("categories")),
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
		limit: v.optional(v.number()),
		offset: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expensesQuery = ctx.db
			.query("expenses")
			.withIndex("by_userId_date", (q) => q.eq("userId", user._id))
			.order("desc");

		let expenses = await expensesQuery.collect();

		if (args.cycleId) {
			expenses = expenses.filter((e) => e.cycleId === args.cycleId);
		}
		if (args.categoryId) {
			expenses = expenses.filter((e) => e.categoryId === args.categoryId);
		}
		if (args.startDate) {
			const { startDate } = args;
			expenses = expenses.filter((e) => e.date >= startDate);
		}
		if (args.endDate) {
			const { endDate } = args;
			expenses = expenses.filter((e) => e.date < endDate);
		}
		if (args.tagIds && args.tagIds.length > 0) {
			const { tagIds } = args;
			expenses = expenses.filter((e) =>
				tagIds.every((tid) => e.tagIds?.includes(tid))
			);
		}

		const total = expenses.length;
		const start = args.offset ?? 0;
		const end = args.limit ? start + args.limit : total;
		const pagedExpenses = expenses.slice(start, end);

		return await Promise.all(
			pagedExpenses.map(async (e) => {
				const category = e.categoryId ? await ctx.db.get(e.categoryId) : null;
				const type = category?.categoryTypeId
					? await ctx.db.get(category.categoryTypeId)
					: null;
				const cycle = e.cycleId ? await ctx.db.get(e.cycleId) : null;
				const tags = e.tagIds
					? await Promise.all(e.tagIds.map((tid) => ctx.db.get(tid)))
					: [];

				return {
					...e,
					categoryName: category?.name ?? null,
					categoryIcon: category?.icon ?? null,
					categoryTypeColor: type?.color ?? null,
					cycleName: cycle?.name ?? null,
					tagNames: tags.map((t) => t?.name ?? "Unknown"),
				};
			})
		);
	},
});

export const listRecent = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const limit = args.limit ?? 5;

		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_userId_date", (q) => q.eq("userId", user._id))
			.order("desc")
			.take(limit);

		return await Promise.all(
			expenses.map(async (expense) => {
				const category = expense.categoryId
					? await ctx.db.get(expense.categoryId)
					: null;
				const type = category?.categoryTypeId
					? await ctx.db.get(category.categoryTypeId)
					: null;
				const cycle = expense.cycleId
					? await ctx.db.get(expense.cycleId)
					: null;
				return {
					...expense,
					categoryName: category?.name ?? null,
					categoryIcon: category?.icon ?? null,
					categoryTypeColor: type?.color ?? null,
					cycleName: cycle?.name ?? null,
				};
			})
		);
	},
});

export const get = query({
	args: { expenseId: v.id("expenses") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expense = await ctx.db.get(args.expenseId);

		if (!expense || expense.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}

		const category = expense.categoryId
			? await ctx.db.get(expense.categoryId)
			: null;
		const cycle = expense.cycleId ? await ctx.db.get(expense.cycleId) : null;
		const tags = expense.tagIds
			? await Promise.all(expense.tagIds.map((tid) => ctx.db.get(tid)))
			: [];

		return {
			...expense,
			categoryName: category?.name ?? null,
			cycleName: cycle?.name ?? null,
			tagNames: tags.map((t) => t?.name ?? "Unknown"),
		};
	},
});

export const create = mutation({
	args: {
		amount: v.number(),
		categoryId: v.optional(v.id("categories")),
		date: v.optional(v.string()),
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const date = args.date || new Date().toISOString().split("T")[0];

		let cycleId: Id<"expense_cycles"> | undefined;

		if (args.categoryId) {
			const category = await validateCategoryOwnership(
				ctx,
				args.categoryId,
				user._id
			);
			cycleId = category.cycleId;

			const cycle = await ctx.db.get(cycleId);
			if (cycle && (date < cycle.startDate || date >= cycle.endDate)) {
				const derivedCycle = await findCycleForDate(ctx, user._id, date);
				if (derivedCycle?._id !== cycleId) {
					throw new ConvexError("CATEGORY_CYCLE_MISMATCH");
				}
			}
		} else {
			const cycle = await findCycleForDate(ctx, user._id, date);
			cycleId = cycle?._id;
		}

		const id = await ctx.db.insert("expenses", {
			userId: user._id,
			cycleId,
			categoryId: args.categoryId,
			amount: args.amount,
			date,
			spentOn: args.spentOn,
			tagIds: args.tagIds,
			createdAt: Date.now(),
		});
		return await ctx.db.get(id);
	},
});

export const update = mutation({
	args: {
		id: v.id("expenses"),
		amount: v.optional(v.number()),
		categoryId: v.optional(v.id("categories")),
		date: v.optional(v.string()),
		spentOn: v.optional(v.string()),
		tagIds: v.optional(v.array(v.id("tags"))),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expense = await ctx.db.get(args.id);
		if (!expense || expense.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}

		const updates: Partial<Doc<"expenses">> = {};
		if (args.amount !== undefined) {
			updates.amount = args.amount;
		}
		if (args.spentOn !== undefined) {
			updates.spentOn = args.spentOn;
		}
		if (args.tagIds !== undefined) {
			updates.tagIds = args.tagIds;
		}
		if (args.date !== undefined) {
			updates.date = args.date;
		}
		if (args.categoryId !== undefined) {
			updates.categoryId = args.categoryId;
		}

		const targetDate = updates.date || expense.date;
		const targetCategoryId =
			args.categoryId !== undefined ? args.categoryId : expense.categoryId;

		let targetCycleId: Id<"expense_cycles"> | undefined;

		if (targetCategoryId) {
			const category = await validateCategoryOwnership(
				ctx,
				targetCategoryId,
				user._id
			);
			targetCycleId = category.cycleId;

			const cycle = await ctx.db.get(targetCycleId);
			if (
				cycle &&
				(targetDate < cycle.startDate || targetDate >= cycle.endDate)
			) {
				throw new ConvexError("CATEGORY_CYCLE_MISMATCH");
			}
		} else {
			const cycle = await findCycleForDate(ctx, user._id, targetDate);
			targetCycleId = cycle?._id;
		}

		updates.cycleId = targetCycleId;

		await ctx.db.patch(args.id, updates);
		return await ctx.db.get(args.id);
	},
});

export const remove = mutation({
	args: { id: v.id("expenses") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const expense = await ctx.db.get(args.id);
		if (!expense || expense.userId !== user._id) {
			throw new ConvexError("NOT_FOUND");
		}
		await ctx.db.delete(args.id);
		return { success: true };
	},
});
