"use client";

import { differenceInDays, parseISO, startOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCurrency } from "@/hooks/use-currency";
import { formatAccountMoney } from "@/lib/accounts";
import { cn } from "@/lib/utils";

interface AccountSummaryItem {
	accountTypeName: string;
	isDefault: boolean;
	name: string;
}

interface AccountBalanceTotal {
	currency: string;
	total: number;
}

interface AccountSummary {
	accounts: AccountSummaryItem[];
	totals: AccountBalanceTotal[];
}

interface DashboardSummaryProps {
	accountSummary: AccountSummary;
	summary: {
		totalSpent: number;
		totalPlanned: number;
		startDate: string;
		endDate: string;
		daysRemaining: number | null;
	};
}

function getBudgetOverview({
	isFuture,
	isPast,
	totalPlanned,
	totalSpent,
}: {
	isFuture: boolean;
	isPast: boolean;
	totalPlanned: number;
	totalSpent: number;
}) {
	const remaining = totalPlanned - totalSpent;
	const isOverBudget = !isFuture && remaining < 0;
	let label = totalPlanned > 0 ? "Budget left" : "No budget planned";
	let value = remaining;

	if (isFuture) {
		label = "Planned budget";
		value = totalPlanned;
	} else if (isOverBudget) {
		label = "Over budget";
		value = Math.abs(remaining);
	} else if (isPast) {
		label = "Unspent budget";
	}

	let progress = 0;
	if (totalPlanned > 0) {
		progress = Math.min(100, (totalSpent / totalPlanned) * 100);
	} else if (isOverBudget) {
		progress = 100;
	}

	return {
		hasValue: totalPlanned > 0 || isOverBudget,
		isOverBudget,
		label,
		progress,
		spentPercentage:
			totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0,
		value,
	};
}

function getCycleStatus({
	daysRemaining,
	isFuture,
	isPast,
	start,
	today,
}: {
	daysRemaining: number | null;
	isFuture: boolean;
	isPast: boolean;
	start: Date;
	today: Date;
}) {
	if (isFuture) {
		const daysUntilStart = Math.max(0, differenceInDays(start, today));
		return {
			label: "Upcoming",
			detail: `Starts in ${daysUntilStart} ${daysUntilStart === 1 ? "day" : "days"}`,
		};
	}

	if (isPast) {
		return { label: "Ended", detail: "Past cycle" };
	}

	const remainingDays = Math.max(0, daysRemaining ?? 0);
	return {
		label: "Active",
		detail: `${remainingDays} ${remainingDays === 1 ? "day" : "days"} left`,
	};
}

function TrackedFundsSummary({
	accountSummary,
}: {
	accountSummary: AccountSummary;
}) {
	const defaultAccount = accountSummary.accounts.find(
		(account) => account.isDefault
	);
	const accountCount = accountSummary.accounts.length;
	const accountCountLabel = `${accountCount} ${accountCount === 1 ? "account" : "accounts"}`;
	const hasMultipleCurrencies = accountSummary.totals.length > 1;

	return (
		<section
			aria-labelledby="tracked-funds-heading"
			className="border-t bg-muted/15 p-5 sm:p-6 lg:border-t-0 lg:border-l"
		>
			<h2
				className="font-bold text-[11px] text-muted-foreground uppercase tracking-[0.16em]"
				id="tracked-funds-heading"
			>
				Tracked funds
			</h2>

			{accountSummary.totals.length > 0 ? (
				<div className="mt-3 space-y-1.5">
					{accountSummary.totals.map(({ currency, total }) => (
						<div className="flex flex-wrap items-baseline gap-2" key={currency}>
							<p className="font-medium text-3xl tabular-nums tracking-tight">
								{formatAccountMoney(total, currency)}
							</p>
							{hasMultipleCurrencies && (
								<span className="font-medium text-muted-foreground text-xs uppercase">
									{currency}
								</span>
							)}
						</div>
					))}
				</div>
			) : (
				<p className="mt-3 font-medium text-3xl tracking-tight">—</p>
			)}

			<p className="mt-2 text-muted-foreground text-sm">
				Across {accountCountLabel}
			</p>

			<div className="mt-6 space-y-3 border-t pt-4 text-sm">
				<div className="flex items-center justify-between gap-4">
					<span className="text-muted-foreground">New expenses use</span>
					<span className="max-w-40 truncate font-medium">
						{defaultAccount
							? `${defaultAccount.name} · ${defaultAccount.accountTypeName}`
							: "No default"}
					</span>
				</div>
				{hasMultipleCurrencies && (
					<div className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground">
							Balances stay separate
						</span>
						<span className="font-medium">
							{accountSummary.totals.length} currencies
						</span>
					</div>
				)}
			</div>
		</section>
	);
}

export function DashboardSummary({
	accountSummary,
	summary,
}: DashboardSummaryProps) {
	const { format: formatCurrency } = useCurrency();
	const totalSpent = summary.totalSpent || 0;
	const totalPlanned = summary.totalPlanned || 0;

	const today = startOfDay(new Date());
	const start = parseISO(summary.startDate);
	const end = parseISO(summary.endDate);
	const isFuture = today < start;
	const isPast = today > end;
	const {
		hasValue: hasBudgetValue,
		isOverBudget,
		label: budgetLabel,
		progress: budgetProgress,
		spentPercentage,
		value: budgetValue,
	} = getBudgetOverview({ isFuture, isPast, totalPlanned, totalSpent });
	const { detail: cycleDetail, label: cycleStatus } = getCycleStatus({
		daysRemaining: summary.daysRemaining,
		isFuture,
		isPast,
		start,
		today,
	});

	return (
		<div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.8fr)]">
			<section aria-labelledby="cycle-budget-heading" className="p-5 sm:p-6">
				<div className="flex flex-wrap items-center gap-2">
					<Badge
						className={cn(
							"border-0 px-2.5 py-1",
							isPast && "bg-muted text-muted-foreground",
							isFuture &&
								"bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
							!(isPast || isFuture) &&
								"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
						)}
						variant="secondary"
					>
						{cycleStatus}
					</Badge>
					<span className="text-muted-foreground text-sm">{cycleDetail}</span>
				</div>

				<div className="mt-6">
					<h2
						className="font-bold text-[11px] text-muted-foreground uppercase tracking-[0.16em]"
						id="cycle-budget-heading"
					>
						{budgetLabel}
					</h2>
					<p
						className={cn(
							"mt-2 font-medium text-3xl tabular-nums tracking-tight sm:text-4xl",
							isOverBudget && "text-destructive"
						)}
					>
						{hasBudgetValue ? formatCurrency(budgetValue) : "—"}
					</p>
				</div>

				<div className="mt-6 max-w-2xl">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
						<p className="text-muted-foreground">
							<span className="font-medium text-foreground">
								{formatCurrency(totalSpent)}
							</span>{" "}
							spent of {formatCurrency(totalPlanned)} planned
						</p>
						{totalPlanned > 0 && (
							<span className="font-medium tabular-nums">
								{spentPercentage}% spent
							</span>
						)}
					</div>
					<Progress
						aria-label="Budget spent"
						className={cn(
							"h-2 bg-primary/10",
							isOverBudget &&
								"[&_[data-slot=progress-indicator]]:bg-destructive"
						)}
						value={budgetProgress}
					/>
				</div>
			</section>

			<TrackedFundsSummary accountSummary={accountSummary} />
		</div>
	);
}
