import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../../_generated/server";
import { validateLocalDate } from "../../domain/dates";
import {
	executeIdempotentMutation,
	fingerprintRequest,
} from "../../domain/idempotency";
import {
	insertOwnedTag,
	listCliTags,
	planStandaloneTag,
	planTagRename,
} from "../../domain/tagOperations";
import {
	findCycleForDate,
	getCurrentUser,
	validateCategoryOwnership,
	validateCycleOwnership,
} from "../../helpers";
import { withCliErrors } from "./errors";
import {
	assertExpectedPreferredCurrency,
	getEffectivePreferredCurrency,
} from "./financialCurrency";
import {
	categorySummaryValidator,
	cycleSummaryValidator,
	tagSummaryValidator,
} from "./validators";

const MAXIMUM_CYCLES = 1000;
const MAXIMUM_CATEGORIES = 1000;
const MAXIMUM_CATEGORY_TYPES = 1000;
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
					.take(MAXIMUM_CATEGORY_TYPES + 1),
			]);
			if (
				categories.length > MAXIMUM_CATEGORIES ||
				categoryTypes.length > MAXIMUM_CATEGORY_TYPES
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
	preferredCurrency: v.optional(v.string()),
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

const categoryTypeCreateInput = v.object({
	color: v.optional(v.string()),
	name: v.string(),
});
const categoryTypePreviewValidator = v.object({
	color: v.string(),
	name: v.string(),
});
const hexColor = /^#[\da-f]{6}$/iu;

const prepareCategoryTypeCreate = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	input: Infer<typeof categoryTypeCreateInput>
) => {
	const name = categoryText(input.name, 100);
	const color = input.color ?? "#3b82f6";
	if (color.length !== 7 || !hexColor.test(color)) {
		throw new ConvexError("INVALID_INPUT");
	}
	const types = await ctx.db
		.query("category_types")
		.withIndex("by_userId_order", (q) => q.eq("userId", userId))
		.order("desc")
		.take(MAXIMUM_CATEGORY_TYPES);
	if (types.some((type) => type.name === name)) {
		throw new ConvexError("CATEGORY_TYPE_NAME_CONFLICT");
	}
	if (types.length >= MAXIMUM_CATEGORY_TYPES) {
		throw new ConvexError("CATEGORY_TYPE_LIMIT_REACHED");
	}
	const previousOrder = types[0]?.order ?? -1;
	const order = previousOrder + 1;
	if (!Number.isFinite(order) || order <= previousOrder) {
		throw new ConvexError("INVALID_INPUT");
	}
	return { color, name, order };
};

export const previewCategoryTypeCreate = query({
	args: categoryTypeCreateInput.fields,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { color, name } = await prepareCategoryTypeCreate(
				ctx,
				user._id,
				args
			);
			return { color, name };
		}),
	returns: categoryTypePreviewValidator,
});

export const createCategoryType = mutation({
	args: {
		...categoryTypeCreateInput.fields,
		agent: v.optional(v.boolean()),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const prepared = await prepareCategoryTypeCreate(
						ctx,
						user._id,
						input
					);
					const id = await ctx.db.insert("category_types", {
						...prepared,
						createdAt: Date.now(),
						userId: user._id,
					});
					return { color: prepared.color, id, name: prepared.name };
				},
				key: idempotencyKey,
				operation: "categoryTypes.create",
				request: input,
				userId: user._id,
			});
		}),
	returns: v.object({
		...categoryTypePreviewValidator.fields,
		id: v.id("category_types"),
	}),
});

const validateCategoryPlan = (plannedAmount: number): void => {
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
};

const getOwnedCategoryType = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	id: string
) => {
	const typeId = ctx.db.normalizeId("category_types", id);
	const type = typeId ? await ctx.db.get(typeId) : null;
	if (type?.userId !== userId) {
		throw new ConvexError("NOT_FOUND");
	}
	return type;
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
	const type =
		input.categoryTypeId === undefined
			? null
			: await getOwnedCategoryType(ctx, userId, input.categoryTypeId);
	const name = categoryText(input.name, 100);
	const icon =
		input.icon === undefined ? undefined : categoryText(input.icon, 32);
	const { plannedAmount } = input;
	if (plannedAmount !== undefined) {
		validateCategoryPlan(plannedAmount);
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
				preferredCurrency:
					prepared.plannedAmount === undefined
						? undefined
						: getEffectivePreferredCurrency(user.currency),
			};
		}),
	returns: categoryCreatePreviewValidator,
});

