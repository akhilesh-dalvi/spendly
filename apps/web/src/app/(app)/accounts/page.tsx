"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowUpRight, ChevronLeft, Plus, WalletCards } from "lucide-react";
import Link from "next/link";
import { AccountActionDialogs } from "@/components/account-actions";
import { AccountBalanceOverview } from "@/components/account-balance-overview";
import { AccountTypeIcon } from "@/components/account-type-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAccountMoney, type ResolvedAccount } from "@/lib/accounts";

type Account = ResolvedAccount;

const getTotalsByCurrency = (
	accounts: Account[],
	defaultCurrency: string
): Map<string, number> => {
	const totals = new Map<string, number>();
	for (const account of accounts) {
		const currency = account.currency ?? defaultCurrency;
		totals.set(currency, (totals.get(currency) ?? 0) + account.currentBalance);
	}
	return totals;
};

function AccountsLoading() {
	return (
		<div className="flex flex-col gap-8 py-3">
			<div className="flex items-center justify-between gap-4">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-40" />
					<Skeleton className="h-4 w-72 max-w-full" />
				</div>
				<Skeleton className="h-9 w-32" />
			</div>
			<Skeleton className="h-40 w-full rounded-xl" />
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{["one", "two", "three"].map((key) => (
					<Skeleton className="h-48 rounded-xl" key={key} />
				))}
			</div>
		</div>
	);
}

function AccountCard({
	account,
	accounts,
	defaultCurrency,
	isDefault,
}: {
	account: Account;
	accounts: Account[];
	defaultCurrency: string;
	isDefault: boolean;
}) {
	const currency = account.currency ?? defaultCurrency;

	return (
		<Card className="overflow-hidden transition-colors hover:border-foreground/20">
			<CardHeader>
				<div className="flex min-w-0 items-center gap-3">
					<div
						className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"
						style={
							account.accountTypeColor
								? { color: account.accountTypeColor }
								: undefined
						}
					>
						<AccountTypeIcon
							className="size-5"
							iconKey={account.accountTypeIcon}
						/>
					</div>
					<div className="min-w-0">
						<CardTitle className="truncate">{account.name}</CardTitle>
						<CardDescription>
							{account.accountTypeName} ·{" "}
							{account.accountTypeBalanceNature === "liability"
								? "Money owed"
								: "Money available"}
						</CardDescription>
					</div>
				</div>
				<CardAction className="flex gap-2">
					{isDefault ? <Badge variant="secondary">Default</Badge> : null}
					{account.isArchived ? (
						<Badge variant="outline">Archived</Badge>
					) : null}
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-col gap-1">
				<p className="text-muted-foreground text-xs uppercase tracking-wide">
					Current balance
				</p>
				<p className="font-semibold text-2xl tabular-nums tracking-tight">
					{formatAccountMoney(account.currentBalance, currency)}
				</p>
			</CardContent>
			<CardFooter className="justify-between gap-3 border-t text-muted-foreground text-xs">
				<span>
					Opened at {formatAccountMoney(account.startingBalance, currency)}
				</span>
				<div className="flex shrink-0 items-center gap-1">
					<AccountActionDialogs
						account={account}
						accounts={accounts}
						defaultCurrency={defaultCurrency}
						presentation="menu"
					/>
					<Button asChild size="sm" variant="ghost">
						<Link href={`/accounts/${account._id}`}>
							View
							<ArrowUpRight data-icon="inline-end" />
						</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}

export default function AccountsPage() {
	const accounts = useQuery(api.accounts.list, { includeArchived: true });
	const user = useQuery(api.users.get);

	if (accounts === undefined || user === undefined) {
		return <AccountsLoading />;
	}

	const activeAccounts = accounts.filter((account) => !account.isArchived);
	const archivedAccounts = accounts.filter((account) => account.isArchived);
	const defaultCurrency = user.currency ?? "USD";
	const totals = getTotalsByCurrency(activeAccounts, defaultCurrency);
	const defaultAccountName = activeAccounts.find(
		(account) => account._id === user.defaultAccountId
	)?.name;
	const defaultAccountTypeName = activeAccounts.find(
		(account) => account._id === user.defaultAccountId
	)?.accountTypeName;

	return (
		<div className="flex flex-col gap-8 py-3">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="flex items-center gap-4">
					<Button asChild size="icon" variant="ghost">
						<Link aria-label="Back to dashboard" href="/dashboard">
							<ChevronLeft />
						</Link>
					</Button>
					<div className="flex flex-col gap-1">
						<h1 className="font-bold text-3xl tracking-tight">Accounts</h1>
						<p className="text-muted-foreground text-sm">
							Track where your money lives and which account paid each expense.
						</p>
					</div>
				</div>
				<Button asChild>
					<Link href="/accounts/new">
						<Plus data-icon="inline-start" />
						Add account
					</Link>
				</Button>
			</header>

			<Card className="gap-0 overflow-hidden bg-card/50 py-0 shadow-sm">
				<CardContent className="px-0">
					<AccountBalanceOverview
						activeAccountCount={activeAccounts.length}
						defaultAccountName={defaultAccountName}
						defaultAccountTypeName={defaultAccountTypeName}
						totals={Array.from(totals, ([currency, total]) => ({
							currency,
							total,
						}))}
					/>
				</CardContent>
				<CardFooter className="border-t py-4 text-muted-foreground text-xs">
					Archived accounts are excluded from these totals.
				</CardFooter>
			</Card>

			<section className="flex flex-col gap-4">
				<div>
					<h2 className="font-semibold text-lg">Active accounts</h2>
					<p className="text-muted-foreground text-sm">
						Available for new expenses and transfers.
					</p>
				</div>
				{activeAccounts.length > 0 ? (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{activeAccounts.map((account) => (
							<AccountCard
								account={account}
								accounts={accounts}
								defaultCurrency={defaultCurrency}
								isDefault={user.defaultAccountId === account._id}
								key={account._id}
							/>
						))}
					</div>
				) : (
					<EmptyState
						action={
							<Button asChild>
								<Link href="/accounts/new">Create your first account</Link>
							</Button>
						}
						description="Start with cash, checking, savings, a wallet, or a credit card."
						icon={<WalletCards className="size-8" />}
						title="No accounts yet"
					/>
				)}
			</section>

			{archivedAccounts.length > 0 ? (
				<section className="flex flex-col gap-4">
					<div>
						<h2 className="font-semibold text-lg">Archived</h2>
						<p className="text-muted-foreground text-sm">
							Hidden from new expenses while preserving history.
						</p>
					</div>
					<div className="grid gap-4 opacity-80 md:grid-cols-2 xl:grid-cols-3">
						{archivedAccounts.map((account) => (
							<AccountCard
								account={account}
								accounts={accounts}
								defaultCurrency={defaultCurrency}
								isDefault={false}
								key={account._id}
							/>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
}
