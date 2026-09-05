import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(webDirectory, "../..");
const contentDirectory = join(webDirectory, "content/docs/cli");
const cliEntry = join(repositoryDirectory, "apps/cli/dist/index.js");
const cliSchemas = join(repositoryDirectory, "apps/cli/dist/domain/schemas.js");

const GLOBAL_OPTIONS = new Set([
	"--allow-file-storage",
	"--debug",
	"--help",
	"--json",
	"--no-color",
	"--no-retry",
	"--non-interactive",
	"--version",
]);
const COMMAND_GROUPS = new Set([
	"account-types",
	"accounts",
	"auth",
	"categories",
	"cycles",
	"expenses",
	"tags",
]);
const REQUIRED_PAGES = [
	"index",
	"installation",
	"authentication",
	"cli-contract",
	"expenses",
	"accounts",
	"transfers",
	"agent-skill",
	"privacy",
	"troubleshooting",
];
const LEAKAGE_PATTERNS = [
	{ label: "authorization header", pattern: /authorization:\s*bearer\s+/iu },
	{ label: "Clerk secret key", pattern: /sk_(?:live|test)_[a-z0-9]+/iu },
	{ label: "Clerk publishable key", pattern: /pk_(?:live|test)_[a-z0-9]+/iu },
	{
		label: "Convex deployment URL",
		pattern: /https:\/\/[a-z0-9-]+\.convex\.(?:cloud|site)/iu,
	},
	{ label: "home-directory path", pattern: /\/(?:Users|home)\/[^\s/]+/u },
	{
		label: "JWT-shaped value",
		pattern: /\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/iu,
	},
];

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

const listFiles = (directory) => {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(path));
		} else {
			files.push(path);
		}
	}
	return files;
};

const tokenize = (command) =>
	command.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+/gu) ?? [];

const getCommandPath = (tokens, file) => {
	let tokenIndex = 1;
	while (GLOBAL_OPTIONS.has(tokens[tokenIndex])) {
		tokenIndex += 1;
	}

	const rootCommand = tokens[tokenIndex];
	if (!rootCommand) {
		return [];
	}
	const commandPath = [rootCommand];
	if (COMMAND_GROUPS.has(rootCommand)) {
		const subcommand = tokens[tokenIndex + 1];
		assert(
			subcommand && !subcommand.startsWith("-"),
			`Missing subcommand after ${rootCommand} in ${file}`
		);
		commandPath.push(subcommand);
	}
	return commandPath;
};

const getCodeBlocks = (content, language) => {
	const blocks = [];
	const fence = "```";
	const pattern = new RegExp(
		`${fence}${language}[^\\n]*\\n([\\s\\S]*?)${fence}`,
		"gu"
	);
	for (const match of content.matchAll(pattern)) {
		blocks.push(match[1]);
	}
	return blocks;
};

const getSpendlyCommands = (content) =>
	getCodeBlocks(content, "bash").flatMap((block) =>
		block
			.replace(/\\\r?\n\s*/gu, " ")
			.split(/\r?\n/gu)
			.map((line) => line.trim())
			.filter((line) => line.startsWith("spendly "))
	);

const helpCache = new Map();
const getHelp = (commandPath) => {
	const cacheKey = commandPath.join(" ");
	const cached = helpCache.get(cacheKey);
	if (cached) {
		return cached;
	}
	const help = execFileSync(
		process.execPath,
		[cliEntry, ...commandPath, "--help"],
		{ encoding: "utf8", stdio: "pipe" }
	);
	helpCache.set(cacheKey, help);
	return help;
};

const meta = JSON.parse(
	readFileSync(join(contentDirectory, "meta.json"), "utf8")
);
assert(Array.isArray(meta.pages), "CLI docs meta.json must declare pages");
assert(
	JSON.stringify(meta.pages) === JSON.stringify(REQUIRED_PAGES),
	"CLI docs navigation must contain the approved pages in order"
);

const mdxFiles = listFiles(contentDirectory).filter(
	(file) => extname(file) === ".mdx"
);
assert(
	mdxFiles.length === REQUIRED_PAGES.length,
	`Expected ${REQUIRED_PAGES.length} CLI documentation pages`
);

const knownRoutes = new Set(
	REQUIRED_PAGES.map((page) =>
		page === "index" ? "/docs/cli" : `/docs/cli/${page}`
	)
);
const { jsonErrorEnvelopeSchema, jsonSuccessEnvelopeSchema } = await import(
	pathToFileURL(cliSchemas).href
);
let checkedCommands = 0;
let checkedJsonExamples = 0;

for (const file of mdxFiles) {
	const displayPath = relative(repositoryDirectory, file);
	const content = readFileSync(file, "utf8");
	const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
	assert(frontmatter, `Missing frontmatter in ${displayPath}`);
	assert(
		/^title:\s*.+$/mu.test(frontmatter),
		`Missing title in ${displayPath}`
	);
	assert(
		/^description:\s*.+$/mu.test(frontmatter),
		`Missing description in ${displayPath}`
	);

	for (const { label, pattern } of LEAKAGE_PATTERNS) {
		assert(!pattern.test(content), `${displayPath} contains a ${label}`);
	}

	for (const match of content.matchAll(
		/\]\((\/docs\/cli(?:\/[a-z0-9-]+)?)\)/gu
	)) {
		assert(
			knownRoutes.has(match[1]),
			`${displayPath} links to unknown CLI docs route ${match[1]}`
		);
	}

	for (const command of getSpendlyCommands(content)) {
		const tokens = tokenize(command);
		const commandPath = getCommandPath(tokens, displayPath);
		const help = getHelp(commandPath);
		for (const option of tokens.filter((token) => token.startsWith("--"))) {
			assert(
				GLOBAL_OPTIONS.has(option) || help.includes(option),
				`${displayPath} uses unknown option ${option} for ${commandPath.join(" ")}`
			);
		}
		checkedCommands += 1;
	}

	for (const block of getCodeBlocks(content, "json")) {
		const value = JSON.parse(block);
		if ("error" in value) {
			jsonErrorEnvelopeSchema.parse(value);
		} else {
			jsonSuccessEnvelopeSchema.parse(value);
		}
		checkedJsonExamples += 1;
	}
}

assert(checkedCommands > 0, "CLI docs must contain checked Spendly commands");
assert(checkedJsonExamples > 0, "CLI docs must contain checked JSON examples");

process.stdout.write(
	`Validated ${mdxFiles.length} CLI docs pages, ${checkedCommands} commands, ${checkedJsonExamples} JSON examples, links, and leakage boundaries.\n`
);
