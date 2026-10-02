import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const versionPattern = /^0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const hashPattern = /^[a-f0-9]{64}$/u;

export const assertRelease = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

export const validateReleaseInputs = (environment) => {
	assertRelease(
		versionPattern.test(environment.RELEASE_VERSION ?? ""),
		"Release version must be an exact stable 0.x version"
	);
	assertRelease(
		commitPattern.test(environment.SOURCE_COMMIT ?? ""),
		"Source commit must be a full lowercase Git SHA"
	);
};

// Read selected tar members without extracting or executing the candidate.
export const verifyReleaseArtifact = (
	environment,
	directory = "release-artifacts"
) => {
	validateReleaseInputs(environment);
	const {
		RELEASE_VERSION: version,
		SOURCE_COMMIT: commit,
		TARBALL: tarball,
		SHA256: hash,
	} = environment;
	assertRelease(
		tarball === `spendly-${version}.tgz`,
		"Unexpected tarball filename"
	);
	assertRelease(
		hashPattern.test(hash ?? ""),
		"Expected SHA-256 must be 64 lowercase hex characters"
	);
	assertRelease(
		JSON.stringify(readdirSync(directory).sort()) ===
			JSON.stringify(["SHA256SUMS", "SOURCE_COMMIT", tarball].sort()),
		"Artifact must contain exactly the tarball, SHA256SUMS, and SOURCE_COMMIT"
	);
	assertRelease(
		readFileSync(join(directory, "SOURCE_COMMIT"), "utf8").trim() === commit,
		"Artifact source commit mismatch"
	);
	const checksumRecord = readFileSync(
		join(directory, "SHA256SUMS"),
		"utf8"
	).trim();
	assertRelease(
		checksumRecord === `${hash}  release-artifacts/${tarball}`,
		"Artifact checksum record mismatch"
	);
	const path = resolve(directory, tarball);
	assertRelease(
		createHash("sha256").update(readFileSync(path)).digest("hex") === hash,
		"Tarball SHA-256 mismatch"
	);
	const readMember = (member) =>
		execFileSync("tar", ["-xOf", path, member], { encoding: "utf8" });
	const metadata = JSON.parse(readMember("package/package.json"));
	assertRelease(
		metadata.name === "spendly" && metadata.version === version,
		"Embedded package identity mismatch"
	);
	assertRelease(
		!("private" in metadata) && metadata.license === "AGPL-3.0-only",
		"Candidate must be public and use the approved license"
	);
	assertRelease(
		metadata.repository?.url ===
			"git+https://github.com/akhilesh-dalvi/spendly.git" &&
			metadata.repository?.directory === "apps/cli",
		"Candidate repository identity mismatch"
	);
	assertRelease(
		metadata.publishConfig?.registry === "https://registry.npmjs.org/" &&
			metadata.publishConfig?.tag === "next" &&
			metadata.publishConfig?.access === "public" &&
			metadata.publishConfig?.provenance === true,
		"Candidate publishing configuration mismatch"
	);
	assertRelease(
		readMember("package/LICENSE") === readFileSync("LICENSE", "utf8"),
		"Candidate license differs from reviewed source"
	);
	const shrinkwrap = JSON.parse(readMember("package/npm-shrinkwrap.json"));
	assertRelease(
		shrinkwrap.name === metadata.name &&
			shrinkwrap.version === version &&
			shrinkwrap.packages?.[""]?.license === metadata.license,
		"Candidate shrinkwrap identity mismatch"
	);
	return { version, commit, tarball, hash };
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const result = verifyReleaseArtifact(process.env);
	process.stdout.write(
		`Verified ${result.tarball}: ${result.hash} at ${result.commit}.\n`
	);
}
