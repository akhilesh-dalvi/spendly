import { describe, expect, it, vi } from "vitest";
import { accountSchema, categorySchema } from "../domain/read-schemas.js";
import type {
	InteractivePrompter,
	SelectPromptOptions,
} from "../input/types.js";
import {
	selectAccountMode,
	selectCategoryMode,
} from "./interactive-support.js";

const account = accountSchema.parse({
	accountType: {
		balanceNature: "asset",
		color: "#22C55E",
		icon: "wallet",
		id: "account-type-wallet",
		name: "Wallet",
	},
	createdAt: "2026-09-01T08:00:00.000Z",
	currency: "INR",
	currentBalance: 195,
	id: "account-phase-destination-8e6ea7",
	isArchived: false,
	isDefault: false,
	name: "Phase 8.6 Agent Destination 20260911",
	revision: 1,
	startingBalance: 250,
	updatedAt: "2026-09-15T08:00:00.000Z",
});

const category = categorySchema.parse({
	categoryType: {
		color: "#F97316",
		id: "category-type-needs",
		name: "Needs",
	},
	createdAt: "2026-09-01T08:00:00.000Z",
	cycleId: "cycle-september",
	icon: "utensils",
	id: "category-food",
	isHidden: false,
	name: "Food",
	order: 0,
	plannedAmount: 1000,
});

describe("interactive category choices", () => {
	it("puts date-scoped categories before fallback choices", async () => {
		let received: SelectPromptOptions | undefined;
		const prompter = {
			select: vi.fn((options: SelectPromptOptions) => {
				received = options;
				return Promise.resolve("category-food");
			}),
		} as unknown as InteractivePrompter;

		await selectCategoryMode({
			categories: [category],
			message: "Choose a category for 2026-09-15",
			prompter,
		});

		expect(received?.options).toEqual([
			expect.objectContaining({ label: "Food", value: "category-food" }),
			{ label: "Uncategorized", value: "clear" },
		]);
	});

	it("explains when the selected date has no visible categories", async () => {
		let received: SelectPromptOptions | undefined;
		const prompter = {
			select: vi.fn((options: SelectPromptOptions) => {
				received = options;
				return Promise.resolve("clear");
			}),
		} as unknown as InteractivePrompter;

		await selectCategoryMode({
			categories: [],
			message: "Choose a category for 2026-09-15",
			prompter,
		});

		expect(received?.options[0]).toMatchObject({
			disabled: true,
			hint: "The selected date has no cycle with visible categories",
			label: "No visible categories for this date",
		});
		expect(received?.options).toHaveLength(2);
		expect(received?.options[1]).toEqual({
			label: "Uncategorized",
			value: "clear",
		});
	});
});

describe("interactive account choices", () => {
	it("shows useful account context without exposing shortened internal IDs", async () => {
		let received: SelectPromptOptions | undefined;
		const prompter = {
			select: vi.fn((options: SelectPromptOptions) => {
				received = options;
				return Promise.resolve("automatic");
			}),
		} as unknown as InteractivePrompter;

		await selectAccountMode({
			accounts: [account],
			message: "Choose an account",
			prompter,
			withAutomatic: true,
		});

		expect(received?.options).toEqual([
			{
				label: "Use the default account automatically",
				value: "automatic",
			},
			{ label: "Leave unassigned", value: "clear" },
			{
				hint: "INR 195.00",
				label: "Phase 8.6 Agent Destination 20260911",
				value: "account-phase-destination-8e6ea7",
			},
		]);
		expect(JSON.stringify(received?.options)).not.toContain("…");
	});
});
