import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = join(scriptDirectory, "..");
const auditDirectory = mkdtempSync(join(tmpdir(), "spendly-release-audit-"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
	copyFileSync(
		join(packageDirectory, "package.json"),
		join(auditDirectory, "package.json")
	);
	copyFileSync(
		join(packageDirectory, "npm-shrinkwrap.json"),
		join(auditDirectory, "package-lock.json")
	);
	execFileSync(npmCommand, ["audit", "--omit=dev", "--audit-level=high"], {
		cwd: auditDirectory,
		env: {
			...process.env,
			npm_config_cache: join(auditDirectory, "npm-cache"),
		},
		stdio: "inherit",
	});
} finally {
	rmSync(auditDirectory, { force: true, recursive: true });
}
