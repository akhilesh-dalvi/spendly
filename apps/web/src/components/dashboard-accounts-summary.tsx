import { AccountBalanceOverview } from "@/components/account-balance-overview";
import { AccountOnboardingNudge } from "@/components/account-onboarding-nudge";

interface AccountSummaryItem {
	accountTypeName: string;
	isDefault: boolean;
	name: string;
}

interface DashboardAccountsSummaryProps {
	showAccountOnboarding?: boolean;
	summary: {
		accounts: AccountSummaryItem[];
		totals: Array<{ currency: string; total: number }>;
	};
}

export function DashboardAccountsSummary({
	showAccountOnboarding = false,
	summary,
}: DashboardAccountsSummaryProps) {
	const defaultAccount = summary.accounts.find((account) => account.isDefault);

	return (
		<div className="overflow-hidden rounded-2xl border bg-card/50 shadow-sm">
			<AccountBalanceOverview
				activeAccountCount={summary.accounts.length}
				defaultAccountName={defaultAccount?.name}
				defaultAccountTypeName={defaultAccount?.accountTypeName}
				totals={summary.totals}
			/>
			{showAccountOnboarding ? <AccountOnboardingNudge /> : null}
		</div>
	);
}
