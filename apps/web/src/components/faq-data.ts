export interface FaqItem {
	answer: string;
	id: string;
	question: string;
}

export const faqItems: FaqItem[] = [
	{
		id: "item-1",
		question: "Can I use Spendly for free?",
		answer:
			"Yes. You can start by tracking expenses right away, then add more structure only if and when you want it.",
	},
	{
		id: "item-2",
		question: "Do I need to set planned amounts before tracking?",
		answer:
			"No. Planning is optional. You can track first and add planned amounts later for any cycle.",
	},
	{
		id: "item-3",
		question: "Can I edit old expenses or past cycles?",
		answer:
			"Yes. Historical data is editable so you can correct entries and keep records accurate over time.",
	},
	{
		id: "item-4",
		question: "Can I organize spending my own way?",
		answer:
			"Yes. Category types, categories, and tags are user-defined, so the structure matches your preferences.",
	},
	{
		id: "item-5",
		question: "What does compare mode tell me?",
		answer:
			"Compare mode is observational. It highlights what changed across cycles so you can learn from trends without judgment.",
	},
	{
		id: "item-6",
		question: "Do I have to use calendar months?",
		answer:
			"No. Spendly is built around flexible cycles, so you can track by pay period, trip, semester, project, or any date range that fits your life.",
	},
	{
		id: "item-7",
		question:
			"What happens if an expense date falls outside my current cycles?",
		answer:
			"Spendly lets you create the expense and then prompts you to create the missing cycle, so tracking never gets blocked by setup.",
	},
	{
		id: "item-8",
		question: "Can categories change from one cycle to another?",
		answer:
			"Yes. Categories are cycle-scoped, which means you can rename, reorder, add, or remove them as your spending patterns change over time.",
	},
	{
		id: "item-9",
		question: "Does Spendly track income?",
		answer:
			"No. Spendly focuses on expense observation, optional planning, and comparison. It is intentionally not designed as an income-tracking app.",
	},
	{
		id: "item-10",
		question: "Can I add tags to expenses?",
		answer:
			"Yes. Tags are optional and global across cycles, which makes them useful for filtering context like work trips, recurring costs, gifts, or emergencies.",
	},
	{
		id: "item-11",
		question: "Is overspending treated like an error?",
		answer:
			"No. Spendly does not enforce hard budget rules. If you plan amounts, they are there for context rather than judgment.",
	},
	{
		id: "item-12",
		question: "Who is Spendly built for?",
		answer:
			"It is designed for people who want clearer expense visibility, especially when their income, routine, or spending rhythm does not fit strict budgeting systems.",
	},
] as const;
