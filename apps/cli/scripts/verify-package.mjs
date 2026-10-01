import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = join(scriptDirectory, "..");
const packageMetadata = JSON.parse(
	readFileSync(join(packageDirectory, "package.json"), "utf8")
);
const verificationDirectory = mkdtempSync(
	join(tmpdir(), "spendly-package-verification-")
);
const tarballName = `spendly-${packageMetadata.version}.tgz`;
const tarballPath = join(verificationDirectory, tarballName);
const consumerDirectory = join(verificationDirectory, "consumer");
const npmCacheDirectory = join(verificationDirectory, "npm-cache");
const maximumTarballBytes = 5 * 1024 * 1024;
const allowedPackageFiles = new Set([
	"package/README.md",
	"package/npm-shrinkwrap.json",
	"package/package.json",
]);
const forbiddenDependencyProtocolPattern =
	/^(?:catalog:|file:|link:|workspace:)/u;
const executablePermissionPattern = /[1357]/u;
const packedSecretPatterns = [
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
	/\b(?:pk|sk)_(?:live|test)_[A-Za-z0-9]{12,}\b/u,
	/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u,
];

const run = (command, args, options = {}) =>
	execFileSync(command, args, {
		cwd: packageDirectory,
		encoding: "utf8",
		env: { ...process.env, npm_config_cache: npmCacheDirectory },
		stdio: "pipe",
		...options,
	});

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

