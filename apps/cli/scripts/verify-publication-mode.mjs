import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	assertRelease,
	validateReleaseInputs,
} from "./verify-release-artifact.mjs";

// This stays fixed after bootstrap; later versions must use OIDC staging.
const FIRST_PUBLIC_VERSION = "0.1.1";

export const verifyPublicationMode = async (environment, request = fetch) => {
	validateReleaseInputs(environment);
	assertRelease(
		["true", "false"].includes(environment.BOOTSTRAP),
		"Bootstrap must be explicitly true or false"
	);
	assertRelease(
		environment.RELEASE_VERSION !== "0.1.0",
		"The superseded 0.1.0 candidate must not be published"
	);
	const bootstrap = environment.BOOTSTRAP === "true";
	assertRelease(
		bootstrap === (environment.RELEASE_VERSION === FIRST_PUBLIC_VERSION),
		`Only the initial ${FIRST_PUBLIC_VERSION} release may use bootstrap; later releases must use OIDC staging`
	);
	const response = await request("https://registry.npmjs.org/spendly");
	assertRelease(
		response.status === (bootstrap ? 404 : 200),
		"Unexpected npm package state; verify availability and ownership before continuing"
	);
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	await verifyPublicationMode(process.env);
	process.stdout.write("Verified publication mode and npm package state.\n");
}
