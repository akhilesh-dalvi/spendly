import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const gitDirectory = resolve(repoRoot, ".git");
const shouldSkipHusky = Boolean(process.env.CI) || Boolean(process.env.VERCEL);

if (shouldSkipHusky) {
	process.exit(0);
}

if (!existsSync(gitDirectory)) {
	console.warn("Skipping Husky install because .git was not found.");
	process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "husky"], {
	cwd: repoRoot,
	stdio: "inherit",
});

if (typeof result.status === "number") {
	process.exit(result.status);
}

throw result.error ?? new Error("Failed to run Husky during prepare.");