try {
	run("node", ["scripts/verify-release-metadata.mjs"]);
	run("npm", ["run", "build"]);
	run("npm", [
		"pack",
		"--ignore-scripts",
		"--pack-destination",
		verificationDirectory,
	]);
	assert(
		statSync(tarballPath).size <= maximumTarballBytes,
		"Tarball exceeds the 5 MiB release limit"
	);
	const entries = run("tar", ["-tf", tarballPath]);
	assert(
		entries.includes("package/dist/index.js"),
		"Tarball is missing the CLI entry"
	);
	const entryList = entries.trim().split("\n");
	assert(
		entryList.every(
			(entry) =>
				allowedPackageFiles.has(entry) || entry.startsWith("package/dist/")
		),
		"Tarball contains a file outside the release allowlist"
	);
	assert(
		!entryList.some((entry) => entry.includes(".env")),
		"Tarball contains environment configuration"
	);
	assert(
		!entryList.some((entry) => entry.startsWith("package/development")),
		"Tarball contains development code"
	);
	assert(
		!entryList.some((entry) => entry.startsWith("package/src/")),
		"Tarball contains TypeScript sources"
	);
	assert(
		!entryList.includes("package/dist/output.js"),
		"Tarball contains stale build output"
	);
	assert(
		entryList.includes("package/npm-shrinkwrap.json"),
		"Tarball is missing npm-shrinkwrap.json"
	);
	const packedMetadata = JSON.parse(
		run("tar", ["-xOf", tarballPath, "package/package.json"])
	);
	assert(
		packedMetadata.name === packageMetadata.name &&
			packedMetadata.version === packageMetadata.version,
		"Packed package identity differs from the source manifest"
	);
	assert(
		packedMetadata.engines?.node === ">=22",
		"Packed package has the wrong Node.js engine"
	);
	for (const dependencyGroup of [
		packedMetadata.dependencies,
		packedMetadata.devDependencies,
		packedMetadata.optionalDependencies,
		packedMetadata.peerDependencies,
	]) {
		for (const version of Object.values(dependencyGroup ?? {})) {
			assert(
				typeof version === "string" &&
					!forbiddenDependencyProtocolPattern.test(version),
				"Packed package contains a local or workspace dependency protocol"
			);
		}
	}
	assert(
		!Object.keys(packedMetadata.devDependencies ?? {}).some((name) =>
			name.startsWith("@spendly/")
		),
		"Packed package exposes internal Spendly package metadata"
	);
	for (const entry of entryList) {
		const contents = run("tar", ["-xOf", tarballPath, entry]);
		assert(
			!packedSecretPatterns.some((pattern) => pattern.test(contents)),
			`Tarball entry ${entry} contains secret-shaped content`
		);
	}
	const packedShrinkwrap = JSON.parse(
		run("tar", ["-xOf", tarballPath, "package/npm-shrinkwrap.json"])
	);
	assert(
		JSON.stringify(packedShrinkwrap.packages?.[""]?.dependencies) ===
			JSON.stringify(packedMetadata.dependencies),
		"Packed shrinkwrap does not match packed runtime dependencies"
	);
	const packedConfig = run("tar", [
		"-xOf",
		tarballPath,
		"package/dist/config.js",
	]);
	assert(
		packedConfig.includes("https://successful-donkey-782.convex.cloud") &&
			packedConfig.includes("https://clerk.spendly.akhileshdalvi.com"),
		"Tarball is missing the production configuration"
	);
	assert(
		!(
			packedConfig.includes("SPENDLY_CONVEX_URL") ||
			packedConfig.includes("SPENDLY_CLERK_ISSUER")
		),
		"Tarball can select source-only development configuration"
	);

	mkdirSync(consumerDirectory);
	writeFileSync(
		join(consumerDirectory, "package.json"),
		'{"name":"spendly-package-consumer","private":true,"version":"1.0.0"}\n'
	);
	run(
		"npm",
		["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath],
		{
			cwd: consumerDirectory,
		}
	);
	const installedConfigUrl = pathToFileURL(
		join(consumerDirectory, "node_modules", "spendly", "dist", "config.js")
	);
	const { PRODUCTION_CONFIG: installedConfig } = await import(
		installedConfigUrl.href
	);
	assert(
		installedConfig.authReady === true &&
			installedConfig.clientId === "T99oHEemr0oToUZU" &&
			installedConfig.environment === "production",
		"Installed CLI must enable authentication with the approved public production client ID"
	);

	const binaryPath = join(consumerDirectory, "node_modules", ".bin", "spendly");
	const permissionDigits = statSync(binaryPath).mode.toString(8).slice(-3);
	assert(
		executablePermissionPattern.test(permissionDigits),
		"Installed CLI entry is not executable"
	);
	const version = run(binaryPath, ["--version"], {
		cwd: verificationDirectory,
	}).trim();
	assert(
		version === packageMetadata.version,
		"Installed binary reported the wrong version"
	);

	const help = run(binaryPath, ["--help"], { cwd: verificationDirectory });
	assert(
		help.includes("Usage: spendly"),
		"Installed binary did not render help"
	);
	const jsonHelp = JSON.parse(
		run(binaryPath, ["auth", "--help", "--json"], {
			cwd: verificationDirectory,
		})
	);
	assert(
		jsonHelp.data?.help?.includes("Usage: spendly auth"),
		"JSON help did not use the success envelope"
	);
	assert(
		!(
			jsonHelp.data.help.includes("keychain-test") ||
			jsonHelp.data.help.includes("refresh-test")
		),
		"Production help exposed development-only commands"
	);

	const invalidCommand = spawnSync(binaryPath, ["--json", "unknown"], {
		cwd: verificationDirectory,
		encoding: "utf8",
	});
	assert(
		invalidCommand.status === 2,
		"Invalid command did not use exit code 2"
	);
	assert(
		invalidCommand.stderr === "",
		"JSON mode wrote non-debug output to stderr"
	);
	const errorDocument = JSON.parse(invalidCommand.stdout);
	assert(errorDocument.schemaVersion === 1, "JSON schema version is not 1");
	assert(
		errorDocument.error?.code === "INVALID_COMMAND",
		"JSON error code is unstable"
	);

	process.stdout.write(
		`Verified ${tarballName} outside the repository: metadata, size, files, lock, executable, install, version, help, JSON, and exit codes passed.\n`
	);
} finally {
	rmSync(verificationDirectory, { force: true, recursive: true });
}
