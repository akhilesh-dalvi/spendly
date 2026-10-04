import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { verifyReleaseArtifact } from "./verify-release-artifact.mjs";
import { verifyReleaseSource } from "./verify-release-source.mjs";

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapPublishPattern = /npm publish "([^"]+)"/u;
const stagedPublishPattern = /npm stage publish "([^"]+)"/u;
const relativePathPattern = /^\.\//u;
const temporaryDirectories = [];
const createDirectory = () => {
	const directory = mkdtempSync(join(tmpdir(), "spendly-release-test-"));
	temporaryDirectories.push(directory);
	return directory;
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

const createArtifact = (overrides = {}) => {
	const directory = createDirectory();
	const contents = join(directory, "contents");
	const packedDirectory = join(contents, "package");
	const artifactDirectory = join(directory, "release-artifacts");
	mkdirSync(packedDirectory, { recursive: true });
	mkdirSync(artifactDirectory);
	for (const name of ["package.json", "npm-shrinkwrap.json", "LICENSE"]) {
		copyFileSync(join(packageDirectory, name), join(packedDirectory, name));
	}
	const metadataPath = join(packedDirectory, "package.json");
	const metadata = {
		...JSON.parse(readFileSync(metadataPath, "utf8")),
		...overrides,
	};
	writeFileSync(metadataPath, JSON.stringify(metadata));
	const environment = {
		RELEASE_VERSION: "0.1.2",
		SOURCE_COMMIT: "a".repeat(40),
		TARBALL: "spendly-0.1.2.tgz",
	};
	const tarball = join(artifactDirectory, environment.TARBALL);
	execFileSync("tar", ["-czf", tarball, "-C", contents, "package"]);
	environment.SHA256 = createHash("sha256")
		.update(readFileSync(tarball))
		.digest("hex");
	writeFileSync(
		join(artifactDirectory, "SOURCE_COMMIT"),
		`${environment.SOURCE_COMMIT}\n`
	);
	writeFileSync(
		join(artifactDirectory, "SHA256SUMS"),
		`${environment.SHA256}  release-artifacts/${environment.TARBALL}\n`
	);
	return { artifactDirectory, environment, tarball };
};

describe("publication artifact guards", () => {
	it("resolves the workflow's bootstrap argument as a local tarball", () => {
		const fixture = createArtifact();
		const before = readFileSync(fixture.tarball);
		const workflow = readFileSync(
			join(packageDirectory, "../../.github/workflows/cli-publish.yml"),
			"utf8"
		);
		const argument = workflow.match(bootstrapPublishPattern)?.[1];
		expect(argument).toBeDefined();
		const result = spawnSync(
			"npm",
			[
				"publish",
				argument.replace("$TARBALL", fixture.environment.TARBALL),
				"--dry-run",
				// Test local path resolution even after this version is published.
				"--force",
				"--ignore-scripts",
				"--provenance=false",
				"--json",
			],
			{
				cwd: dirname(fixture.artifactDirectory),
				encoding: "utf8",
				timeout: 10_000,
			}
		);
		expect(result.status, result.stderr).toBe(0);
		const output = JSON.parse(result.stdout);
		const publication = Array.isArray(output)
			? output[0]
			: (output.spendly ?? output);
		expect(publication).toMatchObject({
			name: "spendly",
			version: fixture.environment.RELEASE_VERSION,
		});
		expect(readFileSync(fixture.tarball)).toEqual(before);
	});
	it("uses the same local tarball argument for bootstrap and staging", () => {
		const workflow = readFileSync(
			join(packageDirectory, "../../.github/workflows/cli-publish.yml"),
			"utf8"
		);
		const bootstrap = workflow.match(bootstrapPublishPattern)?.[1];
		const staged = workflow.match(stagedPublishPattern)?.[1];
		expect(bootstrap).toMatch(relativePathPattern);
		expect(staged).toBe(bootstrap);
	});
	it("accepts the recorded artifact without changing its bytes", () => {
		const fixture = createArtifact();
		const before = readFileSync(fixture.tarball);
		expect(
			verifyReleaseArtifact(fixture.environment, fixture.artifactDirectory)
				.version
		).toBe("0.1.2");
		expect(readFileSync(fixture.tarball)).toEqual(before);
	});
	it("rejects tampered tarballs even when the recorded checksum is unchanged", () => {
		const fixture = createArtifact();
		writeFileSync(fixture.tarball, "tampered");
		expect(() =>
			verifyReleaseArtifact(fixture.environment, fixture.artifactDirectory)
		).toThrow("Tarball SHA-256 mismatch");
	});
	it("rejects a different source commit", () => {
		const fixture = createArtifact();
		writeFileSync(
			join(fixture.artifactDirectory, "SOURCE_COMMIT"),
			"b".repeat(40)
		);
		expect(() =>
			verifyReleaseArtifact(fixture.environment, fixture.artifactDirectory)
		).toThrow("source commit mismatch");
	});
	it("rejects altered checksum records", () => {
		const fixture = createArtifact();
		writeFileSync(
			join(fixture.artifactDirectory, "SHA256SUMS"),
			`${fixture.environment.SHA256}  another.tgz\n`
		);
		expect(() =>
			verifyReleaseArtifact(fixture.environment, fixture.artifactDirectory)
		).toThrow("checksum record mismatch");
	});
	it.each([
		[{ version: "0.2.0" }, "Embedded package identity mismatch"],
		[{ private: true }, "Candidate must be public"],
		[{ license: "UNLICENSED" }, "Candidate must be public"],
		[{ publishConfig: { tag: "latest" } }, "publishing configuration mismatch"],
	])("rejects mismatched embedded metadata %j", (overrides, message) => {
		const fixture = createArtifact(overrides);
		expect(() =>
			verifyReleaseArtifact(fixture.environment, fixture.artifactDirectory)
		).toThrow(message);
	});
	it("rejects a filename outside the artifact directory", () => {
		const fixture = createArtifact();
		expect(() =>
			verifyReleaseArtifact(
				{ ...fixture.environment, TARBALL: "../spendly-0.1.2.tgz" },
				fixture.artifactDirectory
			)
		).toThrow("Unexpected tarball filename");
	});
	it("rejects unexpected artifact files", () => {
		const fixture = createArtifact();
		writeFileSync(join(fixture.artifactDirectory, "unexpected.tgz"), "extra");
		expect(() =>
			verifyReleaseArtifact(fixture.environment, fixture.artifactDirectory)
		).toThrow("exactly the tarball");
	});
});

const createSourceFixture = () => {
	const commit = "a".repeat(40);
	const environment = {
		GITHUB_REPOSITORY: "akhilesh-dalvi/spendly",
		GITHUB_REF: "refs/heads/master",
		GITHUB_SHA: commit,
		SOURCE_COMMIT: commit,
		RELEASE_VERSION: "0.1.2",
		CANDIDATE_RUN: "42",
	};
	const run = {
		head_sha: commit,
		head_branch: "master",
		head_repository: { full_name: environment.GITHUB_REPOSITORY },
		event: "push",
		status: "completed",
		conclusion: "success",
	};
	const responses = {
		"commits/master": { sha: commit },
		"commits/refs%2Ftags%2Fv0.1.2": { sha: commit },
		"releases/tags/v0.1.2": {
			tag_name: "v0.1.2",
			draft: false,
			body: "Release notes",
		},
		[`actions/workflows/cli-ci.yml/runs?head_sha=${commit}&event=push&status=success&per_page=100`]:
			{ workflow_runs: [run] },
		"actions/runs/42": {
			...run,
			event: "workflow_dispatch",
			path: ".github/workflows/cli-release-candidate.yml",
		},
	};
	const request = (path) => {
		if (responses[path] === undefined) {
			throw new Error(`Unexpected API call: ${path}`);
		}
		return responses[path];
	};
	return { environment, responses, request };
};

describe("hosted release identity guards", () => {
	it("accepts successful master CI and the matching candidate run", async () => {
		const fixture = createSourceFixture();
		await expect(
			verifyReleaseSource(fixture.environment, fixture.request, "publish")
		).resolves.toBeUndefined();
	});
	it("checks the candidate gate before a GitHub Release exists", async () => {
		const fixture = createSourceFixture();
		fixture.responses["commits/refs%2Ftags%2Fv0.1.2"] = undefined;
		fixture.responses["releases/tags/v0.1.2"] = undefined;
		await expect(
			verifyReleaseSource(fixture.environment, fixture.request, "candidate")
		).resolves.toBeUndefined();
	});
	it("rechecks identity without requiring Actions read permission", async () => {
		const fixture = createSourceFixture();
		const request = async (path) => {
			expect(path.startsWith("actions/")).toBe(false);
			return await fixture.request(path);
		};
		await expect(
			verifyReleaseSource(fixture.environment, request, "identity")
		).resolves.toBeUndefined();
	});
	it("rejects a moved master", async () => {
		const fixture = createSourceFixture();
		fixture.responses["commits/master"].sha = "b".repeat(40);
		await expect(
			verifyReleaseSource(fixture.environment, fixture.request, "publish")
		).rejects.toThrow("master moved");
	});
	it("rejects a tag pointing at another commit", async () => {
		const fixture = createSourceFixture();
		fixture.responses["commits/refs%2Ftags%2Fv0.1.2"].sha = "b".repeat(40);
		await expect(
			verifyReleaseSource(fixture.environment, fixture.request, "publish")
		).rejects.toThrow("Release tag");
	});
	it("rejects missing successful CI evidence", async () => {
		const fixture = createSourceFixture();
		const response = Object.values(fixture.responses).find(
			(value) => "workflow_runs" in value
		);
		response.workflow_runs = [];
		await expect(
			verifyReleaseSource(fixture.environment, fixture.request, "publish")
		).rejects.toThrow("complete CLI readiness suite");
	});
	it.each([
		{ head_branch: "feature/unreviewed" },
		{ head_sha: "b".repeat(40) },
		{ path: ".github/workflows/unrelated.yml" },
		{ event: "pull_request" },
		{ conclusion: "failure" },
		{ head_repository: { full_name: "other/spendly" } },
	])("rejects an untrusted candidate run %j", async (overrides) => {
		const fixture = createSourceFixture();
		Object.assign(fixture.responses["actions/runs/42"], overrides);
		await expect(
			verifyReleaseSource(fixture.environment, fixture.request, "publish")
		).rejects.toThrow("Candidate must come from");
	});
	it("rejects dispatch from an unreviewed branch", async () => {
		const fixture = createSourceFixture();
		fixture.environment.GITHUB_REF = "refs/heads/feature/test";
		await expect(
			verifyReleaseSource(fixture.environment, fixture.request, "publish")
		).rejects.toThrow("exact reviewed master commit");
	});
});

describe("public release metadata", () => {
	it.each([
		[{ private: true }, "Public package must omit private"],
		[{ license: undefined }, "approved AGPL-3.0-only license"],
	])("rejects unsafe public manifests %j", (overrides, message) => {
		const root = createDirectory();
		const fixture = join(root, "apps/cli");
		mkdirSync(join(fixture, "scripts"), { recursive: true });
		for (const name of [
			"LICENSE",
			"package.json",
			"npm-shrinkwrap.json",
			"scripts/verify-release-metadata.mjs",
		]) {
			copyFileSync(join(packageDirectory, name), join(fixture, name));
		}
		copyFileSync(join(packageDirectory, "LICENSE"), join(root, "LICENSE"));
		const path = join(fixture, "package.json");
		writeFileSync(
			path,
			JSON.stringify({
				...JSON.parse(readFileSync(path, "utf8")),
				...overrides,
			})
		);
		const result = spawnSync(
			process.execPath,
			[join(fixture, "scripts/verify-release-metadata.mjs")],
			{ encoding: "utf8" }
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(message);
	});
});
