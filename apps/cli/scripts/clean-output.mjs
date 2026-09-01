import { rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_OUTPUT_DIRECTORIES = new Set(["development-dist", "dist"]);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, "..");
const requestedDirectory = process.argv[2];
const outputDirectory = resolve(packageDirectory, requestedDirectory ?? "");

if (
	!(requestedDirectory && ALLOWED_OUTPUT_DIRECTORIES.has(requestedDirectory)) ||
	dirname(outputDirectory) !== packageDirectory ||
	basename(outputDirectory) !== requestedDirectory
) {
	throw new Error("Refusing to clean an unexpected output directory");
}

rmSync(outputDirectory, { force: true, recursive: true });
