// biome-ignore-all lint/style/useFilenamingConvention: Convex module paths cannot contain hyphens.
import { v } from "convex/values";

export const supportedCurrencyValidator = v.union(
	v.literal("USD"),
	v.literal("EUR"),
	v.literal("GBP"),
	v.literal("INR"),
	v.literal("CAD"),
	v.literal("AUD"),
	v.literal("JPY"),
	v.literal("AED")
);
