import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
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

const renameArgs = ["tags", "rename", "tag-work", "--name", "  Work travel  "];
const previewInput = { name: "  Work travel  ", tagId: "tag-work" };
const editSnapshot = "a".repeat(64);
const renamePreview = {
	beforeName: "  Work\u001b[31m\n\u202e  ",
	editSnapshot,
	id: "tag-work",
	name: "Work travel",
};
const renamed = { id: "tag-work", name: "Work travel" };
const commitFlags = [
	"--non-interactive",
	"--if-edit-snapshot",
	editSnapshot,
	"--idempotency-key",
	"rename-tag-key",
];

describe("tags rename", () => {
	it("shows a read-only JSON preview with exact legacy data and a reviewed snapshot", async () => {
		const { mutation, query, runtime, stdout } = createRuntime();
		query.mockResolvedValueOnce(renamePreview);
		expect(await runCli([...renameArgs, "--dry-run", "--json"], runtime)).toBe(
			0
		);
		expect(query).toHaveBeenCalledExactlyOnceWith(
			"cli/v1/resources:previewTagRename",
			previewInput
		);
		expect(mutation).not.toHaveBeenCalled();
		expect(JSON.parse(stdout())).toMatchObject({
			data: renamePreview,
			meta: { dryRun: true },
		});
	});

	it("escapes legacy names both in the confirmation preview and in the human tag list", async () => {
		const prompter = prompt(false);
		const { mutation, query, runtime, stderr, stdout } =
			createRuntime(prompter);
		query.mockResolvedValueOnce(renamePreview);
		expect(await runCli(renameArgs, runtime)).toBe(0);
		expect(prompter.confirm).toHaveBeenCalledWith({
			initialValue: false,
			message: "Rename this tag?",
		});
		const preview = stderr.mock.calls.flat().join("");
		expect(preview).toContain('Before: "  Work\\u001b[31m\\n\\u{202e}  "');
		expect(preview).toContain('After: "Work travel"');
		expect(preview).not.toContain(renamePreview.beforeName);
		expect(mutation).not.toHaveBeenCalled();

		query.mockResolvedValueOnce([
			{
				createdAt: "2026-01-01T00:00:00.000Z",
				id: renamed.id,
				name: renamePreview.beforeName,
			},
		]);
		expect(await runCli(["tags", "list"], runtime)).toBe(0);
		expect(stdout()).toContain("Work\\u{1b}[31m\\u{a}\\u{202e}");
		expect(stdout()).toContain(renamed.id);
	});

	it.each([
		{
			args: renameArgs.slice(0, 2).concat(renameArgs.slice(3)),
			flags: ["--dry-run"],
		},
		{ args: renameArgs, flags: ["--json"] },
		{ args: renameArgs, flags: ["--if-edit-snapshot", editSnapshot, "--json"] },
		{ args: renameArgs, flags: ["--if-edit-snapshot", "invalid"] },
		{
			args: renameArgs,
			flags: ["--if-edit-snapshot", editSnapshot, "--dry-run"],
		},
	])(
		"rejects bad or incomplete inputs before contacting the backend ($flags)",
		async ({ args: commandArgs, flags }) => {
			const { mutation, query, runtime } = createRuntime();
			expect(await runCli([...commandArgs, ...flags], runtime)).toBe(2);
			expect(query).not.toHaveBeenCalled();
			expect(mutation).not.toHaveBeenCalled();
		}
	);

	it("commits the supplied snapshot without fetching a new preview for scripts or agents", async () => {
		const { mutation, query, runtime, stdout } = createRuntime();
		mutation.mockResolvedValueOnce(renamed);
		expect(
			await runCli(
				[...renameArgs, ...commitFlags, "--json", "--agent"],
				runtime
			)
		).toBe(0);
		expect(query).not.toHaveBeenCalled();
		expect(mutation).toHaveBeenCalledExactlyOnceWith(
			"cli/v1/resources:renameTag",
			{
				...previewInput,
				agent: true,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: "rename-tag-key",
			}
		);
		expect(JSON.parse(stdout())).toMatchObject({
			data: renamed,
			meta: { dryRun: false, idempotencyKey: "rename-tag-key" },
		});
	});

	it("does not silently replace a stale snapshot supplied in a terminal", async () => {
		const prompter = prompt(true);
		const { mutation, query, runtime } = createRuntime(prompter);
		query.mockResolvedValueOnce(renamePreview);
		expect(
			await runCli(
				[...renameArgs, "--if-edit-snapshot", "b".repeat(64)],
				runtime
			)
		).toBe(5);
		expect(prompter.confirm).not.toHaveBeenCalled();
		expect(mutation).not.toHaveBeenCalled();
	});

	it("returns the original replay values for an uncertain terminal save without automatically retrying", async () => {
		const { mutation, query, runtime, stderr } = createRuntime(prompt(true));
		query.mockResolvedValueOnce(renamePreview);
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(await runCli(renameArgs, runtime)).toBe(7);
		expect(stderr.mock.calls.flat().join("")).toContain(
			`--if-edit-snapshot ${editSnapshot} and --idempotency-key generated-tag-key`
		);
		expect(mutation).toHaveBeenCalledTimes(1);
		mutation.mockResolvedValueOnce(renamed);
		expect(
			await runCli(
				[...renameArgs, ...commitFlags.slice(0, -1), "generated-tag-key"],
				runtime
			)
		).toBe(0);
		expect(mutation.mock.calls[1]).toEqual(mutation.mock.calls[0]);
		expect(query).toHaveBeenCalledTimes(1);
	});

	it("reports an uncertain scripted result in JSON without echoing tag names", async () => {
		const { mutation, runtime, stdout } = createRuntime();
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(
			await runCli([...renameArgs, ...commitFlags, "--json"], runtime)
		).toBe(7);
		expect(JSON.parse(stdout())).toMatchObject({
			error: {
				code: "NETWORK_ERROR",
				details: {
					editSnapshot,
					idempotencyKey: "rename-tag-key",
					outcome: "unknown",
				},
				message: expect.stringContaining("Check spendly tags list first"),
			},
		});
		expect(stdout()).not.toContain("Work travel");
		expect(mutation).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ code: "TAG_RENAME_CONFLICT", exit: 5 },
		{ code: "TAG_NAME_CONFLICT", exit: 5 },
		{ code: "TAG_RENAME_NO_CHANGE", exit: 2 },
		{ code: "RESOURCE_NOT_FOUND", exit: 4 },
	])("surfaces $code without retrying", async ({ code, exit }) => {
		const { mutation, runtime, stdout } = createRuntime();
		mutation.mockRejectedValueOnce(
			new ConvexError({
				code,
				details: {},
				message: "Rename failed",
				retryable: false,
			})
		);
		expect(
			await runCli([...renameArgs, ...commitFlags, "--json"], runtime)
		).toBe(exit);
		expect(JSON.parse(stdout())).toMatchObject({
			error: { code, retryable: false },
		});
		expect(mutation).toHaveBeenCalledTimes(1);
	});
});
