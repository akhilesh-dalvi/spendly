import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyProductionShrinkwrap } from "./verify-production-shrinkwrap.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = join(scriptDirectory, "..");
const packageMetadata = JSON.parse(
	readFileSync(join(packageDirectory, "package.json"), "utf8")
);
const shrinkwrap = JSON.parse(
	readFileSync(join(packageDirectory, "npm-shrinkwrap.json"), "utf8")
);
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const expectedVersionArgument = process.argv.find((argument) =>
	argument.startsWith("--expected-version=")
);
const expectedVersion = expectedVersionArgument?.slice(
	"--expected-version=".length
);

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

assert(packageMetadata.name === "spendly", "Unexpected npm package name");
assert(!("private" in packageMetadata), "Public package must omit private");
assert(
	packageMetadata.license === "AGPL-3.0-only",
	"Package must use the approved AGPL-3.0-only license"
);
assert(
	readFileSync(join(packageDirectory, "LICENSE"), "utf8") ===
		readFileSync(join(packageDirectory, "../../LICENSE"), "utf8"),
	"Package license must match the repository license"
);
assert(
	packageMetadata.homepage === "https://spendly.akhileshdalvi.com/docs/cli",
	"Package homepage must link to production CLI docs"
);
assert(
	packageMetadata.bugs?.url ===
		"https://github.com/akhilesh-dalvi/spendly/issues",
	"Package bugs URL must match the public repository"
);
assert(
	packageMetadata.bin?.spendly === "dist/index.js",
	"Package binary must use the production entrypoint"
);

assert(
	exactVersionPattern.test(packageMetadata.version),
	"Package version must be an exact semantic version"
);
if (expectedVersion !== undefined) {
	assert(
		packageMetadata.version === expectedVersion,
		`Expected version ${expectedVersion}, received ${packageMetadata.version}`
	);
}
assert(
	packageMetadata.engines?.node === ">=22",
	"The supported Node.js engine must be >=22"
);
assert(
	packageMetadata.repository?.url ===
		"git+https://github.com/akhilesh-dalvi/spendly.git",
	"The repository URL must match the public provenance source"
);
assert(
	packageMetadata.repository?.directory === "apps/cli",
	"The package repository directory must identify apps/cli"
);
assert(
	JSON.stringify(packageMetadata.files) ===
		JSON.stringify(["dist", "npm-shrinkwrap.json", "LICENSE", "README.md"]),
	"Published files must include only production output, shrinkwrap, license, and README"
);
assert(
	packageMetadata.publishConfig?.registry === "https://registry.npmjs.org/" &&
		packageMetadata.publishConfig?.access === "public" &&
		packageMetadata.publishConfig?.tag === "next" &&
		packageMetadata.publishConfig?.provenance === true,
	"npm publish guardrails must require the public registry, next tag, and provenance"
);

for (const [groupName, dependencyGroup] of Object.entries({
	dependencies: packageMetadata.dependencies,
	devDependencies: packageMetadata.devDependencies,
	optionalDependencies: packageMetadata.optionalDependencies,
	peerDependencies: packageMetadata.peerDependencies,
})) {
	for (const [name, version] of Object.entries(dependencyGroup ?? {})) {
		assert(
			typeof version === "string" && exactVersionPattern.test(version),
			`${groupName} entry ${name} must use an exact version`
		);
	}
}

assert(
	!Object.keys(packageMetadata.devDependencies ?? {}).some((name) =>
		name.startsWith("@spendly/")
	),
	"Published metadata must not reference internal Spendly development packages"
);
assert(shrinkwrap.lockfileVersion === 3, "npm shrinkwrap must use lockfile v3");
verifyProductionShrinkwrap(shrinkwrap);
const shrinkwrapRoot = shrinkwrap.packages?.[""];
assert(
	shrinkwrapRoot?.license === packageMetadata.license,
	"Shrinkwrap license must match package.json"
);
assert(
	shrinkwrapRoot !== undefined,
	"npm shrinkwrap is missing its root package"
);
assert(
	shrinkwrapRoot.name === packageMetadata.name &&
		shrinkwrapRoot.version === packageMetadata.version,
	"npm shrinkwrap name or version does not match package.json"
);
assert(
	JSON.stringify(shrinkwrapRoot.dependencies) ===
		JSON.stringify(packageMetadata.dependencies),
	"npm shrinkwrap production dependencies do not match package.json"
);

for (const [path, entry] of Object.entries(shrinkwrap.packages ?? {})) {
	if (path === "") {
		continue;
	}
	assert(
		typeof entry.version === "string" && entry.version.length > 0,
		`Shrinkwrap entry ${path} is missing a version`
	);
	assert(
		typeof entry.resolved === "string" &&
			entry.resolved.startsWith("https://registry.npmjs.org/"),
		`Shrinkwrap entry ${path} must resolve from the public npm registry`
	);
	assert(
		typeof entry.integrity === "string" &&
			entry.integrity.startsWith("sha512-"),
		`Shrinkwrap entry ${path} is missing SHA-512 integrity`
	);
}

process.stdout.write(
	`Verified release metadata for spendly@${packageMetadata.version}.\n`
);
