import { expect, it, vi } from "vitest";
import { runCli } from "../cli.js";
import { CliError } from "../errors.js";
import type { InteractivePrompter } from "../input/types.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const proposal = {
	categoryType: null,
	cycleId: "cycle-demo",
	cycleName: "July",
	icon: null,
	name: "Bike repairs",
	plannedAmount: 0,
};

const category = {
	categoryType: null,
	createdAt: "2026-07-10T00:00:00.000Z",
	cycleId: proposal.cycleId,
	icon: null,
	id: "category-demo",
	isHidden: false,
	name: proposal.name,
	order: 0,
	plannedAmount: 0,
};

const createRuntime = (prompter?: InteractivePrompter) => {
	let stdout = "";
	const query = vi.fn<BackendQuery>();
	const mutation = vi.fn<BackendMutation>();
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
		randomIdempotencyKey: () => "generated-category-key",
		stderr: { write: vi.fn() },
		stdout: {
			write: (value) => {
				stdout += value;
			},
		},
	};
	return { mutation, query, runtime, stdout: () => stdout };
};

const args = [
	"categories",
	"add",
	"--cycle-id",
	proposal.cycleId,
	"--name",
	proposal.name,
];

it("previews a zero-plan category in JSON without invoking a mutation", async () => {
	const { runtime, query, mutation, stdout } = createRuntime();
	query.mockResolvedValueOnce(proposal);
	expect(
		await runCli(
			[...args, "--planned-amount", "0.00", "--dry-run", "--json"],
			runtime
		)
	).toBe(0);
	expect(query).toHaveBeenCalledWith("cli/v1/resources:previewCategoryCreate", {
		cycleId: proposal.cycleId,
		name: proposal.name,
		plannedAmount: 0,
	});
	expect(mutation).not.toHaveBeenCalled();
	expect(JSON.parse(stdout())).toMatchObject({
		data: proposal,
		meta: { dryRun: true },
		schemaVersion: 1,
	});
});

it("commits once in agent mode with optional fields, returning the saved ID", async () => {
	const { runtime, query, mutation, stdout } = createRuntime();
	const saved = {
		...category,
		categoryType: { color: null, id: "type-demo", name: "Repairs" },
		icon: "🔧",
		plannedAmount: 75.5,
	};
	mutation.mockResolvedValueOnce(saved);
	expect(
		await runCli(
			[
				...args,
				"--planned-amount",
				"75.50",
				"--category-type-id",
				"type-demo",
				"--icon",
				"🔧",
				"--agent",
				"--idempotency-key",
				"category-key-001",
				"--non-interactive",
				"--json",
			],
			runtime
		)
	).toBe(0);
	expect(query).not.toHaveBeenCalled();
	expect(mutation).toHaveBeenCalledExactlyOnceWith(
		"cli/v1/resources:createCategory",
		{
			agent: true,
			categoryTypeId: "type-demo",
			cycleId: proposal.cycleId,
			icon: "🔧",
			idempotencyKey: "category-key-001",
			name: proposal.name,
			plannedAmount: 75.5,
		}
	);
	expect(JSON.parse(stdout())).toMatchObject({
		data: saved,
		schemaVersion: 1,
	});
});

it("reports a lost reply as unknown and tells the caller to reuse the original key", async () => {
	const { runtime, mutation, stdout } = createRuntime();
	mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
	expect(
		await runCli(
			[...args, "--idempotency-key", "category-key-001", "--json"],
			runtime
		)
	).not.toBe(0);
	expect(mutation).toHaveBeenCalledTimes(1);
	expect(JSON.parse(stdout())).toMatchObject({
		error: {
			code: "NETWORK_ERROR",
			details: { idempotencyKey: "category-key-001", outcome: "unknown" },
			message: expect.stringContaining(
				"repeat the same command with the same idempotency key"
			),
		},
		schemaVersion: 1,
	});
});

it("shows the generated key after an uncertain terminal save so the user can replay it", async () => {
	const { runtime, query, mutation } = createRuntime({
		confirm: vi.fn().mockResolvedValue(true),
		date: vi.fn(),
		multiselect: vi.fn(),
		select: vi.fn(),
		text: vi.fn(),
	});
	query.mockResolvedValueOnce({ ...proposal, plannedAmount: null });
	mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
	expect(await runCli(args, runtime)).toBe(7);
	expect(mutation).toHaveBeenCalledTimes(1);
	expect(runtime.stderr.write).toHaveBeenCalledWith(
		expect.stringContaining(
			"--non-interactive --idempotency-key generated-category-key"
		)
	);

	const [save] = mutation.mock.calls;
	mutation.mockResolvedValueOnce({ ...category, plannedAmount: null });
	expect(
		await runCli(
			[
				...args,
				"--non-interactive",
				"--idempotency-key",
				"generated-category-key",
			],
			runtime
		)
	).toBe(0);
	expect(mutation.mock.calls).toEqual([save, save]);
	expect(query).toHaveBeenCalledTimes(1);
});

it("does not save when the terminal user declines the preview", async () => {
	const confirm = vi.fn().mockResolvedValue(false);
	const { runtime, query, mutation } = createRuntime({
		confirm,
		date: vi.fn(),
		multiselect: vi.fn(),
		select: vi.fn(),
		text: vi.fn(),
	});
	query.mockResolvedValueOnce({ ...proposal, plannedAmount: null });
	expect(await runCli(args, runtime)).toBe(0);
	expect(runtime.stderr.write).toHaveBeenCalledWith(
		expect.stringContaining("Cycle: July (cycle-demo)")
	);
	expect(confirm).toHaveBeenCalledWith({
		initialValue: false,
		message: "Create this category?",
	});
	expect(mutation).not.toHaveBeenCalled();
});

it.each([
	{ code: "NON_INTERACTIVE_INPUT_REQUIRED", extra: [] },
	{ code: "INVALID_INPUT", extra: ["--planned-amount", "-1", "--dry-run"] },
	{ code: "INVALID_INPUT", extra: ["--planned-amount", "1.001", "--dry-run"] },
	{
		code: "INVALID_INPUT",
		extra: ["--planned-amount", "90071992547409.91", "--dry-run"],
	},
])("rejects $code before contacting the backend", async ({ extra, code }) => {
	const { runtime, query, mutation, stdout } = createRuntime();
	expect(await runCli([...args, ...extra, "--json"], runtime)).not.toBe(0);
	expect(query).not.toHaveBeenCalled();
	expect(mutation).not.toHaveBeenCalled();
	expect(JSON.parse(stdout())).toMatchObject({
		error: { code },
		schemaVersion: 1,
	});
});
