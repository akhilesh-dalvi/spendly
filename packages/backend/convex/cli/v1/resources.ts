import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../../_generated/server";
import { validateLocalDate } from "../../domain/dates";
import { executeIdempotentMutation } from "../../domain/idempotency";
import { listCliTags } from "../../domain/tagOperations";
import {
	findCycleForDate,
	getCurrentUser,
	validateCycleOwnership,
} from "../../helpers";
import { withCliErrors } from "./errors";
import {
	categorySummaryValidator,
	cycleSummaryValidator,
	tagSummaryValidator,
} from "./validators";

const MAXIMUM_CYCLES = 1000;
const MAXIMUM_CATEGORIES = 1000;
const MAXIMUM_SUMMARY_EXPENSES = 10_000;

const toIsoTimestamp = (timestamp: number): string =>
	new Date(timestamp).toISOString();

const presentCycle = (cycle: Doc<"expense_cycles">) => ({
	createdAt: toIsoTimestamp(cycle.createdAt),
	endDateExclusive: cycle.endDate,
	id: cycle._id,
	name: cycle.name,
	startDate: cycle.startDate,
});

export const listCycles = query({
	args: {},
	handler: async (ctx) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const cycles = await ctx.db
				.query("expense_cycles")
				.withIndex("by_userId_dates", (queryBuilder) =>
					queryBuilder.eq("userId", user._id)
				)
				.order("desc")
				.take(MAXIMUM_CYCLES + 1);
			if (cycles.length > MAXIMUM_CYCLES) {
				throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
			}
			return cycles.map(presentCycle);
		}),
	returns: v.array(cycleSummaryValidator),
});

export const getCurrentCycle = query({
	args: { date: v.string() },
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const cycle = await findCycleForDate(
				ctx,
				user._id,
				validateLocalDate(args.date)
			);
			return cycle ? presentCycle(cycle) : null;
		}),
	returns: v.union(cycleSummaryValidator, v.null()),
});

const presentCategoryType = (type: Doc<"category_types"> | null | undefined) =>
	type ? { color: type.color ?? null, id: type._id, name: type.name } : null;

const presentCategory = (
	category: Omit<Doc<"categories">, "_creationTime">,
	type: Doc<"category_types"> | null | undefined
) => ({
	categoryType: presentCategoryType(type),
	createdAt: toIsoTimestamp(category.createdAt),
	cycleId: category.cycleId,
	icon: category.icon ?? null,
	id: category._id,
	isHidden: category.isHidden ?? false,
	name: category.name,
	order: category.order,
	plannedAmount: category.plannedAmount ?? null,
});

export const listCategories = query({
	args: { cycleId: v.id("expense_cycles") },
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			await validateCycleOwnership(ctx, args.cycleId, user._id);
			const [categories, categoryTypes] = await Promise.all([
				ctx.db
					.query("categories")
					.withIndex("by_cycleId", (queryBuilder) =>
						queryBuilder.eq("cycleId", args.cycleId)
					)
					.take(MAXIMUM_CATEGORIES + 1),
				ctx.db
					.query("category_types")
					.withIndex("by_userId", (queryBuilder) =>
						queryBuilder.eq("userId", user._id)
					)
					.take(MAXIMUM_CATEGORIES + 1),
			]);
			if (
				categories.length > MAXIMUM_CATEGORIES ||
				categoryTypes.length > MAXIMUM_CATEGORIES
			) {
				throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
			}
			const categoryTypesById = new Map(
				categoryTypes.map((categoryType) => [categoryType._id, categoryType])
			);
			return categories
				.sort((left, right) => left.order - right.order)
				.map((category) => {
					const categoryType = category.categoryTypeId
						? categoryTypesById.get(category.categoryTypeId)
						: undefined;
					return presentCategory(category, categoryType);
				});
		}),
	returns: v.array(categorySummaryValidator),
});

const categoryCreateInput = v.object({
	categoryTypeId: v.optional(v.string()),
	cycleId: v.string(),
	icon: v.optional(v.string()),
	name: v.string(),
	plannedAmount: v.optional(v.number()),
});

const categoryCreatePreviewValidator = v.object({
	categoryType: categorySummaryValidator.fields.categoryType,
	cycleId: categorySummaryValidator.fields.cycleId,
	cycleName: v.string(),
	icon: categorySummaryValidator.fields.icon,
	name: categorySummaryValidator.fields.name,
	plannedAmount: categorySummaryValidator.fields.plannedAmount,
});

const unsafeTerminalText = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const categoryText = (value: string, maxLength: number): string => {
	const trimmed = value.trim();
	if (
		!trimmed ||
		trimmed.length > maxLength ||
		unsafeTerminalText.test(value)
	) {
		throw new ConvexError("INVALID_INPUT");
	}
	return trimmed;
};

