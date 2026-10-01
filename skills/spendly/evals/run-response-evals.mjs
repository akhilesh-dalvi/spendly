import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const evaluationDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = dirname(evaluationDirectory);
const repositoryDirectory = resolve(skillDirectory, "../..");
const evaluationManifest = JSON.parse(
	readFileSync(join(evaluationDirectory, "evals.json"), "utf8")
);
const supportedAgents = new Set(["claude", "codex"]);

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

const getArgument = (name) => {
	const prefix = `--${name}=`;
	return process.argv
		.find((argument) => argument.startsWith(prefix))
		?.slice(prefix.length);
};

const collectBundleFiles = (directory) => {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "evals") {
				continue;
			}
			files.push(...collectBundleFiles(path));
			continue;
		}
		files.push(path);
	}
	return files.sort();
};

const hashBundle = () => {
	const hash = createHash("sha256");
	for (const path of collectBundleFiles(skillDirectory)) {
		hash.update(relative(skillDirectory, path));
		hash.update("\0");
		hash.update(readFileSync(path));
		hash.update("\0");
	}
	return hash.digest("hex");
};

const createPrompt = (
	evaluation
) => `You are evaluating the exact Spendly skill candidate in this directory.
Read SKILL.md and only the references needed for this case. Do not execute the Spendly CLI, access Spendly data, inspect credentials, or mutate anything. Answer with a concise plan and exact command shapes. Put global flags before the command, and use --agent --json --non-interactive for every agent-operated Spendly command.

${evaluation.prompt}`;

const runAgent = ({ agent, prompt, responsePath, sessionDirectory }) => {
	const command = agent === "codex" ? "codex" : "claude";
	const args =
		agent === "codex"
			? [
					"exec",
					"--ephemeral",
					"--ignore-user-config",
					"--sandbox",
					"read-only",
					"--skip-git-repo-check",
					"--color",
					"never",
					"--output-last-message",
					responsePath,
					prompt,
				]
			: [
					"--print",
					"--permission-mode",
					"plan",
					"--no-session-persistence",
					prompt,
				];
	const result = spawnSync(command, args, {
		cwd: sessionDirectory,
		encoding: "utf8",
		maxBuffer: 2 * 1024 * 1024,
		stdio: "pipe",
	});
	if (result.error) {
		throw new Error(`${command} could not start: ${result.error.message}`);
	}
	assert(
		result.status === 0,
		`${command} exited with status ${result.status}: ${result.stderr.slice(-2000)}`
	);
	if (agent === "claude") {
		writeFileSync(responsePath, result.stdout);
	}
};

const agent = getArgument("agent");
const outputArgument = getArgument("output");
const caseArgument = getArgument("case");
assert(
	agent && supportedAgents.has(agent),
	"Use --agent=codex or --agent=claude"
);
assert(outputArgument, "Use an absolute --output path outside the repository");
assert(isAbsolute(outputArgument), "--output must be an absolute path");
const outputDirectory = resolve(outputArgument);
assert(
	!outputDirectory.startsWith(`${repositoryDirectory}${sep}`),
	"Evaluation output must stay outside the repository"
);

const requestedCases = caseArgument
	? new Set(
			caseArgument
				.split(",")
				.map((value) => Number.parseInt(value, 10))
				.filter(Number.isInteger)
		)
	: null;
const evaluations = requestedCases
	? evaluationManifest.evals.filter((evaluation) =>
			requestedCases.has(evaluation.id)
		)
	: evaluationManifest.evals;
assert(
	evaluations.length > 0 &&
		(requestedCases === null || evaluations.length === requestedCases.size),
	`Unknown evaluation case list ${caseArgument}`
);

mkdirSync(outputDirectory, { recursive: true });
const startedAt = new Date().toISOString();
const reviewCases = [];

for (const evaluation of evaluations) {
	const sessionDirectory = mkdtempSync(
		join(tmpdir(), `spendly-${agent}-eval-${evaluation.id}-`)
	);
	const responsePath = join(
		outputDirectory,
		`${agent}-eval-${evaluation.id}.md`
	);
	try {
		cpSync(
			join(skillDirectory, "SKILL.md"),
			join(sessionDirectory, "SKILL.md")
		);
		cpSync(
			join(skillDirectory, "references"),
			join(sessionDirectory, "references"),
			{
				recursive: true,
			}
		);
		runAgent({
			agent,
			prompt: createPrompt(evaluation),
			responsePath,
			sessionDirectory,
		});
		reviewCases.push({
			expectations: evaluation.expectations,
			id: evaluation.id,
			response: responsePath,
			status: "pending_manual_review",
		});
	} finally {
		rmSync(sessionDirectory, { force: true, recursive: true });
	}
}

const review = {
	agent,
	completedAt: new Date().toISOString(),
	evaluationManifest: "skills/spendly/evals/evals.json",
	reviewCases,
	skillSha256: hashBundle(),
	startedAt,
};
writeFileSync(
	join(outputDirectory, `${agent}-review.json`),
	`${JSON.stringify(review, null, 2)}\n`
);
process.stdout.write(
	`Generated ${reviewCases.length} fresh ${agent} responses in ${outputDirectory}. Manual expectation and leakage review is still required.\n`
);
