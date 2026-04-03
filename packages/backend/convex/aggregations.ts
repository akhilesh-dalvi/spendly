import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUser, validateCycleOwnership } from "./helpers";

export const getCycleSummary = query({
	args: { cycleId: v.id("expense_cycles") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const cycle = await validateCycleOwnership(ctx, args.cycleId, user._id);

		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", args.cycleId))
			.collect();

		const categories = await ctx.db
			.query("categories")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", args.cycleId))
			.collect();

		const categoryTypes = await ctx.db
			.query("category_types")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();

		const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
		const totalPlanned = categories.reduce(
			(sum, c) => sum + (c.plannedAmount || 0),
			0
		);

		const today = new Date().toISOString().split("T")[0];
		let daysRemaining: number | null = null;
		if (cycle.endDate > today) {
			const end = new Date(cycle.endDate).getTime();
			const now = new Date(today).getTime();
			daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
		}

		// Group by category
		const categoryStats = await Promise.all(
			categories.map(async (cat) => {
				const catExpenses = expenses.filter((e) => e.categoryId === cat._id);
				const spent = catExpenses.reduce((sum, e) => sum + e.amount, 0);
				const type = cat.categoryTypeId
					? await ctx.db.get(cat.categoryTypeId)
					: null;

				return {
					categoryId: cat._id,
					name: cat.name,
					icon: cat.icon ?? null,
					typeId: cat.categoryTypeId ?? null,
					typeName: type?.name ?? null,
					typeColor: type?.color ?? null,
					planned: cat.plannedAmount ?? null,
					spent,
					isHidden: cat.isHidden ?? false,
					diff:
						cat.plannedAmount !== undefined ? cat.plannedAmount - spent : null,
					progress:
						cat.plannedAmount && cat.plannedAmount > 0
							? (spent / cat.plannedAmount) * 100
							: null,
				};
			})
		);
		const uncategorizedSpent = expenses
			.filter((e) => !e.categoryId)
			.reduce((sum, e) => sum + e.amount, 0);
		const uncategorizedEntry =
			uncategorizedSpent > 0
				? [
						{
							categoryId: "uncategorized",
							name: "Uncategorized",
							icon: "❓",
							typeId: null,
							typeName: "Uncategorized",
							typeColor: null,
							planned: null,
							spent: uncategorizedSpent,
							isHidden: false,
							diff: null,
							progress: null,
						},
					]
				: [];
		const categoryStatsWithUncategorized = [
			...categoryStats,
			...uncategorizedEntry,
		];

		// Group by type
		const typeStats = [
			...categoryTypes.map((type) => {
				const typeCategories = categoryStatsWithUncategorized.filter(
					(c) => c.typeId === type._id
				);
				return {
					typeId: type._id,
					typeName: type.name,
					typeColor: type.color ?? null,
					totalPlanned: typeCategories.reduce(
						(sum, c) => sum + (c.planned || 0),
						0
					),
					totalSpent: typeCategories.reduce((sum, c) => sum + c.spent, 0),
					categories: typeCategories,
				};
			}),
			{
				typeId: null,
				typeName: "Uncategorized",
				typeColor: null,
				totalPlanned: categoryStatsWithUncategorized
					.filter((c) => c.typeId === null)
					.reduce((sum, c) => sum + (c.planned || 0), 0),
				totalSpent: categoryStatsWithUncategorized
					.filter((c) => c.typeId === null)
					.reduce((sum, c) => sum + c.spent, 0),
				categories: categoryStatsWithUncategorized.filter(
					(c) => c.typeId === null
				),
			},
		];

		return {
			cycleId: cycle._id,
			cycleName: cycle.name,
			startDate: cycle.startDate,
			endDate: cycle.endDate,
			totalSpent,
			totalPlanned,
			remaining: totalPlanned - totalSpent,
			daysRemaining,
			categoryStats: categoryStatsWithUncategorized,
			typeStats,
		};
	},
});

export const getHistoricalCategoryStats = query({
	args: { currentCycleId: v.id("expense_cycles") },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		const currentCycle = await ctx.db.get(args.currentCycleId);
		if (!currentCycle || currentCycle.userId !== user._id) {
			return null;
		}

		// Find the cycle immediately preceding the current one
		const previousCycle = await ctx.db
			.query("expense_cycles")
			.withIndex("by_userId_dates", (q) =>
				q.eq("userId", user._id).lt("startDate", currentCycle.startDate)
			)
			.order("desc")
			.first();

		if (!previousCycle) {
			return null;
		}

		const expenses = await ctx.db
			.query("expenses")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", previousCycle._id))
			.collect();

		const categories = await ctx.db
			.query("categories")
			.withIndex("by_cycleId", (q) => q.eq("cycleId", previousCycle._id))
			.collect();

		// Map category name to total spent in that category
		const stats: Record<string, number> = {};
		for (const cat of categories) {
			const catExpenses = expenses.filter((e) => e.categoryId === cat._id);
			stats[cat.name] = catExpenses.reduce((sum, e) => sum + e.amount, 0);
		}

		return {
			cycleName: previousCycle.name,
			stats,
		};
	},
});

export const compareMultiple = query({
	args: { cycleIds: v.array(v.id("expense_cycles")) },
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);

		if (args.cycleIds.length < 2 || args.cycleIds.length > 5) {
			throw new Error("Select between 2 and 5 cycles for comparison");
		}

		return await Promise.all(
			args.cycleIds.map(async (cycleId) => {
				const cycle = await ctx.db.get(cycleId);
				if (!cycle || cycle.userId !== user._id) {
					throw new Error(`Cycle ${cycleId} not found or access denied`);
				}

				const expenses = await ctx.db
					.query("expenses")
					.withIndex("by_cycleId", (q) => q.eq("cycleId", cycleId))
					.collect();

				const categories = await ctx.db
					.query("categories")
					.withIndex("by_cycleId", (q) => q.eq("cycleId", cycleId))
					.collect();

				const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
				const totalPlanned = categories.reduce(
					(sum, c) => sum + (c.plannedAmount || 0),
					0
				);

				const categoryBreakdown = categories.map((cat) => {
					const catExpenses = expenses.filter((e) => e.categoryId === cat._id);
					return {
						categoryName: cat.name,
						spent: catExpenses.reduce((sum, e) => sum + e.amount, 0),
						planned: cat.plannedAmount ?? null,
					};
				});

				return {
					cycleId: cycle._id,
					cycleName: cycle.name,
					startDate: cycle.startDate,
					endDate: cycle.endDate,
					totalSpent,
					totalPlanned,
					categoryBreakdown,
				};
			})
		);
	},
});
