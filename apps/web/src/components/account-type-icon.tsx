import {
	Banknote,
	Building2,
	CircleDollarSign,
	Coins,
	CreditCard,
	HandCoins,
	Landmark,
	type LucideIcon,
	PiggyBank,
	Vault,
	WalletCards,
} from "lucide-react";

export const ACCOUNT_TYPE_ICON_OPTIONS = [
	{ icon: Banknote, key: "banknote", label: "Banknote" },
	{ icon: Building2, key: "building-2", label: "Building" },
	{ icon: CircleDollarSign, key: "circle-dollar-sign", label: "Dollar circle" },
	{ icon: Coins, key: "coins", label: "Coins" },
	{ icon: CreditCard, key: "credit-card", label: "Credit card" },
	{ icon: HandCoins, key: "hand-coins", label: "Hand with coins" },
	{ icon: Landmark, key: "landmark", label: "Bank" },
	{ icon: PiggyBank, key: "piggy-bank", label: "Piggy bank" },
	{ icon: Vault, key: "vault", label: "Vault" },
	{ icon: WalletCards, key: "wallet", label: "Wallet" },
] as const satisfies ReadonlyArray<{
	icon: LucideIcon;
	key: string;
	label: string;
}>;

const ACCOUNT_TYPE_ICONS = new Map<string, LucideIcon>(
	ACCOUNT_TYPE_ICON_OPTIONS.map(({ icon, key }) => [key, icon])
);

interface AccountTypeIconProps {
	className?: string;
	iconKey?: string | null;
}

export function AccountTypeIcon({ className, iconKey }: AccountTypeIconProps) {
	const Icon =
		(iconKey ? ACCOUNT_TYPE_ICONS.get(iconKey) : null) ?? CircleDollarSign;
	return <Icon aria-hidden="true" className={className} />;
}
