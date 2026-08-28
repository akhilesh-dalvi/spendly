"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { format, parseISO } from "date-fns";
import {
	Archive,
	ArchiveRestore,
	ChevronLeft,
	CircleCheck,
	LoaderCircle,
	ReceiptText,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { AccountActionDialogs } from "@/components/account-actions";
import { AccountForm } from "@/components/account-form";
import { AccountTypeIcon } from "@/components/account-type-icon";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAccountMoney, formatTransactionType } from "@/lib/accounts";

const TRANSACTION_PAGE_SIZE = 50;

function AccountDetailLoading() {
	return (
		<div className="flex flex-col gap-8 py-3">
			<div className="flex items-center gap-4">
				<Skeleton className="size-9 rounded-md" />
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-52" />
					<Skeleton className="h-4 w-32" />
				</div>
			</div>
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
				<Skeleton className="h-80 rounded-xl" />
				<Skeleton className="h-80 rounded-xl" />
			</div>
		</div>
	);
}

export default function AccountDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const accountId = params.id as Id<"accounts">;
	const account = useQuery(api.accounts.get, { accountId });
	const {
		loadMore,
		results: transactions,
		status: transactionStatus,
	} = usePaginatedQuery(
		api.accounts.listTransactionsPaginated,
		{ accountId },
		{ initialNumItems: TRANSACTION_PAGE_SIZE }
	);
	const accounts = useQuery(api.accounts.list, { includeArchived: true });
	const user = useQuery(api.users.get);
	const archiveAccount = useMutation(api.accounts.archive);
	const updateDefaultAccount = useMutation(api.users.updateDefaultAccount);
	const [isActionPending, setIsActionPending] = useState(false);

	if (
		account === undefined ||
		accounts === undefined ||
		transactionStatus === "LoadingFirstPage" ||
		user === undefined
	) {
		return <AccountDetailLoading />;
	}

	const currency = account.currency ?? user.currency ?? "USD";
	const isDefault = user.defaultAccountId === account._id;

	const handleDefaultAccount = async () => {
		setIsActionPending(true);
		try {
			await updateDefaultAccount({ accountId });
			toast.success(`${account.name} is now your default account`);
		} catch (_error) {
			toast.error("Failed to update the default account");
		} finally {
			setIsActionPending(false);
		}
	};

	const handleArchiveChange = async (isArchived: boolean) => {
		setIsActionPending(true);
		try {
			await archiveAccount({ accountId, isArchived });
			toast.success(isArchived ? "Account archived" : "Account reactivated");
		} catch (_error) {
			toast.error(
				isArchived
					? "Failed to archive account"
					: "Failed to reactivate account"
			);
		} finally {
			setIsActionPending(false);
		}
	};

	return (
		<div className="flex flex-col gap-8 py-3">
			<header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex items-center gap-4">
					<Button
						aria-label="Back to accounts"
						onClick={() => router.push("/accounts")}
						size="icon"
						variant="ghost"
					>
						<ChevronLeft />
					</Button>
					<div
						className="flex size-11 items-center justify-center rounded-xl bg-muted"
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
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="truncate font-bold text-3xl tracking-tight">
								{account.name}
							</h1>
							{isDefault ? <Badge variant="secondary">Default</Badge> : null}
							{account.isArchived ? (
								<Badge variant="outline">Archived</Badge>
							) : null}
						</div>
						<p className="text-muted-foreground text-sm">
							{account.accountTypeName} ·{" "}
							{account.accountTypeBalanceNature === "liability"
								? "Money owed"
								: "Money available"}{" "}
							· {currency}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap gap-2 sm:justify-end">
					{account.isArchived ? (
						<Button
							disabled={isActionPending}
							onClick={() => handleArchiveChange(false)}
							variant="outline"
						>
							<ArchiveRestore data-icon="inline-start" />
							Reactivate
						</Button>
					) : (
						<>
							<AccountActionDialogs
								account={account}
								accounts={accounts}
								defaultCurrency={user.currency ?? "USD"}
								presentation="buttons"
							/>
							<Button
								disabled={isDefault || isActionPending}
								onClick={handleDefaultAccount}
								variant="outline"
							>
								<CircleCheck data-icon="inline-start" />
								{isDefault ? "Default account" : "Make default"}
							</Button>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button disabled={isActionPending} variant="outline">
										<Archive data-icon="inline-start" />
										Archive
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Archive {account.name}?</AlertDialogTitle>
										<AlertDialogDescription>
											The account will be hidden from new expenses and
											transfers. Existing history and balances will remain
											available.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											onClick={() => handleArchiveChange(true)}
											variant="destructive"
										>
											Archive account
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</>
					)}
				</div>
			</header>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
				<div className="flex flex-col gap-6">
					<Card className="bg-muted/30">
						<CardHeader>
							<CardTitle>Balance</CardTitle>
							<CardDescription>
								Current cached balance from the account ledger.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-6 sm:grid-cols-2">
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs uppercase tracking-wide">
									Current
								</span>
								<span className="font-semibold text-4xl tabular-nums tracking-tight">
									{formatAccountMoney(account.currentBalance, currency)}
								</span>
							</div>
							<div className="flex flex-col gap-1 sm:items-end">
								<span className="text-muted-foreground text-xs uppercase tracking-wide">
									Opening
								</span>
								<span className="font-medium text-xl tabular-nums">
									{formatAccountMoney(account.startingBalance, currency)}
								</span>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Activity</CardTitle>
							<CardDescription>
								Opening balance, expenses, adjustments, and transfers.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{transactions.length > 0 ? (
								<div className="flex flex-col">
									{transactions.map((transaction, index) => (
										<Fragment key={transaction._id}>
											<div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
												<div className="flex min-w-0 items-start gap-3">
													<div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
														<ReceiptText className="size-4" />
													</div>
													<div className="min-w-0">
														<p className="truncate font-medium text-sm">
															{transaction.note ||
																formatTransactionType(transaction.type)}
														</p>
														<p className="text-muted-foreground text-xs">
															{formatTransactionType(transaction.type)} ·{" "}
															{format(
																parseISO(transaction.date),
																"MMM d, yyyy"
															)}
														</p>
													</div>
												</div>
												<div className="flex shrink-0 flex-col items-end gap-1">
													<span className="font-medium text-sm tabular-nums">
														{transaction.amount > 0 ? "+" : ""}
														{formatAccountMoney(transaction.amount, currency)}
													</span>
													<span className="text-muted-foreground text-xs tabular-nums">
														{formatAccountMoney(
															transaction.balanceAfter,
															currency
														)}{" "}
														balance
													</span>
												</div>
											</div>
											{index < transactions.length - 1 ? <Separator /> : null}
										</Fragment>
									))}
								</div>
							) : (
								<EmptyState
									description="Activity will appear here as the balance changes."
									icon={<ReceiptText className="size-7" />}
									title="No activity yet"
								/>
							)}
						</CardContent>
						{transactionStatus === "CanLoadMore" ||
						transactionStatus === "LoadingMore" ? (
							<CardFooter className="justify-center border-t">
								<Button
									disabled={transactionStatus === "LoadingMore"}
									onClick={() => loadMore(TRANSACTION_PAGE_SIZE)}
									variant="outline"
								>
									{transactionStatus === "LoadingMore" ? (
										<LoaderCircle
											className="animate-spin"
											data-icon="inline-start"
										/>
									) : null}
									Load 50 more
								</Button>
							</CardFooter>
						) : null}
					</Card>
				</div>

				<Card className="h-fit">
					<CardHeader>
						<CardTitle>Edit account</CardTitle>
						<CardDescription>
							The opening balance remains an immutable ledger snapshot.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<AccountForm
							accountId={account._id}
							defaultCurrency={currency}
							defaultValues={{
								accountTypeId: account.accountTypeId,
								name: account.name,
							}}
							onSuccess={() => undefined}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
