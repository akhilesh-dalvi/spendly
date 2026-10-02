import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const fixtureDirectories = [];
afterEach(() => {
	for (const directory of fixtureDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const run = (cwd, command, args, env = {}) =>
	spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			CI: "false",
			NODE_ENV: "development",
			LEFTHOOK: "1",
			...env,
		},
	});
const git = (cwd, args) => {
	const result = run(cwd, "git", args);
	if (result.status !== 0) {
		throw new Error(result.stderr);
	}
	return result.stdout.trim();
};
const fixture = () => {
	const directory = mkdtempSync(join(tmpdir(), "spendly-hooks-test-"));
	fixtureDirectories.push(directory);
	const root = join(directory, "main");
	mkdirSync(join(root, "scripts"), { recursive: true });
	copyFileSync(
		join(projectRoot, "scripts/install-hooks.mjs"),
		join(root, "scripts/install-hooks.mjs")
	);
	writeFileSync(join(root, "package.json"), '{"private":true}');
	writeFileSync(join(root, ".gitignore"), "node_modules/\n.lefthook-hooks/\n");
	writeFileSync(
		join(root, "lefthook.yml"),
		"lefthook: pnpm exec lefthook\npre-commit:\n  jobs:\n    - run: node --version\npre-push:\n  jobs:\n    - run: node --version\n"
	);
	git(root, ["init", "-q", "-b", "master"]);
	git(root, ["config", "core.hooksPath", ".husky/_"]);
	git(root, ["add", "."]);
	git(root, [
		"-c",
		"user.name=Hook Test",
		"-c",
		"user.email=hooks@example.com",
		"commit",
		"-qm",
		"fixture",
	]);
	return { directory, root };
};
const install = (root, env) =>
	run(root, process.execPath, ["scripts/install-hooks.mjs"], env);

test("installation isolates linked worktrees and resolves their local runner", () => {
	const { directory, root } = fixture();
	const worktree = join(directory, "feature");
	git(root, ["worktree", "add", "-q", "-b", "feature", worktree]);
	symlinkSync(
		join(projectRoot, "node_modules"),
		join(worktree, "node_modules"),
		"dir"
	);
	const result = install(worktree);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		git(worktree, ["config", "--get", "core.hooksPath"]),
		".lefthook-hooks"
	);
	assert.equal(git(root, ["config", "--get", "core.hooksPath"]), ".husky/_");
	assert.equal(existsSync(join(root, ".lefthook-hooks")), false);
	for (const hook of ["pre-commit", "pre-push"]) {
		const contents = readFileSync(
			join(worktree, ".lefthook-hooks", hook),
			"utf8"
		);
		assert.ok(contents.includes("pnpm exec lefthook"));
		const execution = run(worktree, "sh", [
			join(worktree, ".lefthook-hooks", hook),
		]);
		assert.equal(execution.status, 0, execution.stdout + execution.stderr);
	}
	const repeated = install(worktree);
	assert.equal(repeated.status, 0, repeated.stderr);
	assert.equal(git(root, ["config", "--get", "core.hooksPath"]), ".husky/_");
});

test("a failed install restores the inherited hook path", () => {
	const { root } = fixture();
	const result = install(root);
	assert.notEqual(result.status, 0);
	assert.equal(git(root, ["config", "--get", "core.hooksPath"]), ".husky/_");
	assert.equal(existsSync(join(root, ".lefthook-hooks")), false);
});

test("CI, production, and explicit opt-out do not change Git configuration", () => {
	const { root } = fixture();
	for (const env of [
		{ CI: "true" },
		{ NODE_ENV: "production" },
		{ LEFTHOOK: "0" },
	]) {
		assert.equal(install(root, env).status, 0);
		assert.equal(git(root, ["config", "--get", "core.hooksPath"]), ".husky/_");
		assert.equal(existsSync(join(root, ".git/config.worktree")), false);
	}
});

test("the commit hook formats staged files without staging unrelated edits", () => {
	const { root } = fixture();
	symlinkSync(
		join(projectRoot, "node_modules"),
		join(root, "node_modules"),
		"dir"
	);
	const metadata = JSON.parse(
		readFileSync(join(projectRoot, "package.json"), "utf8")
	);
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ private: true, "lint-staged": metadata["lint-staged"] })
	);
	copyFileSync(join(projectRoot, "biome.json"), join(root, "biome.json"));
	copyFileSync(join(projectRoot, "lefthook.yml"), join(root, "lefthook.yml"));
	const file = join(root, "partial file.json");
	const initial = `${JSON.stringify(
		{
			staged: 0,
			middle1: 0,
			middle2: 0,
			middle3: 0,
			middle4: 0,
			unstaged: 0,
		},
		null,
		2
	)}\n`;
	writeFileSync(file, initial);
	git(root, ["add", "."]);
	git(root, [
		"-c",
		"user.name=Hook Test",
		"-c",
		"user.email=hooks@example.com",
		"commit",
		"-qm",
		"baseline",
	]);
	const staged = initial.replace('"staged": 0', '"staged":1');
	writeFileSync(file, staged);
	git(root, ["add", "partial file.json"]);
	writeFileSync(file, staged.replace('"unstaged": 0', '"unstaged": 2'));
	assert.equal(install(root).status, 0);
	const execution = run(root, "sh", [join(root, ".lefthook-hooks/pre-commit")]);
	assert.equal(execution.status, 0, execution.stdout + execution.stderr);
	const indexContents = git(root, ["show", ":partial file.json"]);
	assert.equal(JSON.parse(indexContents).staged, 1);
	assert.equal(JSON.parse(indexContents).unstaged, 0);
	assert.ok(indexContents.includes('"staged": 1'));
	assert.equal(JSON.parse(readFileSync(file, "utf8")).unstaged, 2);
});
