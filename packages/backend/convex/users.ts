import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./helpers";

export const get = query({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	},
});

export const create = mutation({
	args: {
		name: v.optional(v.string()),
		email: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called create user without authentication");
		}

		// Check if user already exists
		const existingUser = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
			.unique();

		if (existingUser) {
			return existingUser._id;
		}

		const userId = await ctx.db.insert("users", {
			clerkId: identity.subject,
			email: args.email,
			name: args.name,
			currency: "USD",
			createdAt: Date.now(),
		});

		// Seed default category types
		await ctx.db.insert("category_types", {
			userId,
			name: "Needs",
			color: "#3b82f6", // Blue 500
			order: 0,
			createdAt: Date.now(),
		});
		await ctx.db.insert("category_types", {
			userId,
			name: "Wants",
			color: "#f59e0b", // Amber 500
			order: 1,
			createdAt: Date.now(),
		});
		await ctx.db.insert("category_types", {
			userId,
			name: "Savings",
			color: "#10b981", // Emerald 500
			order: 2,
			createdAt: Date.now(),
		});

		return userId;
	},
});

export const updateCurrency = mutation({
	args: { currency: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called updateCurrency without authentication");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
			.unique();

		if (!user) {
			throw new Error("User not found");
		}

		await ctx.db.patch(user._id, { currency: args.currency });
		return await ctx.db.get(user._id);
	},
});

export const updateDashboardViewMode = mutation({
	args: { viewMode: v.string() },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called updateDashboardViewMode without authentication");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
			.unique();

		if (!user) {
			throw new Error("User not found");
		}

		await ctx.db.patch(user._id, { dashboardViewMode: args.viewMode });
		return await ctx.db.get(user._id);
	},
});
