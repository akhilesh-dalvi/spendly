import { describe, expect, it } from "vitest";
import { parseDate, resolveCommandDate } from "./dates.js";

describe("CLI local dates", () => {
	it("resolves omitted dates in the detected machine timezone", () => {
		expect(
			resolveCommandDate({
				now: () => new Date("2026-09-01T20:00:00.000Z"),
				timeZone: () => "Asia/Kolkata",
			})
		).toEqual({
			date: "2026-09-02",
			dateSource: "local_default",
			timezone: "Asia/Kolkata",
		});
	});

	it("accepts an explicit date when timezone detection fails", () => {
		expect(
			resolveCommandDate({
				explicitDate: "2026-09-02",
				timeZone: () => undefined,
			})
		).toEqual({
			date: "2026-09-02",
			dateSource: "explicit",
			timezone: null,
		});
	});

	it("requires an explicit date when timezone detection fails", () => {
		expect(() =>
			resolveCommandDate({ timeZone: () => undefined })
		).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
	});

	it("rejects malformed and impossible dates", () => {
		expect(() => parseDate("09/02/2026")).toThrowError(
			expect.objectContaining({ code: "INVALID_INPUT" })
		);
		expect(() => parseDate("2026-09-31")).toThrowError(
			expect.objectContaining({ code: "INVALID_INPUT" })
		);
	});
});
