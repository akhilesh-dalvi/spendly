import { describe, expect, it, vi } from "vitest";
import { repeatAsync } from "./async-iteration.js";

describe("sequential async iteration", () => {
	it("does not start work before the consumer requests it", () => {
		const next = vi.fn(() => Promise.resolve("value"));
		repeatAsync(next);
		expect(next).not.toHaveBeenCalled();
	});

	it("finishes each consumer step before requesting another and stops on break", async () => {
		const events: string[] = [];
		let request = 0;
		const next = vi.fn(async () => {
			request += 1;
			const current = request;
			events.push(`request ${current}`);
			await Promise.resolve();
			events.push(`resolved ${current}`);
			return current;
		});
		for await (const value of repeatAsync(next)) {
			events.push(`review ${value}`);
			await Promise.resolve();
			events.push(`confirmed ${value}`);
			if (value === 2) {
				break;
			}
		}
		expect(events).toEqual([
			"request 1",
			"resolved 1",
			"review 1",
			"confirmed 1",
			"request 2",
			"resolved 2",
			"review 2",
			"confirmed 2",
		]);
		expect(next).toHaveBeenCalledTimes(2);
	});

	it("propagates an operation failure without requesting another step", async () => {
		const failure = new Error("operation failed");
		const next = vi.fn(() => Promise.reject(failure));
		const consume = async () => {
			for await (const value of repeatAsync(next)) {
				return value;
			}
		};
		await expect(consume()).rejects.toBe(failure);
		expect(next).toHaveBeenCalledOnce();
	});

	it("does not request another step when the consumer cancels", async () => {
		const cancellation = new Error("cancelled");
		const next = vi.fn(() => Promise.resolve("review"));
		const consume = async () => {
			for await (const value of repeatAsync(next)) {
				if (value === "review") {
					throw cancellation;
				}
			}
		};
		await expect(consume()).rejects.toBe(cancellation);
		expect(next).toHaveBeenCalledOnce();
	});
});
