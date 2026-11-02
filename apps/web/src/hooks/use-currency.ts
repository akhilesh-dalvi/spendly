import { useAuth } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { formatCurrency } from "@/lib/utils";

export function useCurrency() {
	const { isLoaded, isSignedIn } = useAuth();
	const user = useQuery(api.users.get, isSignedIn ? undefined : "skip");
	const currency = user?.currency || "USD";
	const hasUserCurrency = isSignedIn && user?.currency !== undefined;

	const locale = currency === "INR" ? "en-IN" : "en-US";

	const format = (amount: number) => formatCurrency(amount, currency, locale);

	return {
		currency,
		format,
		hasUserCurrency,
		isLoading: !isLoaded || (isSignedIn && user === undefined),
		locale,
	};
}
