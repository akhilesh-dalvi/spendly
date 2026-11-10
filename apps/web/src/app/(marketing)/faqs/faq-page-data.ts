import type { FaqItem } from "@/components/faq-data";

interface FaqStep {
	href?: string;
	text: string;
}

interface FaqPageItem extends FaqItem {
	steps?: readonly FaqStep[];
}

const aiSetupSteps: readonly FaqStep[] = [
	{
		href: "/docs/cli#install-and-sign-in",
		text: "Install the Spendly CLI and sign in.",
	},
	{
		href: "/docs/cli/ai-agents#install-the-skill",
		text: "Install the Spendly skill for your local AI agent, then start a new agent session.",
	},
	{ text: "Start with a request like: 'Show my spending this cycle.'" },
	{
		text: "For changes, ask for a preview first: 'Preview adding 20 for groceries today. Do not save it yet.'",
	},
	{
		text: "Check the details before asking the agent to save, then read back the result.",
	},
];

export interface FaqGroup {
	id: string;
	items: readonly FaqPageItem[];
	title: string;
}

export const faqPageGroups: readonly FaqGroup[] = [
	{
		id: "getting-started",
		items: [
			{
				answer:
					"In the web app, choose your currency and a starting path, then create a cycle - a date range for your spending. Add an expense: something you spent money on, like groceries or a taxi ride. Enter an amount and a date within that cycle.",
				id: "first-expense",
				question: "How do I start recording expenses?",
			},
			{
				answer:
					'Both starting paths require a cycle. Categories, category types, tags, notes, planned amounts, and accounts are optional. Choose "Start tracking freely" to begin without setting planned amounts.',
				id: "optional-setup",
				question: "What can I skip during setup?",
			},
			{
				answer:
					"Yes. All current web and CLI features are free to use, including expense tracking, optional planning, and cycle comparisons.",
				id: "free-use",
				question: "Can I use Spendly for free?",
			},
			{
				answer:
					"No. Planned amounts are optional. Set an amount for a category in a cycle if it helps, and edit it later. Spending over that amount does not block you from saving expenses.",
				id: "optional-planning",
				question: "Do I need to set planned amounts?",
			},
		],
		title: "Getting started",
	},
	{
		id: "using-ai",
		items: [
			{
				answer:
					"Yes, through the Spendly CLI and skill, not a chat inside the web app. A local AI agent with terminal access can read your spending and run supported actions, such as adding or editing expenses. You describe the task, and the agent uses the CLI on your computer.",
				id: "ai-actions",
				question: "Can an AI agent manage expenses for me?",
			},
			{
				answer: aiSetupSteps.map((step) => step.text).join(" "),
				id: "ai-getting-started",
				question: "How do I start using an AI agent with Spendly?",
				steps: aiSetupSteps,
			},
			{
				answer:
					"Financial details the agent reads may be sent to its AI provider. Review that provider's privacy and data-use settings. Use a trusted computer, and never share credentials or sign-in tokens. If a save result is unclear, ask the agent to check existing records before trying again.",
				id: "ai-privacy",
				question: "What should I check before letting an AI agent act?",
			},
		],
		title: "Using AI",
	},
	{
		id: "cycles-and-dates",
		items: [
			{
				answer:
					"No. Choose a date range such as a pay period or semester. The start date is included; the end date is not. For July spending, use July 1 as the start and August 1 as the end. Cycles cannot overlap, but one can start on the day another ends.",
				id: "cycle-dates",
				question: "Do cycles have to follow calendar months?",
			},
			{
				answer:
					"Yes, if its dates do not overlap another cycle. Set the end date to the day after the last day you want to include. If a trip falls inside an existing cycle, keep that cycle and use a tag to group the trip expenses instead.",
				id: "trip-cycle",
				question: "Can I make a cycle for a trip or project?",
			},
			{
				answer:
					"In the web app, create a cycle covering the expense date, or correct the date if it is wrong. Past dates are allowed. Check the end date: it is excluded, so an expense on that day needs a different cycle.",
				id: "outside-cycle",
				question: "Why can't I save an expense outside my cycle dates?",
			},
			{
				answer:
					"Yes. Past expenses and cycles remain editable. Cycle dates must still form a valid, non-overlapping range. After changing cycle dates, review the affected expenses rather than assuming they have moved automatically.",
				id: "editable-history",
				question: "Can I edit old expenses and past cycles?",
			},
		],
		title: "Cycles and dates",
	},
	{
		id: "organizing-and-reviewing",
		items: [
			{
				answer:
					"Categories group similar expenses within a cycle: Groceries, Rent, Dining out, or Gifts. Category types group those categories under custom labels, such as Groceries and Rent under Needs, or Dining out and Gifts under Wants. Both are optional. Savings is also just a label, not a savings-tracking feature.",
				id: "categories-and-types",
				question:
					"What's the difference between a category and a category type?",
			},
			{
				answer:
					"Yes. Each cycle has its own categories, so you can add, rename, reorder, or remove them as your needs change. Removing a category clears that category assignment from its expenses; it does not delete the expenses.",
				id: "changing-categories",
				question: "Can I change categories from one cycle to another?",
			},
			{
				answer:
					"Use a tag to find related expenses across categories or cycles. For example, give a trip's taxi and dining expenses the same trip tag, then filter by it. Tags are optional and reusable across your cycles.",
				id: "using-tags",
				question: "When should I use a tag?",
			},
			{
				answer:
					"Select 2-5 cycles to compare total spending, total planned amounts, and category breakdowns side by side. Check each cycle's length and purpose before drawing conclusions: a longer period or a trip may explain a difference. Comparison does not enforce spending targets.",
				id: "comparison",
				question: "What can I compare between cycles?",
			},
		],
		title: "Organizing and reviewing",
	},
	{
		id: "product-boundaries-and-help",
		items: [
			{
				answer:
					"No. Spendly focuses on expenses, optional planning, and comparison. Income tracking and bank integration are intentionally outside that focus. Optional accounts let you record balances, adjustments, and transfers without connecting to a bank.",
				id: "income-and-banks",
				question: "Does Spendly track income or connect to my bank?",
			},
			{
				answer:
					"Yes. Spendly also has a command-line tool (CLI) for recording expenses from a terminal. Use the web app if you prefer forms and visual spending reviews.",
				id: "cli-entry",
				question: "Can I add expenses without opening the web app?",
			},
		],
		title: "Product boundaries and help",
	},
];
