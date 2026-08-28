import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { seedDefaultAccountTypes } from "./accountTypeHelpers";
import {
	getCurrentUser,
	getCurrentUserOrNull,
	validateAccountOwnership,
} from "./helpers";
import { supportedCurrencyValidator } from "./onboardingValidators";

const userValidator = v.object({
	_id: v.id("users"),
	_creationTime: v.number(),
	accountsOnboardingStatus: v.optional(
		v.union(v.literal("pending"), v.literal("skipped"), v.literal("completed"))
	),
	clerkId: v.string(),
	createdAt: v.number(),
	currency: v.optional(v.string()),
	dashboardViewMode: v.optional(v.string()),
	defaultAccountId: v.optional(v.id("accounts")),
	email: v.string(),
	name: v.optional(v.string()),
	onboardingCompletedAt: v.optional(v.number()),
	onboardingCycleId: v.optional(v.id("expense_cycles")),
	onboardingPath: v.optional(v.union(v.literal("free"), v.literal("plan"))),
	onboardingStep: v.optional(
		v.union(
			v.literal("start"),
			v.literal("cycle"),
			v.literal("categories"),
			v.literal("account"),
			v.literal("complete")
		)
	),
});

export const get = query({
	args: {},
	returns: userValidator,
	handler: async (ctx) => {
		return await getCurrentUser(ctx);
	},
});

export const create = mutation({
	args: {
		name: v.optional(v.string()),
		email: v.string(),
	},
	returns: v.id("users"),
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
			onboardingStep: "start",
			accountsOnboardingStatus: "pending",
			createdAt: Date.now(),
		});
		await seedDefaultAccountTypes(ctx, userId);

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

export const beginOnboarding = mutation({
	args: {
		currency: supportedCurrencyValidator,
		path: v.union(v.literal("free"), v.literal("plan")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await seedDefaultAccountTypes(ctx, user._id);
		await ctx.db.patch(user._id, {
			accountsOnboardingStatus: "pending",
			currency: args.currency,
			onboardingCompletedAt: undefined,
			onboardingPath: args.path,
			onboardingStep: "cycle",
		});
		return null;
	},
});

export const getOnboardingState = query({
	args: {},
	returns: v.union(
		v.null(),
		v.object({
			accountStatus: v.union(
				v.literal("pending"),
				v.literal("skipped"),
				v.literal("completed")
			),
			currency: v.string(),
			cycle: v.union(
				v.null(),
				v.object({
					_id: v.id("expense_cycles"),
					_creationTime: v.number(),
					createdAt: v.number(),
					endDate: v.string(),
					name: v.string(),
					startDate: v.string(),
					userId: v.id("users"),
				})
			),
			path: v.union(v.null(), v.literal("free"), v.literal("plan")),
			step: v.union(
				v.literal("start"),
				v.literal("cycle"),
				v.literal("categories"),
				v.literal("account"),
				v.literal("complete")
			),
		})
	),
	handler: async (ctx) => {
		const user = await getCurrentUserOrNull(ctx);
		if (!user) {
			return null;
		}

		const cycle = user.onboardingCycleId
			? await ctx.db.get(user.onboardingCycleId)
			: null;
		const ownedCycle = cycle?.userId === user._id ? cycle : null;

		if (!(user.onboardingPath || user.onboardingStep)) {
			const existingCycle = await ctx.db
				.query("expense_cycles")
				.withIndex("by_userId", (queryBuilder) =>
					queryBuilder.eq("userId", user._id)
				)
				.first();
			return {
				accountStatus: user.accountsOnboardingStatus ?? "completed",
				currency: user.currency ?? "USD",
				cycle: null,
				path: null,
				step: existingCycle ? ("complete" as const) : ("start" as const),
			};
		}

		return {
			accountStatus: user.accountsOnboardingStatus ?? "pending",
			currency: user.currency ?? "USD",
			cycle: ownedCycle,
			path: user.onboardingPath ?? null,
			step: user.onboardingStep ?? "start",
		};
	},
});

export const advanceOnboarding = mutation({
	args: { step: v.literal("account") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user.onboardingCycleId) {
			throw new Error("Create an expense cycle before continuing");
		}
		await ctx.db.patch(user._id, { onboardingStep: args.step });
		return null;
	},
});

export const completeOnboarding = mutation({
	args: {
		accountStatus: v.union(v.literal("skipped"), v.literal("completed")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user.onboardingCycleId) {
			throw new Error("Create an expense cycle before completing onboarding");
		}
		await ctx.db.patch(user._id, {
			accountsOnboardingStatus: args.accountStatus,
			onboardingCompletedAt: Date.now(),
			onboardingStep: "complete",
		});
		return null;
	},
});

export const updateCurrency = mutation({
	args: { currency: supportedCurrencyValidator },
	returns: userValidator,
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
		const updatedUser = await ctx.db.get(user._id);
		if (!updatedUser) {
			throw new Error("User not found after currency update");
		}
		return updatedUser;
	},
});

export const updateDefaultAccount = mutation({
	args: { accountId: v.id("accounts") },
	returns: v.id("accounts"),
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const account = await validateAccountOwnership(
			ctx,
			args.accountId,
			user._id
		);

		if (account.isArchived) {
			throw new ConvexError("ACCOUNT_ARCHIVED");
		}

		await ctx.db.patch(user._id, {
			defaultAccountId: args.accountId,
		});
		return args.accountId;
	},
});

export const dismissAccountsOnboarding = mutation({
	args: {},
	returns: v.literal("skipped"),
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		await ctx.db.patch(user._id, {
			accountsOnboardingStatus: "skipped",
		});
		return "skipped" as const;
	},
});

export const updateDashboardViewMode = mutation({
	args: { viewMode: v.string() },
	returns: userValidator,
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
		const updatedUser = await ctx.db.get(user._id);
		if (!updatedUser) {
			throw new Error("User not found after dashboard update");
		}
		return updatedUser;
	},
});
