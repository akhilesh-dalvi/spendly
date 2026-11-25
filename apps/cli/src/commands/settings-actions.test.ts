import { ConvexError } from "convex/values";
import { expect, it, vi } from "vitest";
import { runCli } from "../cli.js";
import { CliError } from "../errors.js";
import type { InteractivePrompter } from "../input/types.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const args = ["settings", "set-currency", "EUR"];
const editSnapshot = "a".repeat(64);
const idempotencyKey = "currency-save-key";
const preview = {
	beforeCurrency: "USD",
	beforeStatus: "set",
	changed: true,
	currency: "EUR",
	editSnapshot,
};
const receipt = { changed: true, currency: "EUR" };

const setup = (prompter?: InteractivePrompter) => {
	const mutation = vi.fn<BackendMutation>().mockResolvedValue(receipt);
	const query = vi.fn<BackendQuery>().mockResolvedValue(preview);
	const stdout = vi.fn();
	const stderr = vi.fn();
	const runtime: CliRuntime = {
		backendMutation: mutation,
		backendQuery: query,
		developmentTools: false,
		environment: {},
		getConfig: () => ({
			authReady: true,
			clientId: "test-client",
			convexUrl: "https://example.convex.cloud",
			environment: "development",
			issuer: "https://issuer.example",
			webUrl: "http://localhost:3001",
		}),
		prompter,
		randomIdempotencyKey: () => idempotencyKey,
		stderr: { write: stderr },
		stdout: { write: stdout },
	};
	return {
		mutation,
		query,
		run: (flags: string[]) => runCli(flags, runtime),
		stderr,
		stdout,
	};
};

const prompt = (confirmed: boolean) => ({
	confirm: vi.fn().mockResolvedValue(confirmed),
	date: vi.fn(),
	multiselect: vi.fn(),
	select: vi.fn(),
	text: vi.fn(),
});

it("previews a normalized supported currency without writing", async () => {
	const { mutation, query, run, stdout } = setup();
	expect(await run([...args.slice(0, 2), " eur ", "--dry-run", "--json"])).toBe(
		0
	);
	expect(query).toHaveBeenCalledExactlyOnceWith(
		"cli/v1/settings:previewCurrency",
		{ currency: "EUR" }
	);
	expect(mutation).not.toHaveBeenCalled();
	expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
		data: {
			...preview,
			warnings: [expect.stringContaining("Amounts will not be converted")],
		},
		meta: { dryRun: true },
	});
});

it.each([
	[...args.slice(0, 2), "ZZZ", "--dry-run"],
	[...args, "--non-interactive", "--idempotency-key", idempotencyKey],
	[...args, "--non-interactive", "--if-edit-snapshot", editSnapshot],
	[...args, "--dry-run", "--if-edit-snapshot", editSnapshot],
])(
	"rejects an invalid or incomplete request before the backend: %j",
	async (...flags) => {
		const { mutation, query, run } = setup();
		expect(await run(flags)).toBe(2);
		expect(query).not.toHaveBeenCalled();
		expect(mutation).not.toHaveBeenCalled();
	}
);

it("uses a script's reviewed snapshot and key without taking a fresh preview", async () => {
	const { mutation, query, run, stdout } = setup();
	expect(
		await run([
			...args,
			"--agent",
			"--json",
			"--if-edit-snapshot",
			editSnapshot,
			"--idempotency-key",
			idempotencyKey,
		])
	).toBe(0);
	expect(query).not.toHaveBeenCalled();
	expect(mutation).toHaveBeenCalledExactlyOnceWith(
		"cli/v1/settings:setCurrency",
		{
			agent: true,
			currency: "EUR",
			expectedEditSnapshot: editSnapshot,
			idempotencyKey,
		}
	);
	expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
		data: receipt,
	});
});

it("warns before interactive confirmation and does not write when declined", async () => {
	const prompter = prompt(false);
	const { mutation, run, stderr } = setup(prompter);
	expect(await run(args)).toBe(0);
	expect(prompter.confirm).toHaveBeenCalledOnce();
	expect(stderr).toHaveBeenCalledWith(
		expect.stringContaining("Amounts will not be converted")
	);
	expect(mutation).not.toHaveBeenCalled();
});

it("reports an already-set preference without a confirmation prompt", async () => {
	const prompter = prompt(false);
	const { mutation, query, run, stdout } = setup(prompter);
	query.mockResolvedValueOnce({
		...preview,
		beforeCurrency: "EUR",
		changed: false,
	});
	mutation.mockResolvedValueOnce({ ...receipt, changed: false });
	expect(await run(args)).toBe(0);
	expect(prompter.confirm).not.toHaveBeenCalled();
	expect(stdout).toHaveBeenCalledWith(
		expect.stringContaining("already set to EUR")
	);
});

it("reports a conflict without retry and gives a fresh-preview recovery path", async () => {
	const { mutation, run, stderr } = setup(prompt(true));
	mutation.mockRejectedValueOnce(
		new ConvexError({
			code: "PREFERRED_CURRENCY_CONFLICT",
			details: {},
			message: "Currency changed",
			retryable: false,
		})
	);
	expect(await run(args)).toBe(5);
	expect(mutation).toHaveBeenCalledOnce();
	expect(stderr).toHaveBeenCalledWith(
		expect.stringContaining("Review a fresh preview")
	);
});

it("reports the reviewed save reference after a lost response without retrying", async () => {
	const { mutation, run, stderr } = setup(prompt(true));
	mutation.mockRejectedValueOnce(
		new CliError("NETWORK_ERROR", "Connection lost")
	);
	expect(await run(args)).toBe(7);
	expect(mutation).toHaveBeenCalledOnce();
	expect(stderr).toHaveBeenCalledWith(
		expect.stringContaining(
			`--if-edit-snapshot ${editSnapshot} and --idempotency-key ${idempotencyKey}`
		)
	);
	expect(stderr).toHaveBeenCalledWith(
		expect.stringContaining("spendly auth status")
	);
});
