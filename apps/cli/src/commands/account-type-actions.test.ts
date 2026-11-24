import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../cli.js";
import { CLI_EXIT_CODE, CliError } from "../errors.js";
import type { InteractivePrompter } from "../input/types.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const proposal = { balanceNature: "liability", name: "Mortgage" };
const saved = { ...proposal, id: "type-demo" };
const args = [
	"account-types",
	"add",
	"--name",
	proposal.name,
	"--balance-nature",
	proposal.balanceNature,
];
const previewFunction = "cli/v1/accountTypes:previewCreate";
const createFunction = "cli/v1/accountTypes:create";
const generatedKey = "generated-type-key";

const setup = (confirmed?: boolean) => {
	const query = vi.fn<BackendQuery>();
	const mutation = vi.fn<BackendMutation>();
	const confirm = vi.fn().mockResolvedValue(confirmed);
	const prompter: InteractivePrompter | undefined =
		confirmed === undefined
			? undefined
			: {
					confirm,
					date: vi.fn(),
					multiselect: vi.fn(),
					select: vi.fn(),
					text: vi.fn(),
				};
	const stderr = vi.fn<(chunk: string) => void>();
	const stdout = vi.fn<(chunk: string) => void>();
	const runtime: CliRuntime = {
		backendMutation: mutation,
		backendQuery: query,
		developmentTools: false,
		environment: {},
		getConfig: () => ({
			authReady: true,
			clientId: "client-id",
			convexUrl: "https://example.convex.cloud",
			environment: "development",
			issuer: "https://issuer.example",
			webUrl: "http://localhost:3001",
		}),
		now: () => new Date("2026-07-10T00:00:00.000Z"),
		prompter,
		randomIdempotencyKey: () => generatedKey,
		stderr: { write: stderr },
		stdout: { write: stdout },
	};
	return {
		confirm,
		mutation,
		query,
		run: async (...input: string[]) => await runCli(input, runtime),
		stderr,
		stdout,
	};
};

describe("account-types add", () => {
	it("previews the type in JSON without committing or requiring a key", async () => {
		const { mutation, query, run, stdout } = setup();
		query.mockResolvedValueOnce(proposal);
		expect(await run(...args, "--non-interactive", "--dry-run", "--json")).toBe(
			CLI_EXIT_CODE.success
		);
		expect(query).toHaveBeenCalledExactlyOnceWith(previewFunction, proposal);
		expect(mutation).not.toHaveBeenCalled();
		expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
			data: proposal,
			meta: { dryRun: true },
		});
	});

	it("requires an explicit valid nature before any backend call", async () => {
		const { mutation, query, run } = setup();
		expect(await run(...args.slice(0, -2), "--dry-run")).toBe(
			CLI_EXIT_CODE.invalidInput
		);
		expect(await run(...args.slice(0, -1), "debt", "--dry-run")).toBe(
			CLI_EXIT_CODE.invalidInput
		);
		expect(query).not.toHaveBeenCalled();
		expect(mutation).not.toHaveBeenCalled();
	});

	it("requires a key for scripts and returns the saved stable ID", async () => {
		const { mutation, query, run, stdout } = setup();
		expect(await run(...args, "--non-interactive")).toBe(
			CLI_EXIT_CODE.invalidInput
		);
		expect(mutation).not.toHaveBeenCalled();
		mutation.mockResolvedValueOnce(saved);
		const idempotencyKey = "create-mortgage";
		expect(
			await run(
				...args,
				"--agent",
				"--json",
				"--idempotency-key",
				idempotencyKey
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(query).not.toHaveBeenCalled();
		expect(mutation).toHaveBeenCalledExactlyOnceWith(createFunction, {
			...proposal,
			agent: true,
			idempotencyKey,
		});
		expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
			data: saved,
			meta: { dryRun: false, idempotencyKey },
		});
	});

	it("shows the meaning of the selected nature and does not save if declined", async () => {
		const { confirm, mutation, query, run, stderr } = setup(false);
		query.mockResolvedValueOnce(proposal);
		expect(await run(...args)).toBe(CLI_EXIT_CODE.success);
		expect(confirm).toHaveBeenCalledExactlyOnceWith({
			initialValue: false,
			message: "Create this account type?",
		});
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining("Balance nature: Liability (money owed)")
		);
		expect(mutation).not.toHaveBeenCalled();
	});

	it("reports the generated key for manual replay after a lost terminal reply", async () => {
		const { mutation, query, run, stderr, stdout } = setup(true);
		query.mockResolvedValueOnce(proposal);
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(await run(...args)).toBe(CLI_EXIT_CODE.temporary);
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining(
				`--non-interactive and --idempotency-key ${generatedKey}`
			)
		);
		expect(mutation).toHaveBeenCalledTimes(1);
		mutation.mockResolvedValueOnce(saved);
		expect(
			await run(...args, "--non-interactive", "--idempotency-key", generatedKey)
		).toBe(CLI_EXIT_CODE.success);
		const request = [
			createFunction,
			{ ...proposal, idempotencyKey: generatedKey },
		];
		expect(mutation.mock.calls).toEqual([request, request]);
		expect(query).toHaveBeenCalledTimes(1);
		expect(stdout).toHaveBeenCalledWith(
			expect.stringContaining("ID: type-demo")
		);
	});

	it("returns an unknown outcome and a replay instruction to scripts", async () => {
		const { mutation, query, run, stdout } = setup();
		const idempotencyKey = "supplied-type-key";
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(
			await run(...args, "--json", "--idempotency-key", idempotencyKey)
		).toBe(CLI_EXIT_CODE.temporary);
		expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
			error: {
				code: "NETWORK_ERROR",
				details: { idempotencyKey, outcome: "unknown" },
				message: expect.stringContaining(
					"--non-interactive and the original --idempotency-key"
				),
				retryable: true,
			},
		});
		expect(mutation).toHaveBeenCalledTimes(1);
		expect(query).not.toHaveBeenCalled();
	});

	it.each(["ACCOUNT_TYPE_NAME_CONFLICT", "ACCOUNT_TYPE_LIMIT_REACHED"])(
		"surfaces the backend conflict %s without retrying",
		async (code) => {
			const { mutation, query, run, stdout } = setup();
			mutation.mockRejectedValueOnce(
				new ConvexError({
					code,
					details: {},
					message: "Could not create the account type",
					retryable: false,
				})
			);
			expect(
				await run(...args, "--json", "--idempotency-key", "create-mortgage")
			).toBe(CLI_EXIT_CODE.conflict);
			expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
				error: { code, retryable: false },
			});
			expect(mutation).toHaveBeenCalledTimes(1);
			expect(query).not.toHaveBeenCalled();
		}
	);
});

