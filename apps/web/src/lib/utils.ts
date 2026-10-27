import { cn as mergeClasses } from "cn";

export const cn = mergeClasses;

export function formatCurrency(
	amount: number,
	currency = "USD",
	locale = "en-US"
) {
	return new Intl.NumberFormat(locale, {
		currency,
		style: "currency",
	}).format(amount);
}