const prepareCategoryCreate = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	input: Infer<typeof categoryCreateInput>
) => {
	const cycleId = ctx.db.normalizeId("expense_cycles", input.cycleId);
	if (!cycleId) {
		throw new ConvexError("NOT_FOUND");
	}
	const cycle = await validateCycleOwnership(ctx, cycleId, userId);
	let type: Doc<"category_types"> | null = null;
	if (input.categoryTypeId !== undefined) {
		const typeId = ctx.db.normalizeId("category_types", input.categoryTypeId);
		type = typeId ? await ctx.db.get(typeId) : null;
		if (type?.userId !== userId) {
			throw new ConvexError("NOT_FOUND");
		}
	}
	const name = categoryText(input.name, 100);
	const icon =
		input.icon === undefined ? undefined : categoryText(input.icon, 32);
	const { plannedAmount } = input;
	if (plannedAmount !== undefined) {
		const cents = Math.round(plannedAmount * 100);
		// Beyond this bound, adjacent decimal-cent amounts can map to the same float.
		if (
			!Number.isSafeInteger(cents) ||
			plannedAmount < 0 ||
			plannedAmount >= 2 ** 46 ||
			cents / 100 !== plannedAmount
		) {
			throw new ConvexError("INVALID_INPUT");
		}
	}
	const categories = await ctx.db
		.query("categories")
		.withIndex("by_cycleId", (q) => q.eq("cycleId", cycleId))
		.take(MAXIMUM_CATEGORIES);
	if (categories.length >= MAXIMUM_CATEGORIES) {
		throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
	}
	const previousOrder = categories.reduce(
		(max, category) => Math.max(max, category.order),
		-1
	);
	const order = previousOrder + 1;
	if (!Number.isFinite(order) || order <= previousOrder) {
		throw new ConvexError("INVALID_INPUT");
	}
	return { cycle, icon, name, order, plannedAmount, type };
};

export const previewCategoryCreate = query({
	args: categoryCreateInput.fields,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const prepared = await prepareCategoryCreate(ctx, user._id, args);
			return {
				categoryType: presentCategoryType(prepared.type),
				cycleId: prepared.cycle._id,
				cycleName: prepared.cycle.name,
				icon: prepared.icon ?? null,
				name: prepared.name,
				plannedAmount: prepared.plannedAmount ?? null,
			};
		}),
	returns: categoryCreatePreviewValidator,
});

export const createCategory = mutation({
	args: {
		...categoryCreateInput.fields,
		agent: v.optional(v.boolean()),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareCategoryCreate(ctx, user._id, input);
					const category = {
						categoryTypeId: prepared.type?._id,
						createdAt: Date.now(),
						cycleId: prepared.cycle._id,
						icon: prepared.icon,
						isHidden: false,
						name: prepared.name,
						order: prepared.order,
						plannedAmount: prepared.plannedAmount,
						userId: user._id,
					};
					const id = await ctx.db.insert("categories", category);
					return presentCategory({ ...category, _id: id }, prepared.type);
				},
				key: idempotencyKey,
				operation: "categories.create",
				request: input,
				userId: user._id,
			});
		}),
	returns: categorySummaryValidator,
});

export const listTags = query({
	args: {},
	handler: async (ctx) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const tags = await listCliTags(ctx, user._id);
			return tags
				.sort((left, right) => left.name.localeCompare(right.name))
				.map((tag) => ({
					createdAt: toIsoTimestamp(tag.createdAt),
					id: tag._id,
					name: tag.name,
				}));
		}),
	returns: v.array(tagSummaryValidator),
});

const categoryStatValidator = v.object({
	categoryId: v.union(v.id("categories"), v.null()),
	difference: v.union(v.number(), v.null()),
	icon: v.union(v.string(), v.null()),
	name: v.string(),
	planned: v.union(v.number(), v.null()),
	progressPercent: v.union(v.number(), v.null()),
	spent: v.number(),
	typeId: v.union(v.id("category_types"), v.null()),
	typeName: v.union(v.string(), v.null()),
});

const typeStatValidator = v.object({
	categories: v.array(categoryStatValidator),
	totalPlanned: v.number(),
	totalSpent: v.number(),
	typeId: v.union(v.id("category_types"), v.null()),
	typeName: v.string(),
});

const summaryValidator = v.object({
	categories: v.array(categoryStatValidator),
	cycle: cycleSummaryValidator,
	daysRemaining: v.union(v.number(), v.null()),
	remaining: v.number(),
	totalPlanned: v.number(),
	totalSpent: v.number(),
	types: v.array(typeStatValidator),
});

interface CategoryStat {
	categoryId: Id<"categories"> | null;
	difference: number | null;
	icon: string | null;
	name: string;
	planned: number | null;
	progressPercent: number | null;
	spent: number;
	typeId: Id<"category_types"> | null;
	typeName: string | null;
}

