import { describe, expect, it } from "vitest";
import {
	getCurrencySymbol,
	isSupportedCurrency,
	SUPPORTED_CURRENCIES,
} from "./currencies";

describe("supported currencies", () => {
	it.each(SUPPORTED_CURRENCIES)("recognizes $value and its symbol", ({
		value,
		symbol,
	}) => {
		expect(isSupportedCurrency(value)).toBe(true);
		expect(getCurrencySymbol(value)).toBe(symbol);
	});

	it.each([
		"",
		"usd",
		"XYZ",
	])("preserves unsupported code %s rather than inventing a symbol", (currency) => {
		expect(isSupportedCurrency(currency)).toBe(false);
		expect(getCurrencySymbol(currency)).toBe(currency);
	});
});
