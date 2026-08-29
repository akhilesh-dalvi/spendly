import { formatAccountMoney } from "@/lib/accounts";

interface AccountBalanceTotal {
	currency: string;
	total: number;
}

interface AccountBalanceOverviewProps {
	activeAccountCount: number;
	defaultAccountName?: string;
	defaultAccountTypeName?: string;
	totals: AccountBalanceTotal[];
}

function MetricStatus({ children }: { children: string }) {
	return (
		<div className="mt-4 flex items-center gap-1.5">
			<div className="size-1.5 rounded-full bg-primary" />
			<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
				{children}
			</p>
		</div>
	);
}

export function AccountBalanceOverview({
	activeAccountCount,
	defaultAccountName,
	defaultAccountTypeName,
	totals,
}: AccountBalanceOverviewProps) {
	return (
		<div className="grid divide-y divide-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
			<div className="flex min-w-0 flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Tracked balance
					</p>
					{totals.length > 0 ? (
						<div className="mt-2 flex flex-col gap-1">
							{totals.map(({ currency, total }) => (
								<div className="flex items-baseline gap-2" key={currency}>
									<h3 className="font-medium text-3xl tabular-nums tracking-tight">
										{formatAccountMoney(total, currency)}
									</h3>
									{totals.length > 1 ? (
										<span className="font-medium text-muted-foreground/60 text-xs uppercase">
											{currency}
										</span>
									) : null}
								</div>
							))}
						</div>
					) : (
						<h3 className="mt-2 font-medium text-3xl tracking-tight">—</h3>
					)}
				</div>
				<MetricStatus>
					{activeAccountCount === 1
						? "Across 1 account"
						: `Across ${activeAccountCount} accounts`}
				</MetricStatus>
			</div>

			<div className="flex min-w-0 flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Active accounts
					</p>
					<h3 className="mt-2 font-medium text-3xl tabular-nums tracking-tight">
						{activeAccountCount}
					</h3>
				</div>
				<MetricStatus>Available for expenses</MetricStatus>
			</div>

			<div className="flex min-w-0 flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div>
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Currencies
					</p>
					<h3 className="mt-2 font-medium text-3xl tabular-nums tracking-tight">
						{totals.length}
					</h3>
				</div>
				<MetricStatus>Balances stay separate</MetricStatus>
			</div>

			<div className="flex min-w-0 flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10">
				<div className="min-w-0">
					<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
						Default account
					</p>
					<h3 className="mt-2 truncate font-medium text-2xl tracking-tight">
						{defaultAccountName ?? "Not set"}
					</h3>
					{defaultAccountTypeName ? (
						<p className="mt-1 truncate text-muted-foreground text-xs">
							{defaultAccountTypeName}
						</p>
					) : null}
				</div>
				<MetricStatus>Expense preselection</MetricStatus>
			</div>
		</div>
	);
}
