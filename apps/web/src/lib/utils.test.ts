import { describe, expect, it } from "vitest";
import { cn, formatCurrency } from "./utils";

describe("display utilities", () => {
	it("merges conditional classes and lets the last conflicting utility win", () => {
		expect(
			cn("px-2", { hidden: false, block: true }, ["px-4", "font-bold"])
		).toBe("block px-4 font-bold");
		expect(cn(null, undefined, false)).toBe("");
	});

	it("formats currency with explicit precision and locale", () => {
		expect(formatCurrency(0)).toBe("$0.00");
		expect(formatCurrency(1234.56, "EUR", "de-DE")).toBe("1.234,56\u00a0€");
		expect(formatCurrency(1234, "JPY", "en-US")).toBe("¥1,234");
	});
});
