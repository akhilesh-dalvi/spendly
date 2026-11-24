import { ConvexError } from "convex/values";
import { expect, it, vi } from "vitest";
import { runCli } from "../cli.js";
import { CliError } from "../errors.js";
import type { InteractivePrompter } from "../input/types.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const args = ["tags", "add", "--name", "  Work  "];
const tag = { id: "tag-work", name: "Work" };
const config = () => ({
	authReady: true as const,
	clientId: "client-id",
	convexUrl: "https://example.convex.cloud",
	environment: "development" as const,
	issuer: "https://issuer.example",
	webUrl: "http://localhost:3001",
});

const createRuntime = (prompter?: InteractivePrompter) => {
	let stdout = "";
	const mutation = vi.fn<BackendMutation>();
	const query = vi.fn<BackendQuery>().mockResolvedValue({ name: "Work" });
	const stderr = vi.fn();
	const runtime: CliRuntime = {
		backendMutation: mutation,
		backendQuery: query,
		developmentTools: false,
		environment: {},
		getConfig: config,
		prompter,
		randomIdempotencyKey: () => "generated-tag-key",
		stderr: { write: stderr },
		stdout: {
			write: (line) => {
				stdout += line;
			},
		},
	};
	return { mutation, query, runtime, stderr, stdout: () => stdout };
};

const prompt = (confirmed: boolean) => ({
	confirm: vi.fn().mockResolvedValue(confirmed),
	date: vi.fn(),
	multiselect: vi.fn(),
	select: vi.fn(),
	text: vi.fn(),
});

it("previews the normalized tag in JSON without a key or write", async () => {
	const { mutation, runtime, stdout } = createRuntime();
	expect(await runCli([...args, "--dry-run", "--json"], runtime)).toBe(0);
	expect(mutation).not.toHaveBeenCalled();
	expect(JSON.parse(stdout())).toMatchObject({
		data: { name: "Work" },
		meta: { dryRun: true },
	});
});

it("requires a key to save without prompts and returns the new tag ID", async () => {
	const { mutation, query, runtime, stdout } = createRuntime();
	expect(await runCli([...args, "--non-interactive"], runtime)).toBe(2);
	expect(mutation).not.toHaveBeenCalled();

	mutation.mockResolvedValueOnce(tag);
	expect(
		await runCli(
			[...args, "--agent", "--json", "--idempotency-key", "agent-tag-key"],
			runtime
		)
	).toBe(0);
	expect(query).not.toHaveBeenCalled();
	expect(mutation).toHaveBeenCalledExactlyOnceWith(
		"cli/v1/resources:createTag",
		{
			agent: true,
			idempotencyKey: "agent-tag-key",
			name: "  Work  ",
		}
	);
	expect(JSON.parse(stdout())).toMatchObject({
		data: tag,
		meta: { dryRun: false, idempotencyKey: "agent-tag-key" },
	});
});

it("reports a name conflict and directs scripts to the existing list", async () => {
	const { mutation, runtime, stderr, stdout } = createRuntime();
	mutation.mockRejectedValueOnce(
		new ConvexError({
			code: "TAG_NAME_CONFLICT",
			details: {},
			message: "A tag with that name already exists; run spendly tags list",
			retryable: false,
		})
	);
	expect(
		await runCli(
			[...args, "--json", "--idempotency-key", "conflict-tag-key"],
			runtime
		)
	).toBe(5);
	expect(stderr).not.toHaveBeenCalled();
	expect(JSON.parse(stdout())).toMatchObject({
		error: {
			code: "TAG_NAME_CONFLICT",
			message: expect.stringContaining("spendly tags list"),
			retryable: false,
		},
	});
});

it("does not save when terminal confirmation is declined", async () => {
	const prompter = prompt(false);
	const { mutation, runtime, stderr } = createRuntime(prompter);
	expect(await runCli(args, runtime)).toBe(0);
	expect(prompter.confirm).toHaveBeenCalledWith({
		initialValue: false,
		message: "Create this tag?",
	});
	expect(stderr).toHaveBeenCalledWith(expect.stringContaining("Name: Work"));
	expect(mutation).not.toHaveBeenCalled();
});

it.each([
	{
		advice: "--idempotency-key generated-tag-key",
		extra: [],
		key: "generated-tag-key",
	},
	{
		advice: "the original --idempotency-key",
		extra: ["--idempotency-key", "supplied-tag-key"],
		key: "supplied-tag-key",
	},
])(
	"replays an uncertain terminal save without repeating the preview ($key)",
	async ({ advice, extra, key }) => {
		const { mutation, query, runtime, stderr, stdout } = createRuntime(
			prompt(true)
		);
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(await runCli([...args, ...extra], runtime)).toBe(7);
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining(`--non-interactive and ${advice}`)
		);
		expect(mutation).toHaveBeenCalledTimes(1);

		mutation.mockResolvedValueOnce(tag);
		expect(
			await runCli(
				[...args, "--non-interactive", "--idempotency-key", key],
				runtime
			)
		).toBe(0);
		const request = [
			"cli/v1/resources:createTag",
			{ idempotencyKey: key, name: "  Work  " },
		];
		expect(mutation.mock.calls).toEqual([request, request]);
		expect(query).toHaveBeenCalledTimes(1);
		expect(stdout()).toContain("ID: tag-work");
	}
);
