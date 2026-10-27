import { describe, expect, it, vi } from "vitest";
import { createReleaseTag } from "./create-release-tag.mjs";

const createFixture = (version = "0.1.0") => {
	const commit = "a".repeat(40);
	const environment = {
		GITHUB_REF: "refs/heads/master",
		GITHUB_REPOSITORY: "akhilesh-dalvi/spendly",
		GITHUB_SHA: commit,
		RELEASE_VERSION: version,
		SOURCE_COMMIT: commit,
	};
	const ref = `refs/tags/v${version}`;
	const refPath = `git/ref/tags/v${version}`;
	const commitPath = `commits/refs%2Ftags%2Fv${version}`;
	const responses = {
		"commits/master": { sha: commit },
		[`actions/workflows/cli-ci.yml/runs?head_sha=${commit}&event=push&status=success&per_page=100`]:
			{
				workflow_runs: [
					{
						conclusion: "success",
						event: "push",
						head_branch: "master",
						head_repository: { full_name: environment.GITHUB_REPOSITORY },
						head_sha: commit,
					},
				],
			},
		[refPath]: null,
		[commitPath]: { sha: commit },
	};
	const request = vi.fn((path, options = {}) => {
		if (path === "git/refs" && options.method === "POST") {
			responses[refPath] = {
				object: { sha: options.body.sha, type: "commit" },
				ref: options.body.ref,
			};
			return responses[refPath];
		}
		if (!(path in responses)) {
			throw new Error(`Unexpected request ${path}`);
		}
		return responses[path];
	});
	return { commit, commitPath, environment, ref, refPath, request, responses };
};

describe("automatic version tags", () => {
	it.each(["0.1.0", "0.1.1", "0.2.0"])(
		"tags verified package %s at its exact source commit",
		async (version) => {
			const fixture = createFixture(version);
			await expect(
				createReleaseTag(fixture.environment, fixture.request, version)
			).resolves.toEqual({
				commit: fixture.commit,
				created: true,
				tag: `v${version}`,
			});
			expect(fixture.request).toHaveBeenCalledWith("git/refs", {
				body: { ref: `refs/tags/v${version}`, sha: fixture.commit },
				method: "POST",
			});
		}
	);
	it("reuses an identical tag on reruns without another write", async () => {
		const fixture = createFixture();
		await createReleaseTag(fixture.environment, fixture.request, "0.1.0");
		fixture.request.mockClear();
		await expect(
			createReleaseTag(fixture.environment, fixture.request, "0.1.0")
		).resolves.toMatchObject({ created: false });
		expect(
			fixture.request.mock.calls.every(([, options]) => !options?.method)
		).toBe(true);
	});
	it("accepts an existing annotated tag resolving to the same commit", async () => {
		const fixture = createFixture();
		fixture.responses[fixture.refPath] = {
			object: { sha: "b".repeat(40), type: "tag" },
			ref: fixture.ref,
		};
		await expect(
			createReleaseTag(fixture.environment, fixture.request, "0.1.0")
		).resolves.toMatchObject({ commit: fixture.commit, created: false });
	});
	it("never moves an existing tag to a new commit", async () => {
		const fixture = createFixture();
		fixture.responses[fixture.refPath] = {
			object: { sha: "b".repeat(40), type: "commit" },
			ref: fixture.ref,
		};
		fixture.responses[fixture.commitPath] = { sha: "b".repeat(40) };
		await expect(
			createReleaseTag(fixture.environment, fixture.request, "0.1.0")
		).rejects.toThrow("different commit");
		expect(
			fixture.request.mock.calls.every(([, options]) => !options?.method)
		).toBe(true);
	});
	it("refuses a version different from the package manifest before any API calls", async () => {
		const fixture = createFixture();
		await expect(
			createReleaseTag(fixture.environment, fixture.request, "0.2.0")
		).rejects.toThrow("Tag version must match");
		expect(fixture.request).not.toHaveBeenCalled();
	});
	it("does not tag when master moved during approval", async () => {
		const fixture = createFixture();
		fixture.responses["commits/master"].sha = "b".repeat(40);
		await expect(
			createReleaseTag(fixture.environment, fixture.request, "0.1.0")
		).rejects.toThrow("master moved");
		expect(fixture.request).not.toHaveBeenCalledWith(
			"git/refs",
			expect.anything()
		);
	});
	it("does not tag without passing master CI", async () => {
		const fixture = createFixture();
		const runs = Object.values(fixture.responses).find(
			(value) => value && "workflow_runs" in value
		);
		runs.workflow_runs = [];
		await expect(
			createReleaseTag(fixture.environment, fixture.request, "0.1.0")
		).rejects.toThrow("complete CLI readiness suite");
		expect(fixture.request).not.toHaveBeenCalledWith(
			"git/refs",
			expect.anything()
		);
	});
	it("stops on API errors instead of treating them as missing tags", async () => {
		const fixture = createFixture();
		const request = (path, options) => {
			if (path === fixture.refPath) {
				throw new Error("GitHub unavailable");
			}
			return fixture.request(path, options);
		};
		await expect(
			createReleaseTag(fixture.environment, request, "0.1.0")
		).rejects.toThrow("GitHub unavailable");
		expect(fixture.request).not.toHaveBeenCalledWith(
			"git/refs",
			expect.anything()
		);
	});
});
