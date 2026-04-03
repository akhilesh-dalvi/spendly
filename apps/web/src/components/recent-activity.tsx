"use client";

import {
	format as formatDate,
	formatDistanceToNow,
	isThisWeek,
	isToday,
	isYesterday,
	parseISO,
} from "date-fns";
import { ArrowRight, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/use-currency";
import { EmptyState } from "./ui/empty-state";

interface ExpenseWithDetails {
	_id: string;
	categoryId?: string | null;
	amount: number;
	date: string;
	spentOn?: string | null;
	categoryName: string | null;
	categoryIcon?: string | null;
	categoryTypeColor?: string | null;
}

interface RecentActivityProps {
	expenses: ExpenseWithDetails[];
}

export function RecentActivity({ expenses }: RecentActivityProps) {
	const { format } = useCurrency();

	const groupedExpenses = useMemo(() => {
		const groups: { title: string; items: ExpenseWithDetails[] }[] = [];
		let currentTitle = "";
		let currentGroup: ExpenseWithDetails[] = [];

		for (const expense of expenses) {
			const date = parseISO(expense.date);
			let title = "";

			if (isToday(date)) {
				title = "Today";
			} else if (isYesterday(date)) {
				title = "Yesterday";
			} else if (isThisWeek(date)) {
				title = "This Week";
			} else {
				title = formatDate(date, "MMM d, yyyy");
			}

			if (title !== currentTitle) {
				if (currentGroup.length > 0) {
					groups.push({ title: currentTitle, items: currentGroup });
				}
				currentTitle = title;
				currentGroup = [expense];
			} else {
				currentGroup.push(expense);
			}
		}

		if (currentGroup.length > 0) {
			groups.push({ title: currentTitle, items: currentGroup });
		}

		return groups;
	}, [expenses]);

	return (
		<>
			{expenses.length === 0 && (
				<EmptyState
					action={
						<Button asChild size="sm" variant="outline">
							<Link href="/expenses/new">
								<Plus className="mr-2 h-4 w-4" />
								Add Expense
							</Link>
						</Button>
					}
					className="min-h-[320px]"
					description="Start tracking your spending by adding your first expense."
					icon={<Receipt className="h-10 w-10" />}
					title="No transactions"
				/>
			)}
			{groupedExpenses.map((group) => (
				<div className="space-y-2" key={group.title}>
					<h3 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						{group.title}
					</h3>
					<ul className="space-y-1">
						{group.items.map((expense) => (
							<li key={expense._id}>
								<Link
									className="group -mx-3 flex cursor-pointer items-center gap-4 rounded-xl p-3 transition-all hover:bg-accent/40"
									href={`/expenses/${expense._id}`}
								>
									<div
										className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background text-xl shadow-sm transition-colors group-hover:border-primary/20 group-hover:bg-primary/5"
										style={{
											backgroundColor: expense.categoryTypeColor
												? `${expense.categoryTypeColor}15`
												: undefined,
											borderColor: expense.categoryTypeColor
												? `${expense.categoryTypeColor}30`
												: undefined,
										}}
									>
										{expense.categoryId ? expense.categoryIcon || "📦" : "❓"}
									</div>{" "}
									<div className="flex flex-1 flex-col overflow-hidden">
										<div className="mr-2 flex items-center justify-between gap-2">
											<p className="truncate font-medium text-sm">
												{expense.spentOn || (
													<span className="text-muted-foreground/50 italic">
														No description
													</span>
												)}
											</p>
											<div className="min-w-[4rem] text-right font-bold text-sm tabular-nums">
												{format(expense.amount)}
											</div>
										</div>
										<div className="flex items-center justify-between gap-2 text-xs">
											<div className="flex items-center gap-1.5 truncate text-muted-foreground">
												<span>{expense.categoryName || "Uncategorized"}</span>
												<span>•</span>
												<time
													dateTime={expense.date}
													title={formatDate(parseISO(expense.date), "PPpp")}
												>
													{formatDistanceToNow(parseISO(expense.date), {
														addSuffix: true,
													})}
												</time>
											</div>
										</div>
									</div>
								</Link>
							</li>
						))}
					</ul>
				</div>
			))}

			{expenses.length > 0 && (
				<Button asChild className="mt-2 w-full" variant="link">
					<Link
						className="flex items-center justify-center gap-2"
						href="/expenses"
					>
						View full history
						<ArrowRight className="h-4 w-4" />
					</Link>
				</Button>
			)}
		</>
	);
}