interface TypeStat {
	categories: CategoryStat[];
	totalPlanned: number;
	totalSpent: number;
	typeId: Id<"category_types"> | null;
	typeName: string;
}

const getDaysRemaining = (
	endDateExclusive: string,
	today: string
): number | null => {
	if (endDateExclusive <= today) {
		return null;
	}
	return Math.ceil(
		(new Date(`${endDateExclusive}T00:00:00.000Z`).getTime() -
			new Date(`${today}T00:00:00.000Z`).getTime()) /
			(24 * 60 * 60 * 1000)
	);
};

export const getSummary = query({
	args: { cycleId: v.id("expense_cycles"), today: v.string() },
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const today = validateLocalDate(args.today);
			const cycle = await validateCycleOwnership(ctx, args.cycleId, user._id);
			const [expenses, categories, categoryTypes] = await Promise.all([
				ctx.db
					.query("expenses")
					.withIndex("by_cycleId", (queryBuilder) =>
						queryBuilder.eq("cycleId", cycle._id)
					)
					.take(MAXIMUM_SUMMARY_EXPENSES + 1),
				ctx.db
					.query("categories")
					.withIndex("by_cycleId", (queryBuilder) =>
						queryBuilder.eq("cycleId", cycle._id)
					)
					.take(MAXIMUM_CATEGORIES + 1),
				ctx.db
					.query("category_types")
					.withIndex("by_userId", (queryBuilder) =>
						queryBuilder.eq("userId", user._id)
					)
					.take(MAXIMUM_CATEGORIES + 1),
			]);
			if (
				expenses.length > MAXIMUM_SUMMARY_EXPENSES ||
				categories.length > MAXIMUM_CATEGORIES ||
				categoryTypes.length > MAXIMUM_CATEGORIES
			) {
				throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
			}
			const spentByCategory = new Map<Id<"categories">, number>();
			let uncategorizedSpent = 0;
			for (const expense of expenses) {
				if (expense.categoryId) {
					spentByCategory.set(
						expense.categoryId,
						(spentByCategory.get(expense.categoryId) ?? 0) + expense.amount
					);
				} else {
					uncategorizedSpent += expense.amount;
				}
			}
			const categoryTypesById = new Map(
				categoryTypes.map((categoryType) => [categoryType._id, categoryType])
			);
			const categoryStats: CategoryStat[] = categories.map((category) => {
				const spent = spentByCategory.get(category._id) ?? 0;
				const planned = category.plannedAmount ?? null;
				const categoryType = category.categoryTypeId
					? categoryTypesById.get(category.categoryTypeId)
					: undefined;
				return {
					categoryId: category._id,
					difference: planned === null ? null : planned - spent,
					icon: category.icon ?? null,
					name: category.name,
					planned,
					progressPercent:
						planned !== null && planned > 0 ? (spent / planned) * 100 : null,
					spent,
					typeId: categoryType?._id ?? null,
					typeName: categoryType?.name ?? null,
				};
			});
			if (uncategorizedSpent > 0) {
				categoryStats.push({
					categoryId: null,
					difference: null,
					icon: null,
					name: "Uncategorized",
					planned: null,
					progressPercent: null,
					spent: uncategorizedSpent,
					typeId: null,
					typeName: null,
				});
			}
			const typeStats: TypeStat[] = categoryTypes.map((categoryType) => {
				const typeCategories = categoryStats.filter(
					(category) => category.typeId === categoryType._id
				);
				return {
					categories: typeCategories,
					totalPlanned: typeCategories.reduce(
						(total, category) => total + (category.planned ?? 0),
						0
					),
					totalSpent: typeCategories.reduce(
						(total, category) => total + category.spent,
						0
					),
					typeId: categoryType._id,
					typeName: categoryType.name,
				};
			});
			const uncategorizedCategories = categoryStats.filter(
				(category) => category.typeId === null
			);
			if (uncategorizedCategories.length > 0) {
				typeStats.push({
					categories: uncategorizedCategories,
					totalPlanned: uncategorizedCategories.reduce(
						(total, category) => total + (category.planned ?? 0),
						0
					),
					totalSpent: uncategorizedCategories.reduce(
						(total, category) => total + category.spent,
						0
					),
					typeId: null,
					typeName: "Uncategorized",
				});
			}
			const totalSpent = expenses.reduce(
				(total, expense) => total + expense.amount,
				0
			);
			const totalPlanned = categories.reduce(
				(total, category) => total + (category.plannedAmount ?? 0),
				0
			);
			return {
				categories: categoryStats,
				cycle: presentCycle(cycle),
				daysRemaining: getDaysRemaining(cycle.endDate, today),
				remaining: totalPlanned - totalSpent,
				totalPlanned,
				totalSpent,
				types: typeStats,
			};
		}),
	returns: summaryValidator,
});
