import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evalDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = dirname(evalDirectory);
const evaluationPath = join(evalDirectory, "evals.json");
const referenceDirectory = join(skillDirectory, "references");
const skillPath = join(skillDirectory, "SKILL.md");

const requiredEvaluationIds = new Set(
	Array.from({ length: 10 }, (_, index) => index + 1)
);

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

const readEvaluationManifest = async () => {
	const contents = await readFile(evaluationPath, "utf8");
	return JSON.parse(contents);
};

const collectTextFiles = async (directory) => {
	const entries = await readdir(directory, { withFileTypes: true });
	const paths = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			paths.push(...(await collectTextFiles(path)));
			continue;
		}
		if (path !== fileURLToPath(import.meta.url)) {
			paths.push(path);
		}
	}

	return paths;
};

const validateEvaluationManifest = (manifest) => {
	assert(manifest.skill_name === "spendly", "Unexpected skill_name");
	assert(Array.isArray(manifest.evals), "evals must be an array");

	const seenIds = new Set();
	for (const evaluation of manifest.evals) {
		assert(
			requiredEvaluationIds.has(evaluation.id),
			`Unexpected evaluation id: ${evaluation.id}`
		);
		assert(
			!seenIds.has(evaluation.id),
			`Duplicate evaluation id: ${evaluation.id}`
		);
		seenIds.add(evaluation.id);
		assert(
			typeof evaluation.prompt === "string" && evaluation.prompt.length > 20,
			`Evaluation ${evaluation.id} needs a realistic prompt`
		);
		assert(
			evaluation.prompt.startsWith(
				"Evaluation only: do not run commands or access Spendly data."
			),
			`Evaluation ${evaluation.id} must be plan-only`
		);
		assert(
			typeof evaluation.expected_output === "string" &&
				evaluation.expected_output.length > 20,
			`Evaluation ${evaluation.id} needs an expected output`
		);
		assert(
			Array.isArray(evaluation.files) && evaluation.files.length === 0,
			`Evaluation ${evaluation.id} must not include user files`
		);
		assert(
			Array.isArray(evaluation.expectations) &&
				evaluation.expectations.length >= 4,
			`Evaluation ${evaluation.id} needs behavioral expectations`
		);
	}

	assert(
		seenIds.size === requiredEvaluationIds.size,
		"The evaluation suite is incomplete"
	);
};

const validateReferenceRouting = async () => {
	const skill = await readFile(skillPath, "utf8");
	const referencedPaths = new Set(
		[...skill.matchAll(/\]\((references\/[^)#?]+\.md)\)/gu)].map(
			(match) => match[1]
		)
	);
	const referenceFiles = (await readdir(referenceDirectory))
		.filter((name) => name.endsWith(".md"))
		.map((name) => `references/${name}`);

	assert(referencedPaths.size > 0, "SKILL.md must route to focused references");
	for (const referencePath of referenceFiles) {
		assert(
			referencedPaths.has(referencePath),
			`Orphaned reference: ${referencePath}`
		);
	}
	for (const referencePath of referencedPaths) {
		assert(
			referenceFiles.includes(referencePath),
			`Missing reference: ${referencePath}`
		);
	}
};

const leakagePatterns = [
	{ label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
	{ label: "JWT", pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./u },
	{
		label: "secret key",
		pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/u,
	},
	{
		label: "assigned secret",
		pattern: /\b(?:CLERK_SECRET_KEY|CONVEX_DEPLOY_KEY)\s*=\s*\S+/u,
	},
	{
		label: "email address",
		pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
	},
	{ label: "user home path", pattern: /\/(?:Users|home)\/[^/\s]+\//u },
	{ label: "Convex-shaped ID", pattern: /\b[a-z0-9]{32}\b/u },
];

const validateNoPersonalData = async () => {
	const paths = await collectTextFiles(skillDirectory);
	for (const path of paths) {
		const contents = await readFile(path, "utf8");
		for (const { label, pattern } of leakagePatterns) {
			assert(!pattern.test(contents), `${label} found in ${path}`);
		}
	}
};

const manifest = await readEvaluationManifest();
validateEvaluationManifest(manifest);
await validateReferenceRouting();
await validateNoPersonalData();

process.stdout.write(
	`Validated ${manifest.evals.length} Spendly evaluations, reference routing, and personal-data isolation.\n`
);
