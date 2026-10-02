import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = join(scriptDirectory, "..");
const packagePath = join(packageDirectory, "package.json");
const shrinkwrapPath = join(packageDirectory, "npm-shrinkwrap.json");
const generationDirectory = mkdtempSync(
	join(tmpdir(), "spendly-shrinkwrap-generation-")
);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const packageMetadata = JSON.parse(readFileSync(packagePath, "utf8"));
const generationManifest = {
	name: packageMetadata.name,
	version: packageMetadata.version,
	private: true,
	license: packageMetadata.license,
	engines: packageMetadata.engines,
	dependencies: packageMetadata.dependencies,
};

try {
	writeFileSync(
		join(generationDirectory, "package.json"),
		`${JSON.stringify(generationManifest, null, 2)}\n`
	);
	execFileSync(
		npmCommand,
		[
			"install",
			"--package-lock-only",
			"--ignore-scripts",
			"--omit=dev",
			"--no-audit",
			"--no-fund",
		],
		{
			cwd: generationDirectory,
			env: {
				...process.env,
				npm_config_cache: join(generationDirectory, "npm-cache"),
			},
			stdio: "inherit",
		}
	);

	const lockfile = JSON.parse(
		readFileSync(join(generationDirectory, "package-lock.json"), "utf8")
	);
	writeFileSync(shrinkwrapPath, `${JSON.stringify(lockfile, null, 2)}\n`);
	process.stdout.write(
		`Generated ${shrinkwrapPath} from exact production dependencies.\n`
	);
} finally {
	rmSync(generationDirectory, { force: true, recursive: true });
}