export const createCategory = mutation({
	args: {
		...categoryCreateInput.fields,
		agent: v.optional(v.boolean()),
		expectedPreferredCurrency: v.optional(v.string()),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { expectedPreferredCurrency, idempotencyKey, ...input } = args;
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					assertExpectedPreferredCurrency(
						user.currency,
						expectedPreferredCurrency
					);
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
				request: { ...input, expectedPreferredCurrency },
				userId: user._id,
			});
		}),
	returns: categorySummaryValidator,
});

const categoryEditInput = v.object({
	categoryId: v.string(),
	categoryTypeId: v.optional(v.union(v.string(), v.null())),
	icon: v.optional(v.string()),
	name: v.optional(v.string()),
	plannedAmount: v.optional(v.union(v.number(), v.null())),
});

const editSnapshotPattern = /^[a-f0-9]{64}$/u;

const storedCategoryPlanValidator = v.union(
	categorySummaryValidator.fields.plannedAmount,
	v.literal("NaN"),
	v.literal("Infinity"),
	v.literal("-Infinity")
);

const presentStoredPlan = (
	amount: number | undefined
): Infer<typeof storedCategoryPlanValidator> => {
	if (amount === undefined || Number.isFinite(amount)) {
		return amount ?? null;
	}
	if (Number.isNaN(amount)) {
		return "NaN";
	}
	return amount > 0 ? "Infinity" : "-Infinity";
};

const resolveCategoryEditPatch = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	input: Omit<Infer<typeof categoryEditInput>, "categoryId">
) => {
	const patch: Partial<
		Pick<
			Doc<"categories">,
			"categoryTypeId" | "icon" | "name" | "plannedAmount"
		>
	> = {};
	if (input.name !== undefined) {
		patch.name = categoryText(input.name, 100);
	}
	if (input.icon !== undefined) {
		patch.icon = categoryText(input.icon, 32);
	}
	if (input.categoryTypeId !== undefined) {
		patch.categoryTypeId =
			input.categoryTypeId === null
				? undefined
				: (await getOwnedCategoryType(ctx, userId, input.categoryTypeId))._id;
	}
	if (input.plannedAmount !== undefined) {
		if (input.plannedAmount !== null) {
			validateCategoryPlan(input.plannedAmount);
		}
		patch.plannedAmount = input.plannedAmount ?? undefined;
	}
	if (Object.keys(patch).length === 0) {
		throw new ConvexError("INVALID_INPUT");
	}
	return patch;
};

const prepareCategoryEdit = async (
	ctx: QueryCtx,
	user: Doc<"users">,
	input: Infer<typeof categoryEditInput>
) => {
	const userId = user._id;
	const categoryId = ctx.db.normalizeId("categories", input.categoryId);
	if (!categoryId) {
		throw new ConvexError("NOT_FOUND");
	}
	const category = await validateCategoryOwnership(ctx, categoryId, userId);
	const cycle = await validateCycleOwnership(ctx, category.cycleId, userId);
	const storedPlan = presentStoredPlan(category.plannedAmount);
	if (typeof storedPlan === "string" && input.plannedAmount === undefined) {
		throw new ConvexError("CATEGORY_PLAN_REPAIR_REQUIRED");
	}
	const patch = await resolveCategoryEditPatch(ctx, userId, input);
	const edited = { ...category, ...patch };
	const [oldType, newType] = await Promise.all([
		category.categoryTypeId ? ctx.db.get(category.categoryTypeId) : null,
		edited.categoryTypeId ? ctx.db.get(edited.categoryTypeId) : null,
	]);
	const before = {
		...presentCategory(category, oldType?.userId === userId ? oldType : null),
		plannedAmount: storedPlan,
	};
	const after = presentCategory(
		edited,
		newType?.userId === userId ? newType : null
	);
	const preferredCurrency =
		typeof before.plannedAmount === "number" ||
		typeof after.plannedAmount === "number"
			? getEffectivePreferredCurrency(user.currency)
			: undefined;
	// Bind the effective currency only when writing a numeric budget. A clear
	// or an unrelated edit can still apply after a preference change.
	// Compare actual stored values so changes from any writer, including Web,
	// invalidate a stale preview without requiring a category revision migration.
	const editSnapshot = await fingerprintRequest({
		afterType: after.categoryType,
		before: {
			categoryType: before.categoryType,
			categoryTypeId: category.categoryTypeId,
			cycleId: category.cycleId,
			icon: category.icon,
			name: category.name,
			plannedAmount: storedPlan,
		},
		cycleName: cycle.name,
		input,
		preferredCurrency:
			typeof input.plannedAmount === "number" ? preferredCurrency : undefined,
	});
	return {
		after,
		before,
		categoryId,
		cycleName: cycle.name,
		editSnapshot,
		patch,
		preferredCurrency,
	};
};

