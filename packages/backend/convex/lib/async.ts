/**
 * Run each operation in input order, stopping on the first failure.
 * Keep dependent database writes in the caller's transaction rather than starting
 * them concurrently. Inputs must be finite; callbacks start after enumeration.
 */
export async function forEachSequential<T>(
	items: Iterable<T>,
	visit: (item: T) => Promise<unknown>
): Promise<void> {
	let completion: Promise<unknown> = Promise.resolve();
	for (const item of items) {
		completion = completion.then(() => visit(item));
	}
	await completion;
}
