/** Pull one operation at a time; breaking or throwing never starts another. */
export function* repeatAsync<Value>(
	next: () => Promise<Value>
): Generator<Promise<Value>, never> {
	for (;;) {
		yield next();
	}
}