export const previewCategoryEdit = query({
	args: categoryEditInput.fields,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { after, before, cycleName, editSnapshot, preferredCurrency } =
				await prepareCategoryEdit(ctx, user, args);
			return { after, before, cycleName, editSnapshot, preferredCurrency };
		}),
	returns: v.object({
		after: categorySummaryValidator,
		before: v.object({
			...categorySummaryValidator.fields,
			plannedAmount: storedCategoryPlanValidator,
		}),
		cycleName: v.string(),
		editSnapshot: v.string(),
		preferredCurrency: v.optional(v.string()),
	}),
});

export const editCategory = mutation({
	args: {
		...categoryEditInput.fields,
		agent: v.optional(v.boolean()),
		expectedEditSnapshot: v.string(),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const { agent, expectedEditSnapshot, idempotencyKey, ...input } = args;
			if (!editSnapshotPattern.test(expectedEditSnapshot)) {
				throw new ConvexError("INVALID_INPUT");
			}
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const { after, categoryId, editSnapshot, patch } =
						await prepareCategoryEdit(ctx, user, input);
					if (editSnapshot !== expectedEditSnapshot) {
						throw new ConvexError("CATEGORY_EDIT_CONFLICT");
					}
					await ctx.db.patch(categoryId, patch);
					return after;
				},
				key: idempotencyKey,
				operation: "categories.edit",
				request: { ...input, agent, expectedEditSnapshot },
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

const tagCreateFields = { name: v.string() };
const tagWriteValidator = v.object({ ...tagCreateFields, id: v.id("tags") });

export const previewTagCreate = query({
	args: tagCreateFields,
	handler: async (ctx, args) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			const name = await planStandaloneTag(ctx, user._id, args.name);
			return { name };
		}),
	returns: v.object(tagCreateFields),
});

export const createTag = mutation({
	args: {
		...tagCreateFields,
		agent: v.optional(v.boolean()),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, { idempotencyKey, agent, ...input }) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const name = await planStandaloneTag(ctx, user._id, input.name);
					return { id: await insertOwnedTag(ctx, user._id, name), name };
				},
				key: idempotencyKey,
				operation: "tags.create",
				request: { ...input, agent },
				userId: user._id,
			});
		}),
	returns: tagWriteValidator,
});

const tagRenameFields = { ...tagCreateFields, tagId: v.string() };

export const previewTagRename = query({
	args: tagRenameFields,
	handler: async (ctx, input) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			return await planTagRename(ctx, user._id, input);
		}),
	returns: v.object({
		...tagWriteValidator.fields,
		beforeName: v.string(),
		editSnapshot: v.string(),
	}),
});

export const renameTag = mutation({
	args: {
		...tagRenameFields,
		agent: v.optional(v.boolean()),
		expectedEditSnapshot: v.string(),
		idempotencyKey: v.string(),
	},
	handler: async (
		ctx,
		{ agent, expectedEditSnapshot, idempotencyKey, ...input }
	) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			if (!editSnapshotPattern.test(expectedEditSnapshot)) {
				throw new ConvexError("INVALID_INPUT");
			}
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const { id, name } = await planTagRename(
						ctx,
						user._id,
						input,
						expectedEditSnapshot
					);
					await ctx.db.patch(id, { name });
					return { id, name };
				},
				key: idempotencyKey,
				operation: "tags.rename",
				request: { ...input, agent, expectedEditSnapshot },
				userId: user._id,
			});
		}),
	returns: tagWriteValidator,
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
					.take(MAXIMUM_CATEGORY_TYPES + 1),
			]);
			if (
				expenses.length > MAXIMUM_SUMMARY_EXPENSES ||
				categories.length > MAXIMUM_CATEGORIES ||
				categoryTypes.length > MAXIMUM_CATEGORY_TYPES
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
