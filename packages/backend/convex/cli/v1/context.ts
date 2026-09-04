import { ConvexError, v } from "convex/values";
import { query } from "../../_generated/server";
import { resolveLocalDate } from "../../domain/dates";
import { findCycleForDate, getCurrentUser } from "../../helpers";
import { withCliErrors } from "./errors";
import { presentAccount } from "./presenters";
import { accountSummaryValidator } from "./validators";

const MAXIMUM_CONTEXT_RESOURCES = 1000;

const cycleValidator = v.object({
	endDateExclusive: v.string(),
	id: v.id("expense_cycles"),
	name: v.string(),
	startDate: v.string(),
});

const categoryValidator = v.object({
	id: v.id("categories"),
	name: v.string(),
	order: v.number(),
});

const tagValidator = v.object({
	id: v.id("tags"),
	name: v.string(),
});

const contextValidator = v.object({
	accounts: v.array(accountSummaryValidator),
	accountsOnboardingStatus: v.union(
		v.literal("pending"),
		v.literal("skipped"),
		v.literal("completed")
	),
	capabilities: v.object({
		accountMutations: v.boolean(),
		deletionConfirmation: v.boolean(),
		expenseMutations: v.boolean(),
		idempotencyRetentionDays: v.number(),
		maximumPageSize: v.number(),
		schemaVersion: v.literal(1),
	}),
	categories: v.array(categoryValidator),
	currency: v.string(),
	currentCycle: v.union(cycleValidator, v.null()),
	dateSource: v.union(v.literal("explicit"), v.literal("local_default")),
	effectiveDate: v.string(),
	tags: v.array(tagValidator),
	timezone: v.union(v.string(), v.null()),
	totals: v.array(v.object({ currency: v.string(), total: v.number() })),
	userId: v.id("users"),
	warnings: v.array(v.string()),
});

export const get = query({
	args: {
		date: v.string(),
		dateSource: v.optional(
			v.union(v.literal("explicit"), v.literal("local_default"))
		),
		timezone: v.optional(v.string()),
	},
	returns: contextValidator,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const effectiveDate = resolveLocalDate(args.date);
			const currentCycle = await findCycleForDate(ctx, user._id, effectiveDate);
			const [categories, tags, accountDocuments] = await Promise.all([
				currentCycle
					? ctx.db
							.query("categories")
							.withIndex("by_cycleId", (queryBuilder) =>
								queryBuilder.eq("cycleId", currentCycle._id)
							)
							.take(MAXIMUM_CONTEXT_RESOURCES + 1)
					: Promise.resolve([]),
				ctx.db
					.query("tags")
					.withIndex("by_userId", (queryBuilder) =>
						queryBuilder.eq("userId", user._id)
					)
					.take(MAXIMUM_CONTEXT_RESOURCES + 1),
				ctx.db
					.query("accounts")
					.withIndex("by_userId", (queryBuilder) =>
						queryBuilder.eq("userId", user._id)
					)
					.take(MAXIMUM_CONTEXT_RESOURCES + 1),
			]);
			if (
				categories.length > MAXIMUM_CONTEXT_RESOURCES ||
				tags.length > MAXIMUM_CONTEXT_RESOURCES ||
				accountDocuments.length > MAXIMUM_CONTEXT_RESOURCES
			) {
				throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
			}
			const accounts = await Promise.all(
				accountDocuments
					.filter((account) => !account.isArchived)
					.sort((left, right) => left.name.localeCompare(right.name))
					.map((account) => presentAccount(ctx, account, user))
			);
			const totalsByCurrency = new Map<string, number>();
			for (const account of accounts) {
				totalsByCurrency.set(
					account.currency,
					(totalsByCurrency.get(account.currency) ?? 0) + account.currentBalance
				);
			}
			return {
				accounts,
				accountsOnboardingStatus: user.accountsOnboardingStatus ?? "pending",
				capabilities: {
					accountMutations: true,
					deletionConfirmation: true,
					expenseMutations: true,
					idempotencyRetentionDays: 30,
					maximumPageSize: 100,
					schemaVersion: 1 as const,
				},
				categories: categories
					.filter(
						(category) => category.userId === user._id && !category.isHidden
					)
					.sort((left, right) => left.order - right.order)
					.map((category) => ({
						id: category._id,
						name: category.name,
						order: category.order,
					})),
				currency: user.currency?.trim().toUpperCase() || "USD",
				currentCycle: currentCycle
					? {
							endDateExclusive: currentCycle.endDate,
							id: currentCycle._id,
							name: currentCycle.name,
							startDate: currentCycle.startDate,
						}
					: null,
				dateSource: args.dateSource ?? ("explicit" as const),
				effectiveDate,
				tags: tags
					.sort((left, right) => left.name.localeCompare(right.name))
					.map((tag) => ({ id: tag._id, name: tag.name })),
				timezone: args.timezone ?? null,
				totals: Array.from(totalsByCurrency, ([currency, total]) => ({
					currency,
					total,
				})).sort((left, right) => left.currency.localeCompare(right.currency)),
				userId: user._id,
				warnings: [],
			};
		}),
});
