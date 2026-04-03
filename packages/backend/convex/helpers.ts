import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * Get the current authenticated user.
 * Throws an error if the user is not authenticated or not found in the database.
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError("UNAUTHENTICATED");
	}

	const user = await ctx.db
		.query("users")
		.withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
		.unique();

	if (!user) {
		throw new ConvexError("User not found");
	}

	return user;
}

/**
 * Get the current authenticated user, or null if not authenticated/found.
 */
export async function getCurrentUserOrNull(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}

	return await ctx.db
		.query("users")
		.withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
		.unique();
}

/**
 * Finds the cycle containing a given date.
 */
export async function findCycleForDate(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	date: string
) {
	return await ctx.db
		.query("expense_cycles")
		.withIndex("by_userId_dates", (q) =>
			q.eq("userId", userId).lte("startDate", date)
		)
		.filter((q) => q.gt(q.field("endDate"), date))
		.unique();
}

/**
 * Checks if cycle belongs to user, throws if not.
 */
export async function validateCycleOwnership(
	ctx: QueryCtx | MutationCtx,
	cycleId: Id<"expense_cycles">,
	userId: Id<"users">
) {
	const cycle = await ctx.db.get(cycleId);
	if (!cycle || cycle.userId !== userId) {
		throw new ConvexError("UNAUTHORIZED");
	}
	return cycle;
}

/**
 * Checks if category belongs to user, throws if not.
 */
export async function validateCategoryOwnership(
	ctx: QueryCtx | MutationCtx,
	categoryId: Id<"categories">,
	userId: Id<"users">
) {
	const category = await ctx.db.get(categoryId);
	if (!category || category.userId !== userId) {
		throw new ConvexError("UNAUTHORIZED");
	}
	return category;
}

/**
 * Checks for overlapping cycles.
 */
export async function checkCycleOverlap(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	startDate: string,
	endDate: string,
	excludeCycleId?: Id<"expense_cycles">
) {
	const cycles = await ctx.db
		.query("expense_cycles")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.collect();

	return (
		cycles.find((c) => {
			if (excludeCycleId && c._id === excludeCycleId) {
				return false;
			}
			return startDate < c.endDate && c.startDate < endDate;
		}) ?? null
	);
}
