import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./helpers";

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		return await ctx.db
			.query("tags")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();
	},
});

export const listWithUsage = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		const tags = await ctx.db
			.query("tags")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();

		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_userId_date", (q) => q.eq("userId", user._id))
			.collect();

		const tagUsage = new Map<Id<"tags">, number>();
		for (const expense of expenses) {
			if (expense.tagIds) {
				for (const tagId of expense.tagIds) {
					tagUsage.set(tagId, (tagUsage.get(tagId) || 0) + 1);
				}
			}
		}

		return tags.map((tag) => ({
			...tag,
			usageCount: tagUsage.get(tag._id) || 0,
		}));
	},
});

export const create = mutation({
	args: {
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);

		const existing = await ctx.db
			.query("tags")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.filter((q) => q.eq(q.field("name"), args.name))
			.first();

		if (existing) {
			return existing._id;
		}

		return await ctx.db.insert("tags", {
			userId: user._id,
			name: args.name,
			createdAt: Date.now(),
		});
	},
});

export const update = mutation({
	args: {
		tagId: v.id("tags"),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const tag = await ctx.db.get(args.tagId);

		if (!tag || tag.userId !== user._id) {
			throw new Error("Tag not found");
		}

		await ctx.db.patch(args.tagId, { name: args.name });
		return await ctx.db.get(args.tagId);
	},
});

export const remove = mutation({
	args: { tagId: v.id("tags") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const tag = await ctx.db.get(args.tagId);

		if (!tag || tag.userId !== user._id) {
			throw new Error("Tag not found");
		}

		// Remove from all expenses
		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_userId_date", (q) => q.eq("userId", user._id))
			.collect();

		for (const exp of expenses) {
			if (exp.tagIds?.includes(args.tagId)) {
				await ctx.db.patch(exp._id, {
					tagIds: exp.tagIds.filter((id) => id !== args.tagId),
				});
			}
		}

		await ctx.db.delete(args.tagId);
		return { success: true };
	},
});
