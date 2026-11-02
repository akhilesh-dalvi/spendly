import type { Id } from "../../backend/convex/_generated/dataModel";
import { api } from "./backend-api";
import type { E2EUser, seedUser } from "./users";

type ExpenseSeed = Awaited<ReturnType<typeof seedUser>>;

export const seedExpenseMetadata = async (
	user: E2EUser,
	cycleId: Id<"expense_cycles">
) => {
	const meals = await user.mutation(api.categories.create, {
		cycleId,
		name: "E2E Meals",
		plannedAmount: 100,
	});
	const travel = await user.mutation(api.categories.create, {
		cycleId,
		name: "E2E Travel",
		plannedAmount: 200,
	});
	if (!(meals && travel)) {
		throw new Error("Expense regression category seed was not persisted");
	}
	const workId = await user.mutation(api.tags.create, { name: "E2E Work" });
	const personalId = await user.mutation(api.tags.create, {
		name: "E2E Personal",
	});
	return { meals, personalId, travel, workId };
};

export const seedExpenseCycleBoundary = async (
	user: E2EUser,
	seed: ExpenseSeed
) => {
	const tomorrow = new Date(`${seed.date}T00:00:00.000Z`);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	const boundary = tomorrow.toISOString().slice(0, 10);
	await user.mutation(api.cycles.update, {
		endDate: boundary,
		id: seed.cycleId,
		name: "E2E Before boundary",
	});
	const nextCycle = await user.mutation(api.cycles.create, {
		endDate: "2030-01-01",
		name: "E2E After boundary",
		startDate: boundary,
	});
	if (!nextCycle) {
		throw new Error("Expense regression next cycle was not persisted");
	}
	// Deliberately identical names: an old-cycle ID must not silently carry over.
	const oldCategory = await user.mutation(api.categories.create, {
		cycleId: seed.cycleId,
		name: "E2E Boundary meals",
	});
	const newCategory = await user.mutation(api.categories.create, {
		cycleId: nextCycle._id,
		name: "E2E Boundary meals",
	});
	if (!(oldCategory && newCategory)) {
		throw new Error(
			"Expense regression boundary categories were not persisted"
		);
	}
	return { boundary, newCategory, nextCycle, oldCategory };
};

export const readExpenseFinancialState = async (
	user: E2EUser,
	seed: ExpenseSeed
) => {
	const [wallet, savings, walletLedger, savingsLedger] = await Promise.all([
		user.query(api.cli.v1.accounts.get, { accountId: seed.accountId }),
		user.query(api.cli.v1.accounts.get, { accountId: seed.destinationId }),
		user.query(api.accounts.listTransactions, { accountId: seed.accountId }),
		user.query(api.accounts.listTransactions, {
			accountId: seed.destinationId,
		}),
	]);
	return { savings, savingsLedger, wallet, walletLedger };
};