const editArgs = ["account-types", "edit", saved.id, "--color", "#14b8a6"];
const editSnapshot = "a".repeat(64);
const editInput = { accountTypeId: saved.id, color: "#14b8a6" };
const beforeType = { ...saved, color: null, icon: "vault", isArchived: false };
const editPreview = {
	after: { ...beforeType, color: "#14B8A6" },
	before: beforeType,
	editSnapshot,
};
const editedType = {
	...editPreview.after,
	createdAt: "2026-07-10T00:00:00.000Z",
	order: 7,
	updatedAt: "2026-07-10T00:00:01.000Z",
};

describe("account-types edit", () => {
	it("returns a read-only preview with the normalization and snapshot", async () => {
		const { mutation, query, run, stdout } = setup();
		query.mockResolvedValueOnce(editPreview);
		expect(await run(...editArgs, "--json", "--dry-run")).toBe(
			CLI_EXIT_CODE.success
		);
		expect(query).toHaveBeenCalledExactlyOnceWith(
			"cli/v1/accountTypes:previewEdit",
			editInput
		);
		expect(mutation).not.toHaveBeenCalled();
		expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
			data: editPreview,
			meta: { dryRun: true },
		});
	});

	it("requires fields and valid guards before contacting the backend", async () => {
		const { mutation, query, run } = setup();
		expect(await run(...editArgs.slice(0, 3), "--dry-run")).toBe(
			CLI_EXIT_CODE.invalidInput
		);
		expect(
			await run(...editArgs, "--balance-nature", "debt", "--dry-run")
		).toBe(CLI_EXIT_CODE.invalidInput);
		expect(
			await run(...editArgs, "--json", "--idempotency-key", generatedKey)
		).toBe(CLI_EXIT_CODE.invalidInput);
		expect(
			await run(...editArgs, "--json", "--if-edit-snapshot", editSnapshot)
		).toBe(CLI_EXIT_CODE.invalidInput);
		expect(
			await run(...editArgs, "--dry-run", "--if-edit-snapshot", editSnapshot)
		).toBe(CLI_EXIT_CODE.invalidInput);
		expect(
			await run(
				...editArgs,
				"--json",
				"--if-edit-snapshot",
				"not-a-snapshot",
				"--idempotency-key",
				generatedKey
			)
		).toBe(CLI_EXIT_CODE.invalidInput);
		expect(mutation).not.toHaveBeenCalled();
		expect(query).not.toHaveBeenCalled();
	});

	it("escapes unsafe stored text and doesn't save after declining", async () => {
		const { confirm, mutation, query, run, stderr } = setup(false);
		const unsafeName = "Stored\u001b[2J\nBefore\u202e";
		query.mockResolvedValueOnce({
			...editPreview,
			before: { ...beforeType, name: unsafeName },
		});
		expect(await run(...editArgs)).toBe(CLI_EXIT_CODE.success);
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining("Stored\\u{1b}[2J\\u{a}Before\\u{202e}")
		);
		expect(confirm).toHaveBeenCalledExactlyOnceWith({
			initialValue: false,
			message: "Save these account type changes?",
		});
		expect(mutation).not.toHaveBeenCalled();
	});

	it("does not replace a stale supplied snapshot with a fresh interactive preview", async () => {
		const { confirm, mutation, query, run } = setup(true);
		query.mockResolvedValueOnce(editPreview);
		expect(await run(...editArgs, "--if-edit-snapshot", "b".repeat(64))).toBe(
			CLI_EXIT_CODE.conflict
		);
		expect(confirm).not.toHaveBeenCalled();
		expect(mutation).not.toHaveBeenCalled();
	});

	it("returns the original replay guards for unknown scripted outcomes", async () => {
		const { mutation, query, run, stdout } = setup();
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(
			await run(
				...editArgs,
				"--agent",
				"--json",
				"--if-edit-snapshot",
				editSnapshot,
				"--idempotency-key",
				generatedKey
			)
		).toBe(CLI_EXIT_CODE.temporary);
		expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
			error: {
				code: "NETWORK_ERROR",
				details: {
					editSnapshot,
					idempotencyKey: generatedKey,
					outcome: "unknown",
				},
				message: expect.stringContaining(
					"the original --if-edit-snapshot and the original --idempotency-key"
				),
				retryable: true,
			},
		});
		expect(query).not.toHaveBeenCalled();
		expect(mutation).toHaveBeenCalledTimes(1);
	});

	it("uses the original schema and guards when replaying a lost interactive reply", async () => {
		const { mutation, query, run, stderr, stdout } = setup(true);
		query.mockResolvedValueOnce(editPreview);
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(await run(...editArgs)).toBe(CLI_EXIT_CODE.temporary);
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining(
				`--if-edit-snapshot ${editSnapshot} and --idempotency-key ${generatedKey}`
			)
		);
		mutation.mockResolvedValueOnce(editedType);
		expect(
			await run(
				...editArgs,
				"--non-interactive",
				"--if-edit-snapshot",
				editSnapshot,
				"--idempotency-key",
				generatedKey,
				"--json"
			)
		).toBe(CLI_EXIT_CODE.success);
		const call = [
			"cli/v1/accountTypes:edit",
			{
				...editInput,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: generatedKey,
			},
		];
		expect(mutation.mock.calls).toEqual([call, call]);
		expect(query).toHaveBeenCalledTimes(1);
		expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
			data: editedType,
		});
	});

	it.each([
		{ code: "ACCOUNT_TYPE_EDIT_CONFLICT", exit: CLI_EXIT_CODE.conflict },
		{
			code: "ACCOUNT_TYPE_BALANCE_NATURE_IN_USE",
			exit: CLI_EXIT_CODE.conflict,
		},
		{ code: "INVALID_ACCOUNT_TYPE_ICON", exit: CLI_EXIT_CODE.invalidInput },
		{ code: "INVALID_ACCOUNT_TYPE_COLOR", exit: CLI_EXIT_CODE.invalidInput },
	])("surfaces $code without retrying", async ({ code, exit }) => {
		const { mutation, query, run, stdout } = setup();
		mutation.mockRejectedValueOnce(
			new ConvexError({
				code,
				details: {},
				message: "Account type edit rejected",
				retryable: false,
			})
		);
		expect(
			await run(
				...editArgs,
				"--agent",
				"--json",
				"--if-edit-snapshot",
				editSnapshot,
				"--idempotency-key",
				generatedKey
			)
		).toBe(exit);
		expect(mutation).toHaveBeenCalledExactlyOnceWith(
			"cli/v1/accountTypes:edit",
			{
				...editInput,
				agent: true,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: generatedKey,
			}
		);
		expect(query).not.toHaveBeenCalled();
		expect(JSON.parse(stdout.mock.lastCall?.[0] ?? "")).toMatchObject({
			error: { code, retryable: false },
		});
	});
});
