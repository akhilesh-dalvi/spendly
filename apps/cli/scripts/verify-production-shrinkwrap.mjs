// npm marks shared optional production/dev dependencies with devOptional.
// Only dev: true identifies entries that are exclusively development dependencies.
export const verifyProductionShrinkwrap = (shrinkwrap) => {
	const root = shrinkwrap.packages?.[""];
	if (!root) {
		throw new Error("npm shrinkwrap is missing its root package");
	}
	if ("devDependencies" in root) {
		throw new Error("Shrinkwrap root must omit devDependencies");
	}
	for (const [path, entry] of Object.entries(shrinkwrap.packages)) {
		if (entry.dev === true) {
			throw new Error(`Shrinkwrap entry ${path} must not be development-only`);
		}
	}
};
