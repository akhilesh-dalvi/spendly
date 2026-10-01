import { existsSync, readFileSync } from "node:fs";

const packageMetadataPath = [
	new URL("../package.json", import.meta.url),
	new URL("../../package.json", import.meta.url),
].find((candidate) => existsSync(candidate));

if (!packageMetadataPath) {
	throw new Error("Spendly package metadata could not be found");
}

const packageMetadata: unknown = JSON.parse(
	readFileSync(packageMetadataPath, "utf8")
);

if (
	typeof packageMetadata !== "object" ||
	packageMetadata === null ||
	!("version" in packageMetadata) ||
	typeof packageMetadata.version !== "string" ||
	packageMetadata.version.length === 0
) {
	throw new Error("Spendly package metadata is missing a version");
}

export const CLI_VERSION = packageMetadata.version;
