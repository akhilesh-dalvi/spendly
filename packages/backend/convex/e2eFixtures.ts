// biome-ignore-all lint/style/useFilenamingConvention: Convex module paths cannot contain hyphens.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const MAX_ROWS_PER_TABLE = 1000;
const PRODUCTION_URL = "https://successful-donkey-782.convex.cloud";
const DEPLOYMENT_HOSTNAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.convex\.cloud$/;
const FIXTURE_EMAIL =
	/^spendly-e2e-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\+clerk_test@example\.com$/;
const INVALID_ORIGIN_MESSAGE =
	"Expected a bare HTTPS convex.cloud deployment origin";

const assertDeployment = (expectedDeploymentUrl: string): void => {
	let url: URL;
	try {
		url = new URL(expectedDeploymentUrl);
	} catch {
		throw new Error(INVALID_ORIGIN_MESSAGE);
	}
	if (
		url.protocol !== "https:" ||
		url.port !== "" ||
		url.origin !== expectedDeploymentUrl ||
		!DEPLOYMENT_HOSTNAME.test(url.hostname)
	) {
		throw new Error(INVALID_ORIGIN_MESSAGE);
	}
	if (
		expectedDeploymentUrl === PRODUCTION_URL ||
		process.env.CONVEX_CLOUD_URL === PRODUCTION_URL
	) {
		throw new Error("E2E cleanup cannot target production");
	}
	if (process.env.CONVEX_CLOUD_URL !== expectedDeploymentUrl) {
		throw new Error("E2E cleanup deployment URL mismatch");
	}
};

// Enable only on a dedicated E2E development deployment. Calling this internal
// mutation requires a deploy/admin key; it is never a public cleanup endpoint.
export const removeUser = internalMutation({
	args: {
		clerkId: v.string(),
		email: v.string(),
		expectedDeploymentUrl: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (process.env.SPENDLY_E2E_ENABLED !== "true") {
			throw new Error("E2E cleanup is disabled");
		}
		assertDeployment(args.expectedDeploymentUrl);
		// Comparing the complete match also rejects a trailing newline after `$`.
		if (FIXTURE_EMAIL.exec(args.email)?.[0] !== args.email) {
			throw new Error("E2E cleanup requires a fixture email");
		}
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (query) => query.eq("clerkId", args.clerkId))
			.unique();
		if (!user) {
			return null;
		}
		if (user.email !== args.email) {
			throw new Error("E2E cleanup user email mismatch");
		}
		const ownedQueries = [
			ctx.db
				.query("accounts")
				.withIndex("by_userId", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("account_types")
				.withIndex("by_userId", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("account_transactions")
				.withIndex("by_userId_date", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("account_transfers")
				.withIndex("by_userId_date", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("expenses")
				.withIndex("by_userId_date", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("categories")
				.withIndex("by_userId", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("category_types")
				.withIndex("by_userId", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("tags")
				.withIndex("by_userId", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("expense_cycles")
				.withIndex("by_userId", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("cli_idempotency")
				.withIndex("by_userId_key", (query) => query.eq("userId", user._id)),
			ctx.db
				.query("cli_deletion_confirmations")
				.withIndex("by_userId_expenseId", (query) =>
					query.eq("userId", user._id)
				),
		];
		for (const query of ownedQueries) {
			const records = await query.take(MAX_ROWS_PER_TABLE + 1);
			if (records.length > MAX_ROWS_PER_TABLE) {
				// Throwing rolls back deletions from earlier tables in this mutation.
				throw new Error("E2E cleanup exceeds the per-table row limit");
			}
			for (const record of records) {
				await ctx.db.delete(record._id);
			}
		}
		await ctx.db.delete(user._id);
		return null;
	},
});
