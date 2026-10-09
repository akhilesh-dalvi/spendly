import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	cpSync,
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

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectories = [];

const createFixture = () => {
	const root = mkdtempSync(join(tmpdir(), "spendly-production-lock-test-"));
	temporaryDirectories.push(root);
	const directory = join(root, "apps/cli");
	mkdirSync(directory, { recursive: true });
	cpSync(join(packageDirectory, "scripts"), join(directory, "scripts"), {
		recursive: true,
	});
	for (const name of ["LICENSE", "package.json"]) {
		copyFileSync(join(packageDirectory, name), join(directory, name));
	}
	copyFileSync(join(packageDirectory, "LICENSE"), join(root, "LICENSE"));
	const shrinkwrap = JSON.parse(
		readFileSync(join(packageDirectory, "npm-shrinkwrap.json"), "utf8")
	);
	shrinkwrap.packages[""].devDependencies = undefined;
	shrinkwrap.packages = Object.fromEntries(
		Object.entries(shrinkwrap.packages).filter(
			([, entry]) => entry.dev !== true
		)
	);
	return { directory, shrinkwrap };
};

const verifyFixture = ({ directory, shrinkwrap }) => {
	writeFileSync(
		join(directory, "npm-shrinkwrap.json"),
		JSON.stringify(shrinkwrap)
	);
	return spawnSync(
		process.execPath,
		[join(directory, "scripts/verify-release-metadata.mjs")],
		{ encoding: "utf8" }
	);
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("production-only release shrinkwrap", () => {
	it("accepts production locks while keeping development tools in the source manifest", () => {
		const fixture = createFixture();
		const metadata = JSON.parse(
			readFileSync(join(fixture.directory, "package.json"), "utf8")
		);
		expect(metadata.devDependencies.vitest).toBeDefined();
		const result = verifyFixture(fixture);
		expect(result.status, result.stderr).toBe(0);
	});

	it.each([
		{},
		{ vitest: "4.1.11" },
	])("rejects root development dependency metadata %j", (devDependencies) => {
		const fixture = createFixture();
		fixture.shrinkwrap.packages[""].devDependencies = devDependencies;
		const result = verifyFixture(fixture);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(
			"Shrinkwrap root must omit devDependencies"
		);
	});

	it.each([
		"node_modules/vitest",
		"node_modules/vitest/node_modules/development-only",
	])("rejects development-only lock entry %s", (path) => {
		const fixture = createFixture();
		fixture.shrinkwrap.packages[path] = {
			version: "4.1.11",
			resolved: "https://registry.npmjs.org/vitest/-/vitest-4.1.11.tgz",
			integrity: "sha512-fixture",
			dev: true,
		};
		const result = verifyFixture(fixture);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(
			`Shrinkwrap entry ${path} must not be development-only`
		);
	});

	it("preserves optional production dependencies shared with development tools", () => {
		const fixture = createFixture();
		const entry =
			fixture.shrinkwrap.packages["node_modules/@napi-rs/keyring-darwin-arm64"];
		entry.devOptional = true;
		expect(entry.optional).toBe(true);
		const result = verifyFixture(fixture);
		expect(result.status, result.stderr).toBe(0);
	});
});
