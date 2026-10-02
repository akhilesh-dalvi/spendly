import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	assertRelease,
	validateReleaseInputs,
} from "./verify-release-artifact.mjs";

const runIdPattern = /^[1-9]\d*$/u;

export const verifyReleaseSource = async (environment, request, mode) => {
	validateReleaseInputs(environment);
	const { SOURCE_COMMIT: commit, RELEASE_VERSION: version } = environment;
	assertRelease(
		environment.GITHUB_REPOSITORY === "akhilesh-dalvi/spendly",
		"Unexpected release repository"
	);
	assertRelease(
		environment.GITHUB_REF === "refs/heads/master" &&
			environment.GITHUB_SHA === commit,
		"Dispatch the release workflow from the exact reviewed master commit"
	);
	const master = await request("commits/master");
	assertRelease(
		master.sha === commit,
		"master moved; freeze and review a new candidate"
	);

	if (mode !== "candidate") {
		const tag = await request(`commits/refs%2Ftags%2Fv${version}`);
		assertRelease(
			tag.sha === commit,
			"Release tag does not identify the candidate commit"
		);
		const release = await request(`releases/tags/v${version}`);
		assertRelease(
			release.tag_name === `v${version}` &&
				!release.draft &&
				release.body?.trim(),
			"A published GitHub Release with release notes is required"
		);
	}
	if (mode === "identity") {
		return;
	}
	const runs = await request(
		`actions/workflows/cli-ci.yml/runs?head_sha=${commit}&event=push&status=success&per_page=100`
	);
	assertRelease(
		runs.workflow_runs.some(
			(run) =>
				run.head_sha === commit &&
				run.head_branch === "master" &&
				run.event === "push" &&
				run.conclusion === "success" &&
				run.head_repository?.full_name === environment.GITHUB_REPOSITORY
		),
		"The complete CLI readiness suite must pass on this master commit"
	);
	if (mode === "candidate") {
		return;
	}
	assertRelease(
		runIdPattern.test(environment.CANDIDATE_RUN ?? ""),
		"Candidate run must be a numeric workflow run ID"
	);
	const run = await request(`actions/runs/${environment.CANDIDATE_RUN}`);
	assertRelease(
		run.path === ".github/workflows/cli-release-candidate.yml" &&
			run.head_sha === commit &&
			run.head_branch === "master" &&
			run.event === "workflow_dispatch" &&
			run.status === "completed" &&
			run.conclusion === "success" &&
			run.head_repository?.full_name === environment.GITHUB_REPOSITORY,
		"Candidate must come from the successful master candidate workflow for this commit"
	);
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const mode = process.argv[2];
	assertRelease(
		["candidate", "publish", "identity"].includes(mode),
		"Expected candidate, publish, or identity verification mode"
	);
	const request = async (path) => {
		const response = await fetch(
			`https://api.github.com/repos/akhilesh-dalvi/spendly/${path}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${process.env.GH_TOKEN}`,
					"X-GitHub-Api-Version": "2022-11-28",
				},
			}
		);
		assertRelease(
			response.ok,
			`GitHub release verification failed (${response.status})`
		);
		return await response.json();
	};
	await verifyReleaseSource(process.env, request, mode);
	process.stdout.write(
		"Verified reviewed release source and required hosted gates.\n"
	);
}
