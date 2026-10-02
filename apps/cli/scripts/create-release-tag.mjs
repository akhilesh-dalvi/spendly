import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertRelease } from "./verify-release-artifact.mjs";
import { verifyReleaseSource } from "./verify-release-source.mjs";

export const createReleaseTag = async (
	environment,
	request,
	packageVersion
) => {
	assertRelease(
		environment.RELEASE_VERSION === packageVersion,
		"Tag version must match the verified package version"
	);
	await verifyReleaseSource(environment, request, "candidate");
	const { RELEASE_VERSION: version, SOURCE_COMMIT: commit } = environment;
	const tag = `v${version}`;
	const ref = `refs/tags/${tag}`;
	const existing = await request(`git/ref/tags/${tag}`, {
		allowNotFound: true,
	});
	let created = false;
	if (existing === null) {
		// Create only. Never PATCH, force-push, or delete an existing version tag.
		const result = await request("git/refs", {
			method: "POST",
			body: { ref, sha: commit },
		});
		assertRelease(
			result.ref === ref &&
				result.object?.type === "commit" &&
				result.object.sha === commit,
			"GitHub did not create the expected release tag"
		);
		created = true;
	} else {
		assertRelease(existing.ref === ref, "Unexpected existing release tag");
	}
	// Resolve annotated tags as well as lightweight tags, including on reruns.
	const taggedCommit = await request(`commits/refs%2Ftags%2F${tag}`);
	assertRelease(
		taggedCommit.sha === commit,
		`Tag ${tag} already points to a different commit; choose a new version instead of moving the tag`
	);
	return { tag, commit, created };
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const metadata = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8")
	);
	const request = async (path, options = {}) => {
		const response = await fetch(
			`https://api.github.com/repos/akhilesh-dalvi/spendly/${path}`,
			{
				method: options.method ?? "GET",
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${process.env.GH_TOKEN}`,
					"Content-Type": "application/json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
				body:
					options.body === undefined ? undefined : JSON.stringify(options.body),
			}
		);
		if (options.allowNotFound && response.status === 404) {
			return null;
		}
		assertRelease(
			response.ok,
			`Release tag request failed (${response.status}); inspect the existing tag before retrying`
		);
		return await response.json();
	};
	const result = await createReleaseTag(process.env, request, metadata.version);
	const message = `${result.created ? "Created" : "Verified existing"} ${result.tag} at ${result.commit}.`;
	process.stdout.write(`${message}\n`);
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(
			process.env.GITHUB_STEP_SUMMARY,
			`${message}\n\nThis tag identifies the verified candidate; npm publication is a separate step.\n`
		);
	}
}
