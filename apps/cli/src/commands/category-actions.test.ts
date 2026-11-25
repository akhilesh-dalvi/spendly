import { describe, expect, it, vi } from "vitest";
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
	preferredCurrency: "EUR",
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

const approvedPrompter = () => ({
	confirm: vi.fn<InteractivePrompter["confirm"]>().mockResolvedValue(true),
	date: vi.fn(),
	multiselect: vi.fn(),
	select: vi.fn(),
	text: vi.fn(),
});

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
			message: expect.stringContaining("Check the cycle's category list first"),
		},
		schemaVersion: 1,
	});
});

it("shows the generated key after an uncertain terminal save so the user can replay it", async () => {
	const { runtime, query, mutation } = createRuntime(approvedPrompter());
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
	expect(save[1]).not.toHaveProperty("expectedPreferredCurrency");
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

it.each([undefined, "supplied-category-key"])(
	"reviews a numeric budget in its currency and preserves the guard when replaying with key %s",
	async (providedKey) => {
		const { runtime, query, mutation } = createRuntime(approvedPrompter());
		const planArgs = [...args, "--planned-amount", "0"];
		const key = providedKey ?? "generated-category-key";
		query.mockResolvedValueOnce(proposal);
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(
			await runCli(
				[
					...planArgs,
					...(providedKey ? ["--idempotency-key", providedKey] : []),
				],
				runtime
			)
		).toBe(7);
		expect(runtime.stderr.write).toHaveBeenCalledWith(
			expect.stringContaining("Planned amount: 0 EUR")
		);
		expect(runtime.stderr.write).toHaveBeenCalledWith(
			expect.stringContaining("--if-preferred-currency EUR")
		);
		mutation.mockResolvedValueOnce(category);
		expect(
			await runCli(
				[
					...planArgs,
					"--non-interactive",
					"--idempotency-key",
					key,
					"--if-preferred-currency",
					"EUR",
				],
				runtime
			)
		).toBe(0);
		const save = [
			"cli/v1/resources:createCategory",
			{
				cycleId: proposal.cycleId,
				expectedPreferredCurrency: "EUR",
				idempotencyKey: key,
				name: proposal.name,
				plannedAmount: 0,
			},
		];
		expect(mutation.mock.calls).toEqual([save, save]);
		expect(query).toHaveBeenCalledTimes(1);
	}
);

it("returns a failed currency guard from a separately reviewed save without retrying", async () => {
	const { runtime, query, mutation, stdout } = createRuntime();
	mutation.mockRejectedValueOnce(
		new CliError("PREFERRED_CURRENCY_CONFLICT", "Review a fresh preview")
	);
	expect(
		await runCli(
			[
				...args,
				"--planned-amount",
				"0",
				"--if-preferred-currency",
				" eur ",
				"--idempotency-key",
				"category-key-001",
				"--json",
			],
			runtime
		)
	).toBe(5);
	expect(query).not.toHaveBeenCalled();
	expect(mutation).toHaveBeenCalledExactlyOnceWith(
		"cli/v1/resources:createCategory",
		{
			cycleId: proposal.cycleId,
			expectedPreferredCurrency: "EUR",
			idempotencyKey: "category-key-001",
			name: proposal.name,
			plannedAmount: 0,
		}
	);
	expect(JSON.parse(stdout())).toMatchObject({
		error: { code: "PREFERRED_CURRENCY_CONFLICT", retryable: false },
	});
});

it("does not ask to save if the guided preview differs from an explicit expected currency", async () => {
	const prompter = approvedPrompter();
	const { runtime, query, mutation } = createRuntime(prompter);
	query.mockResolvedValueOnce(proposal);
	expect(
		await runCli(
			[...args, "--planned-amount", "0", "--if-preferred-currency", "USD"],
			runtime
		)
	).toBe(5);
	expect(prompter.confirm).not.toHaveBeenCalled();
	expect(mutation).not.toHaveBeenCalled();
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

describe("category-types add", () => {
	const typeArgs = ["category-types", "add", "--name", "Travel"];
	const typePreview = { color: "#3b82f6", name: "Travel" };
	const saved = { ...typePreview, id: "type-demo" };
	const createFunction = "cli/v1/resources:createCategoryType";
	const makePrompter = (confirmed: boolean): InteractivePrompter => ({
		confirm: vi.fn().mockResolvedValue(confirmed),
		date: vi.fn(),
		multiselect: vi.fn(),
		select: vi.fn(),
		text: vi.fn(),
	});

	it("previews without mutating or requiring a key or cycle", async () => {
		const { runtime, query, mutation, stdout } = createRuntime();
		query.mockResolvedValueOnce(typePreview);
		expect(await runCli([...typeArgs, "--dry-run", "--json"], runtime)).toBe(0);
		expect(query).toHaveBeenCalledExactlyOnceWith(
			"cli/v1/resources:previewCategoryTypeCreate",
			{ name: "Travel" }
		);
		expect(mutation).not.toHaveBeenCalled();
		expect(JSON.parse(stdout())).toMatchObject({
			data: typePreview,
			meta: { dryRun: true },
		});
	});

	it("requires a key for scripts and returns the saved ID with custom color", async () => {
		const { runtime, query, mutation, stdout } = createRuntime();
		expect(await runCli([...typeArgs, "--non-interactive"], runtime)).toBe(2);
		expect(mutation).not.toHaveBeenCalled();
		const custom = { ...saved, color: "#14B8A6" };
		mutation.mockResolvedValueOnce(custom);
		expect(
			await runCli(
				[
					...typeArgs,
					"--color",
					custom.color,
					"--agent",
					"--json",
					"--idempotency-key",
					"create-travel",
				],
				runtime
			)
		).toBe(0);
		expect(query).not.toHaveBeenCalled();
		expect(mutation).toHaveBeenCalledExactlyOnceWith(createFunction, {
			agent: true,
			color: custom.color,
			idempotencyKey: "create-travel",
			name: "Travel",
		});
		expect(JSON.parse(stdout())).toMatchObject({
			data: custom,
			meta: { dryRun: false, idempotencyKey: "create-travel" },
		});
	});

	it("does not save when terminal confirmation is declined", async () => {
		const prompter = makePrompter(false);
		const { runtime, query, mutation } = createRuntime(prompter);
		query.mockResolvedValueOnce(typePreview);
		expect(await runCli(typeArgs, runtime)).toBe(0);
		expect(prompter.confirm).toHaveBeenCalledExactlyOnceWith({
			initialValue: false,
			message: "Create this category type?",
		});
		expect(runtime.stderr.write).toHaveBeenCalledWith(
			expect.stringContaining("Color: #3b82f6")
		);
		expect(mutation).not.toHaveBeenCalled();
	});

	it.each([
		{
			advice: "--idempotency-key generated-category-key",
			extraArgs: [],
			key: "generated-category-key",
		},
		{
			advice: "the original --idempotency-key",
			extraArgs: ["--idempotency-key", "supplied-key"],
			key: "supplied-key",
		},
	])(
		"directs terminal users to replay without preview after a lost reply: $key",
		async ({ extraArgs, key, advice }) => {
			const { runtime, query, mutation, stdout } = createRuntime(
				makePrompter(true)
			);
			query.mockResolvedValueOnce(typePreview);
			mutation.mockRejectedValueOnce(
				new CliError("NETWORK_ERROR", "lost reply")
			);
			expect(await runCli([...typeArgs, ...extraArgs], runtime)).toBe(7);
			expect(runtime.stderr.write).toHaveBeenCalledWith(
				expect.stringContaining(`--non-interactive and ${advice}`)
			);
			mutation.mockResolvedValueOnce(saved);
			expect(
				await runCli(
					[...typeArgs, "--non-interactive", "--idempotency-key", key],
					runtime
				)
			).toBe(0);
			const request = [createFunction, { idempotencyKey: key, name: "Travel" }];
			expect(mutation.mock.calls).toEqual([request, request]);
			expect(query).toHaveBeenCalledTimes(1);
			expect(stdout()).toContain("ID: type-demo");
		}
	);
});

describe("categories edit", () => {
	const editArgs = ["categories", "edit", category.id];
	const editSnapshot = "a".repeat(64);
	const editPreview = {
		after: { ...category, name: "Repairs" },
		before: {
			...category,
			categoryType: { color: null, id: "type-demo", name: "Needs" },
			plannedAmount: 75,
		},
		cycleName: proposal.cycleName,
		editSnapshot,
		preferredCurrency: "EUR",
	};
	const editFlags = [
		"--name",
		"Repairs",
		"--clear-category-type",
		"--planned-amount",
		"0",
	];
	const dryRunInput = {
		categoryId: category.id,
		categoryTypeId: null,
		name: "Repairs",
		plannedAmount: 0,
	};
	const commitFlags = [
		"--non-interactive",
		"--if-edit-snapshot",
		editSnapshot,
		"--idempotency-key",
		"category-edit-001",
	];
	it("previews from the stable ID and sends only the requested patch", async () => {
		const { runtime, query, mutation, stdout } = createRuntime();
		query.mockResolvedValueOnce(editPreview);
		expect(
			await runCli([...editArgs, ...editFlags, "--dry-run", "--json"], runtime)
		).toBe(0);
		expect(query).toHaveBeenCalledExactlyOnceWith(
			"cli/v1/resources:previewCategoryEdit",
			dryRunInput
		);
		expect(mutation).not.toHaveBeenCalled();
		expect(JSON.parse(stdout())).toMatchObject({
			data: editPreview,
			meta: { dryRun: true },
			schemaVersion: 1,
		});
	});

	it("labels an invalid stored plan separately from a cleared plan", async () => {
		const { runtime, query, mutation, stdout } = createRuntime();
		query.mockResolvedValueOnce({
			...editPreview,
			after: { ...editPreview.after, plannedAmount: null },
			before: { ...editPreview.before, plannedAmount: "Infinity" },
		});
		expect(
			await runCli(
				[...editArgs, "--clear-planned-amount", "--dry-run"],
				runtime
			)
		).toBe(0);
		expect(stdout()).toContain("Planned amount: Invalid (Infinity)");
		expect(stdout()).toContain("Planned amount: None");
		expect(mutation).not.toHaveBeenCalled();
	});

	it("commits or replays the exact guarded patch in agent mode without re-previewing", async () => {
		const { runtime, query, mutation, stdout } = createRuntime();
		mutation.mockResolvedValueOnce({
			...editPreview.after,
			plannedAmount: null,
		});
		expect(
			await runCli(
				[
					...editArgs,
					...commitFlags,
					"--clear-planned-amount",
					"--agent",
					"--json",
				],
				runtime
			)
		).toBe(0);
		expect(query).not.toHaveBeenCalled();
		expect(mutation).toHaveBeenCalledExactlyOnceWith(
			"cli/v1/resources:editCategory",
			{
				agent: true,
				categoryId: category.id,
				expectedEditSnapshot: editSnapshot,
				idempotencyKey: "category-edit-001",
				plannedAmount: null,
			}
		);
		expect(JSON.parse(stdout())).toMatchObject({
			data: { id: category.id, plannedAmount: null },
			meta: { dryRun: false },
		});
	});

	it.each([false, true])(
		"commits only after terminal confirmation (%s)",
		async (confirmed) => {
			const prompter = approvedPrompter();
			prompter.confirm.mockResolvedValueOnce(confirmed);
			const { runtime, query, mutation } = createRuntime(prompter);
			query.mockResolvedValueOnce({
				...editPreview,
				before: { ...editPreview.before, name: "Old\u001b[2J name" },
			});
			mutation.mockResolvedValueOnce(editPreview.after);
			expect(await runCli([...editArgs, ...editFlags], runtime)).toBe(0);
			expect(runtime.stderr.write).toHaveBeenCalledWith(
				expect.stringContaining("Name: Old [2J name")
			);
			expect(runtime.stderr.write).toHaveBeenCalledWith(
				expect.stringContaining("Type: None")
			);
			expect(runtime.stderr.write).toHaveBeenCalledWith(
				expect.stringContaining("Planned amount: 0 EUR")
			);
			expect(runtime.stderr.write).toHaveBeenCalledWith(
				expect.stringContaining("Planned amount: 75 EUR")
			);
			expect(prompter.confirm).toHaveBeenCalledWith({
				initialValue: false,
				message: "Save these category changes?",
			});
			if (confirmed) {
				expect(mutation).toHaveBeenCalledExactlyOnceWith(
					"cli/v1/resources:editCategory",
					{
						...dryRunInput,
						expectedEditSnapshot: editSnapshot,
						idempotencyKey: "generated-category-key",
					}
				);
			} else {
				expect(mutation).not.toHaveBeenCalled();
			}
		}
	);

	it("reports the original terminal snapshot and key after an uncertain save", async () => {
		const { runtime, query, mutation } = createRuntime(approvedPrompter());
		query.mockResolvedValueOnce(editPreview);
		mutation.mockRejectedValueOnce(new CliError("NETWORK_ERROR", "lost reply"));
		expect(await runCli([...editArgs, ...editFlags], runtime)).toBe(7);
		expect(runtime.stderr.write).toHaveBeenCalledWith(
			expect.stringContaining(
				`--non-interactive --if-edit-snapshot ${editSnapshot} --idempotency-key generated-category-key`
			)
		);
		const [save] = mutation.mock.calls;
		mutation.mockResolvedValueOnce(editPreview.after);
		expect(
			await runCli(
				[
					...editArgs,
					...editFlags,
					"--non-interactive",
					"--if-edit-snapshot",
					editSnapshot,
					"--idempotency-key",
					"generated-category-key",
				],
				runtime
			)
		).toBe(0);
		expect(mutation.mock.calls).toEqual([save, save]);
		expect(query).toHaveBeenCalledTimes(1);
	});

	it("returns the stale-preview conflict without retrying or reading a fresh preview", async () => {
		const { runtime, query, mutation, stdout } = createRuntime();
		mutation.mockRejectedValueOnce(
			new CliError("CATEGORY_EDIT_CONFLICT", "Review a fresh preview")
		);
		expect(
			await runCli(
				[...editArgs, ...editFlags, ...commitFlags, "--json"],
				runtime
			)
		).toBe(5);
		expect(mutation).toHaveBeenCalledTimes(1);
		expect(query).not.toHaveBeenCalled();
		expect(JSON.parse(stdout())).toMatchObject({
			error: { code: "CATEGORY_EDIT_CONFLICT", retryable: false },
		});
	});

	it.each([
		{ code: "INVALID_INPUT", flags: ["--dry-run"] },
		{
			code: "INVALID_COMMAND",
			flags: [
				"--clear-category-type",
				"--category-type-id",
				"type-demo",
				"--dry-run",
			],
		},
		{
			code: "INVALID_COMMAND",
			flags: ["--clear-planned-amount", "--planned-amount", "0", "--dry-run"],
		},
		{
			code: "INVALID_INPUT",
			flags: ["--planned-amount", "0.001", "--dry-run"],
		},
		{
			code: "INVALID_INPUT",
			flags: ["--name", "Repairs", "--if-edit-snapshot", "invalid"],
		},
		{
			code: "INVALID_INPUT",
			flags: [
				"--name",
				"Repairs",
				"--if-edit-snapshot",
				editSnapshot,
				"--dry-run",
			],
		},
		{
			code: "NON_INTERACTIVE_INPUT_REQUIRED",
			flags: ["--name", "Repairs", "--idempotency-key", "category-edit-001"],
		},
		{
			code: "NON_INTERACTIVE_INPUT_REQUIRED",
			flags: ["--name", "Repairs", "--if-edit-snapshot", editSnapshot],
		},
	])("fails locally with $code for $flags", async ({ code, flags }) => {
		const { runtime, query, mutation, stdout } = createRuntime();
		expect(await runCli([...editArgs, ...flags, "--json"], runtime)).not.toBe(
			0
		);
		expect(query).not.toHaveBeenCalled();
		expect(mutation).not.toHaveBeenCalled();
		expect(JSON.parse(stdout())).toMatchObject({ error: { code } });
	});
});

it.each([
	{ code: "NON_INTERACTIVE_INPUT_REQUIRED", extra: [] },
	{ code: "INVALID_INPUT", extra: ["--planned-amount", "-1", "--dry-run"] },
	{ code: "INVALID_INPUT", extra: ["--planned-amount", "1.001", "--dry-run"] },
	{
		code: "INVALID_INPUT",
		extra: ["--if-preferred-currency", " ", "--dry-run"],
	},
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
