// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { ConvexError } from "convex/values";
import { normalizeCurrencyCode } from "../../domain/accountOperations";

export const getEffectivePreferredCurrency = (currency?: string): string =>
	normalizeCurrencyCode(currency) ?? "USD";

export const assertExpectedPreferredCurrency = (
	currency: string | undefined,
	expectedPreferredCurrency: string | undefined
): void => {
	if (
		expectedPreferredCurrency !== undefined &&
		expectedPreferredCurrency !== getEffectivePreferredCurrency(currency)
	) {
		throw new ConvexError("PREFERRED_CURRENCY_CONFLICT");
	}
};
