import { v } from "convex/values";
import { query } from "../../_generated/server";

export const identity = query({
	args: {},
	handler: async (ctx) => {
		const userIdentity = await ctx.auth.getUserIdentity();
		if (!userIdentity) {
			throw new Error("UNAUTHENTICATED");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (queryBuilder) =>
				queryBuilder.eq("clerkId", userIdentity.subject)
			)
			.unique();

		return {
			authenticated: true,
			backendUserId: user?._id ?? null,
			currency: user?.currency ?? null,
			identitySubject: userIdentity.subject,
			subjectMatchesBackendUser: user?.clerkId === userIdentity.subject,
		};
	},
	returns: v.object({
		authenticated: v.boolean(),
		backendUserId: v.union(v.id("users"), v.null()),
		currency: v.union(v.string(), v.null()),
		identitySubject: v.string(),
		subjectMatchesBackendUser: v.boolean(),
	}),
});
