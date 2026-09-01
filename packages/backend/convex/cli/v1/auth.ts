import { v } from "convex/values";
import { query } from "../../_generated/server";

export const identity = query({
	args: {},
	returns: v.object({
		authenticated: v.boolean(),
		backendUserId: v.union(v.id("users"), v.null()),
		currency: v.union(v.string(), v.null()),
		identitySubject: v.string(),
		subjectMatchesBackendUser: v.boolean(),
	}),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("UNAUTHENTICATED");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (queryBuilder) =>
				queryBuilder.eq("clerkId", identity.subject)
			)
			.unique();

		return {
			authenticated: true,
			backendUserId: user?._id ?? null,
			currency: user?.currency ?? null,
			identitySubject: identity.subject,
			subjectMatchesBackendUser: user?.clerkId === identity.subject,
		};
	},
});
