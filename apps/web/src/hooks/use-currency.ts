import { useAuth } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { formatCurrency } from "@/lib/utils";

export function useCurrency() {
	const { isLoaded, isSignedIn } = useAuth();
	const user = useQuery(api.users.get, isSignedIn ? undefined : "skip");
	const currency = user?.currency || "USD";
	const hasUserCurrency = isSignedIn && user?.currency !== undefined;

	// For now, we derive locale from currency.
	// In the future, this could also be a user preference.
	const locale = currency === "INR" ? "en-IN" : "en-US";

	const format = (amount: number) => {
		return formatCurrency(amount, currency, locale);
	};

	return {
		currency,
		hasUserCurrency,
		locale,
		format,
		isLoading: !isLoaded || (isSignedIn && user === undefined),
	};
}
