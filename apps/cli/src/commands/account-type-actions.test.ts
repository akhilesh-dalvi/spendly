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
