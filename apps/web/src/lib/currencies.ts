export const SUPPORTED_CURRENCIES = [
	{ label: "US Dollar", symbol: "$", value: "USD" },
	{ label: "Euro", symbol: "€", value: "EUR" },
	{ label: "British Pound", symbol: "£", value: "GBP" },
	{ label: "Indian Rupee", symbol: "₹", value: "INR" },
	{ label: "Canadian Dollar", symbol: "$", value: "CAD" },
	{ label: "Australian Dollar", symbol: "$", value: "AUD" },
	{ label: "Japanese Yen", symbol: "¥", value: "JPY" },
	{ label: "UAE Dirham", symbol: "د.إ", value: "AED" },
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]["value"];

export const isSupportedCurrency = (
	currency: string
): currency is SupportedCurrency =>
	SUPPORTED_CURRENCIES.some((item) => item.value === currency);

export const getCurrencySymbol = (currency: string): string =>
	SUPPORTED_CURRENCIES.find((item) => item.value === currency)?.symbol ??
	currency;
