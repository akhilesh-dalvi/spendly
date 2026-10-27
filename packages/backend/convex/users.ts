import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { seedDefaultAccountTypes } from "./accountTypeHelpers";
import { commitDefaultAccount } from "./domain/accountOperations";
import { actionSourceValidator } from "./domain/actionSource";
import { getCurrentUser, getCurrentUserOrNull } from "./helpers";
import { supportedCurrencyValidator } from "./onboardingValidators";

const userValidator = v.object({
	_creationTime: v.number(),
	_id: v.id("users"),
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
	handler: async (ctx) => await getCurrentUser(ctx),
	returns: userValidator,
});

export const create = mutation({
	args: {
		email: v.string(),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called create user without authentication");
		}

		const existingUser = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
			.unique();

		if (existingUser) {
			return existingUser._id;
		}

		const userId = await ctx.db.insert("users", {
			accountsOnboardingStatus: "pending",
			clerkId: identity.subject,
			createdAt: Date.now(),
			currency: "USD",
			email: args.email,
			name: args.name,
			onboardingStep: "start",
		});
		await seedDefaultAccountTypes(ctx, userId);

		await ctx.db.insert("category_types", {
			color: "#3b82f6",
			createdAt: Date.now(),
			name: "Needs",
			order: 0,
			userId,
		});
		await ctx.db.insert("category_types", {
			color: "#f59e0b",
			createdAt: Date.now(),
			name: "Wants",
			order: 1,
			userId,
		});
		await ctx.db.insert("category_types", {
			color: "#10b981",
			createdAt: Date.now(),
			name: "Savings",
			order: 2,
			userId,
		});

		return userId;
	},
	returns: v.id("users"),
});

export const beginOnboarding = mutation({
	args: {
		currency: supportedCurrencyValidator,
		path: v.union(v.literal("free"), v.literal("plan")),
	},
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
	returns: v.null(),
});

export const getOnboardingState = query({
	args: {},
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
					_creationTime: v.number(),
					_id: v.id("expense_cycles"),
					createdAt: v.number(),
					createdSource: v.optional(actionSourceValidator),
					endDate: v.string(),
					lastModifiedSource: v.optional(actionSourceValidator),
					name: v.string(),
					revision: v.optional(v.number()),
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
});

export const advanceOnboarding = mutation({
	args: { step: v.literal("account") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user.onboardingCycleId) {
			throw new Error("Create an expense cycle before continuing");
		}
		await ctx.db.patch(user._id, { onboardingStep: args.step });
		return null;
	},
	returns: v.null(),
});

export const completeOnboarding = mutation({
	args: {
		accountStatus: v.union(v.literal("skipped"), v.literal("completed")),
	},
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
	returns: v.null(),
});

export const updateCurrency = mutation({
	args: { currency: supportedCurrencyValidator },
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
	returns: userValidator,
});

export const updateDefaultAccount = mutation({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		await commitDefaultAccount(ctx, {
			accountId: args.accountId,
			source: "web",
			user,
		});
		return args.accountId;
	},
	returns: v.id("accounts"),
});

export const dismissAccountsOnboarding = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		await ctx.db.patch(user._id, {
			accountsOnboardingStatus: "skipped",
		});
		return "skipped" as const;
	},
	returns: v.literal("skipped"),
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
		const updatedUser = await ctx.db.get(user._id);
		if (!updatedUser) {
			throw new Error("User not found after dashboard update");
		}
		return updatedUser;
	},
	returns: userValidator,
});
