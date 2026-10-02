import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const hooksPath = ".lefthook-hooks";
const isEnabled = (value) =>
	Boolean(value && value !== "0" && value !== "false");

const git = (args, allowMissing = false) => {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	if (result.error) {
		throw result.error;
	}
	if (allowMissing && result.status === 1) {
		return undefined;
	}
	if (result.status !== 0) {
		throw new Error(`Git hook setup failed: ${result.stderr.trim()}`);
	}
	return result.stdout.trim();
};

const installHooks = () => {
	const hooksDisabled = process.env.LEFTHOOK === "0";
	if (
		isEnabled(process.env.CI) ||
		hooksDisabled ||
		process.env.NODE_ENV === "production" ||
		!existsSync(new URL("../.git", import.meta.url))
	) {
		return;
	}

	// Linked worktrees share repository config, but need their own hooks path.
	if (
		git(["config", "--local", "--get", "extensions.worktreeConfig"], true) !==
		"true"
	) {
		if (
			git(["config", "--local", "--get", "core.bare"], true) === "true" ||
			git(["config", "--local", "--get", "core.worktree"], true)
		) {
			throw new Error(
				"Enable worktree-specific Git configuration before installing hooks in a bare or custom-worktree repository."
			);
		}
		git(["config", "--local", "extensions.worktreeConfig", "true"]);
	}

	const previousPath = git(
		["config", "--worktree", "--get", "core.hooksPath"],
		true
	);
	git(["config", "--worktree", "core.hooksPath", hooksPath]);

	try {
		const result = spawnSync(
			process.execPath,
			[
				fileURLToPath(
					new URL("../node_modules/lefthook/bin/index.js", import.meta.url)
				),
				"install",
				"--force",
			],
			{ cwd: root, encoding: "utf8" }
		);
		if (result.error) {
			throw result.error;
		}
		if (result.status !== 0) {
			throw new Error(
				`Lefthook installation failed: ${result.stderr.trim() || result.stdout.trim()}. Run pnpm hooks:install to retry.`
			);
		}
		process.stdout.write(
			`Lefthook installed for this checkout in ${hooksPath}/.\n`
		);
	} catch (error) {
		if (previousPath === undefined) {
			git(["config", "--worktree", "--unset", "core.hooksPath"]);
		} else {
			git(["config", "--worktree", "core.hooksPath", previousPath]);
		}
		throw error;
	}
};

installHooks();
