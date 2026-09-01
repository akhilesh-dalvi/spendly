import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const run = (command, args, options = {}) =>
	execFileSync(command, args, {
		cwd: packageDirectory,
		encoding: "utf8",
		stdio: "pipe",
		...options,
	});

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

try {
	run("pnpm", ["pack", "--pack-destination", verificationDirectory]);
	const entries = run("tar", ["-tf", tarballPath]);
	assert(
		entries.includes("package/dist/index.js"),
		"Tarball is missing the CLI entry"
	);
	const entryList = entries.trim().split("\n");
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
	run("pnpm", ["add", "--ignore-scripts", tarballPath], {
		cwd: consumerDirectory,
	});

	const binaryPath = join(consumerDirectory, "node_modules", ".bin", "spendly");
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
		`Verified ${tarballName} outside the repository: install, version, help, JSON, and exit codes passed.\n`
	);
} finally {
	rmSync(verificationDirectory, { force: true, recursive: true });
}
