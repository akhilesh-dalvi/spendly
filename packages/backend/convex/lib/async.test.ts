import { describe, expect, it, vi } from "vitest";
import { forEachSequential } from "./async";

describe("forEachSequential", () => {
	it("waits for each operation before starting the next, in iterator order", async () => {
		const events: string[] = [];
		await forEachSequential(
			["first", "second"].entries(),
			async ([index, name]) => {
				events.push(`start ${index} ${name}`);
				await Promise.resolve();
				events.push(`end ${index} ${name}`);
			}
		);
		expect(events).toEqual([
			"start 0 first",
			"end 0 first",
			"start 1 second",
			"end 1 second",
		]);
	});

	it("does not invoke the operation for empty inputs", async () => {
		const visit = vi.fn();
		await forEachSequential([], visit);
		expect(visit).not.toHaveBeenCalled();
	});

	it("propagates the original rejection and stops later operations", async () => {
		const failure = new Error("Operation failed");
		const visited: number[] = [];
		await expect(
			forEachSequential([1, 2, 3], async (item) => {
				visited.push(item);
				await Promise.resolve();
				if (item === 2) {
					throw failure;
				}
			})
		).rejects.toBe(failure);
		expect(visited).toEqual([1, 2]);
	});

	it("also stops when an operation throws synchronously", async () => {
		const failure = new Error("Synchronous failure");
		const visit = vi.fn(() => {
			throw failure;
		});
		await expect(forEachSequential([1, 2], visit)).rejects.toBe(failure);
		expect(visit).toHaveBeenCalledExactlyOnceWith(1);
	});
});
