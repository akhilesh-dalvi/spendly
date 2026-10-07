import { PassThrough } from "node:stream";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import { CLI_EXIT_CODE, CliError } from "../errors.js";
import { createAccessiblePrompter } from "../input/accessible-prompts.js";
import type { InteractivePrompter } from "../input/types.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const cycle = {
	createdAt: "2026-09-01T00:00:00.000Z",
	endDateExclusive: "2026-10-01",
	id: "cycle-september",
	name: "September",
	revision: 1,
	startDate: "2026-09-01",
};
const copySnapshot = "a".repeat(64);
const proposal = {
	copiedCategories: [],
	endDateExclusive: cycle.endDateExclusive,
	name: cycle.name,
	startDate: cycle.startDate,
};
const deletionPreview = {
	categoryCount: 2,
	confirmationToken: "confirmation-token",
	cycle,
	expiresAt: "2026-09-02T12:05:00.000Z",
};

const createTestRuntime = (
	options: {
		responses?: Record<string, unknown>;
		prompter?: InteractivePrompter;
	} = {}
) => {
	let stdout = "";
	let stderr = "";
	const queryNames: string[] = [];
	const mutationNames: string[] = [];
	const calls: Array<{
		name: string;
		args: Readonly<Record<string, unknown>>;
	}> = [];
	const responses: Record<string, unknown> = {
		"cli/v1/cycles:get": cycle,
		"cli/v1/cycles:previewCreate": proposal,
		"cli/v1/cycles:create": { cycle, copiedCategories: [] },
		"cli/v1/cycles:previewUpdate": {
			before: cycle,
			after: { ...cycle, name: "Renamed", revision: 2 },
		},
		"cli/v1/cycles:update": { ...cycle, name: "Renamed", revision: 2 },
		"cli/v1/cycles:previewDelete": deletionPreview,
		"cli/v1/cycles:remove": { cycle, deleted: true, deletedCategoryCount: 2 },
		"cli/v1/resources:listCycles": [cycle],
		"cli/v1/resources:listCategories": [],
		...options.responses,
	};
	const execute: BackendQuery & BackendMutation = async <Result>(
		name: string,
		args: Readonly<Record<string, unknown>>
	): Promise<Result> => {
		calls.push({ name, args });
		if (!(name in responses)) {
			throw new Error(`Unexpected operation ${name}`);
		}
		const response =
			name === "cli/v1/cycles:previewCreate" &&
			args.copyFromCycleId &&
			!(name in (options.responses ?? {}))
				? { ...proposal, copySnapshot }
				: responses[name];
		if (response instanceof Error) {
			throw response;
		}
		return await Promise.resolve(structuredClone(response) as Result);
	};
	const runtime: CliRuntime = {
		backendMutation: async <Result>(
			name: string,
			args: Readonly<Record<string, unknown>>
		) => {
			mutationNames.push(name);
			return await execute<Result>(name, args);
		},
		backendQuery: async <Result>(
			name: string,
			args: Readonly<Record<string, unknown>>
		) => {
			queryNames.push(name);
			return await execute<Result>(name, args);
		},
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
		now: () => new Date("2026-09-02T12:00:00.000Z"),
		prompter: options.prompter,
		randomIdempotencyKey: () => "generated-cycle-key",
		stderr: {
			write: (value) => {
				stderr += value;
			},
		},
		stdout: {
			write: (value) => {
				stdout += value;
			},
		},
		timeZone: () => "Asia/Kolkata",
	};
	return {
		calls,
		queryNames,
		mutationNames,
		runtime,
		stdout: () => stdout,
		stderr: () => stderr,
	};
};

const scriptedPrompter = (
	answers: {
		text?: string[];
		date?: string[];
		select?: string[];
		multiselect?: string[][];
		confirm?: boolean[];
	} = {}
): InteractivePrompter => ({
	text: async (options) =>
		await Promise.resolve(answers.text?.shift() ?? options.initialValue ?? ""),
	date: async (options) =>
		await Promise.resolve(
			answers.date?.shift() ?? options.initialValue ?? "2026-09-01"
		),
	select: async <Value extends string>(
		options: import("../input/types.js").SelectPromptOptions<Value>
	) => {
		const value =
			answers.select?.shift() ??
			options.initialValue ??
			options.options[0]?.value;
		if (!options.options.some((option) => option.value === value)) {
			throw new Error(`Unavailable choice ${value}`);
		}
		return await Promise.resolve(value as Value);
	},
	multiselect: async <Value extends string>(
		options: import("../input/types.js").MultiSelectPromptOptions<Value>
	) =>
		await Promise.resolve(
			(answers.multiselect?.shift() ?? options.initialValues ?? []) as Value[]
		),
	confirm: async () => await Promise.resolve(answers.confirm?.shift() ?? true),
});

const sourceCategory = {
	id: "food",
	cycleId: cycle.id,
	name: "Food",
	order: 0,
	plannedAmount: 200,
	icon: null,
	isHidden: false,
	categoryType: null,
	createdAt: cycle.createdAt,
};

const accessibleCopyPrompter = (
	copyMode: "none" | "clear-plan"
): InteractivePrompter => {
	const input = new PassThrough();
	const output = new PassThrough();
	let menu = "source";
	output.on("data", (chunk: Buffer) => {
		const text = chunk.toString();
		if (text.includes("Categories to copy")) {
			menu = "categories";
		}
		if (text.includes("Planned amount for")) {
			menu = "plan";
		}
		let answer: string | undefined;
		if (text.startsWith("Choose 1-")) {
			answer = menu === "plan" || copyMode === "none" ? "3" : "1";
			if (menu === "source") {
				answer = "2";
			}
		}
		if (text.startsWith("Enter option numbers")) {
			answer = copyMode === "none" ? "" : "1";
		}
		if (text.startsWith("Planned amount for") && text.endsWith(": ")) {
			answer = "";
		}
		if (text.includes("[y/N]: ")) {
			answer = "y";
		}
		if (answer !== undefined) {
			queueMicrotask(() => input.write(`${answer}\n`));
		}
	});
	return createAccessiblePrompter({ input, output });
};

const machine = ["--agent", "--json", "--non-interactive"];
const createFlags = [
	"--name",
	"September",
	"--start-date",
	"2026-09-01",
	"--end-date-exclusive",
	"2026-10-01",
];

describe("cycle CLI commands", () => {
	it("commits the category-copy snapshot returned by the reviewed preview", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter(),
			responses: {
				"cli/v1/cycles:previewCreate": { ...proposal, copySnapshot },
			},
		});
		expect(
			await runCli(
				["cycles", "add", ...createFlags, "--copy-from-cycle-id", cycle.id],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(
			test.calls.find((call) => call.name === "cli/v1/cycles:create")?.args
		).toMatchObject({ expectedCopySnapshot: copySnapshot });
	});
	it("guards direct agent copies with the snapshot from an automatic preview", async () => {
		const test = createTestRuntime();
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					"--idempotency-key",
					"automatic-copy-key",
					...machine,
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(
			test.calls.find((call) => call.name === "cli/v1/cycles:create")?.args
		).toMatchObject({ expectedCopySnapshot: copySnapshot });
		expect(test.queryNames).toEqual(["cli/v1/cycles:previewCreate"]);
	});
	it("preserves an explicitly reviewed copy snapshot without pre-reading the source during recovery", async () => {
		const test = createTestRuntime({ prompter: scriptedPrompter() });
		test.runtime.backendQuery = () => {
			throw new Error("The old source was removed; do not refresh a replay");
		};
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					"--if-copy-snapshot",
					copySnapshot,
					"--idempotency-key",
					"reviewed-copy-key",
					...machine,
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(test.calls).toHaveLength(1);
		expect(test.calls[0]?.args).toMatchObject({
			expectedCopySnapshot: copySnapshot,
		});
	});
	it("surfaces changed-copy conflicts without retrying or committing again", async () => {
		const test = createTestRuntime({
			responses: {
				"cli/v1/cycles:create": new ConvexError({
					code: "CYCLE_COPY_CONFLICT",
					details: {},
					message: "Review a fresh copy preview",
					retryable: false,
				}),
			},
		});
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					"--if-copy-snapshot",
					copySnapshot,
					"--idempotency-key",
					"conflicting-copy-key",
					...machine,
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.conflict);
		expect(JSON.parse(test.stdout())).toMatchObject({
			error: { code: "CYCLE_COPY_CONFLICT", retryable: false },
		});
		expect(test.calls).toHaveLength(1);
	});
	it("rejects a changed explicitly reviewed snapshot before human confirmation or commit", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter(),
			responses: {
				"cli/v1/cycles:previewCreate": {
					...proposal,
					copySnapshot: "b".repeat(64),
				},
			},
		});
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					"--if-copy-snapshot",
					copySnapshot,
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.conflict);
		expect(test.mutationNames).toHaveLength(0);
	});
	it("does not commit a source copy when the backend preview omits its snapshot", async () => {
		const test = createTestRuntime({
			responses: { "cli/v1/cycles:previewCreate": proposal },
		});
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					"--idempotency-key",
					"missing-backend-snapshot",
					...machine,
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.internal);
		expect(test.mutationNames).toHaveLength(0);
	});
	it("retains the resolved copy snapshot in uncertain-write recovery guidance", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter(),
			responses: {
				"cli/v1/cycles:create": new CliError(
					"NETWORK_ERROR",
					"Saved, response lost"
				),
			},
		});
		expect(
			await runCli(
				["cycles", "add", ...createFlags, "--copy-from-cycle-id", cycle.id],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.temporary);
		expect(test.stderr()).toContain(`"expectedCopySnapshot":"${copySnapshot}"`);
	});
	it.each([
		["--if-copy-snapshot", copySnapshot],
		["--copy-from-cycle-id", cycle.id, "--if-copy-snapshot", "invalid"],
		[
			"--copy-from-cycle-id",
			cycle.id,
			"--if-copy-snapshot",
			copySnapshot,
			"--dry-run",
		],
	])("rejects invalid copy snapshot usage before backend calls: %j", async (flags) => {
		const test = createTestRuntime();
		expect(
			await runCli(
				["cycles", "add", ...createFlags, ...flags, ...machine],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.invalidInput);
		expect(test.calls).toHaveLength(0);
	});
	it("replays guided mixed clear/set plans even though flags group amount overrides before clears", async () => {
		const travel = {
			...sourceCategory,
			id: "travel",
			name: "Travel",
			order: 1,
		};
		const test = createTestRuntime({
			prompter: scriptedPrompter({
				select: ["all", "clear", "set"],
				confirm: [false, true],
				text: ["0"],
			}),
			responses: {
				"cli/v1/resources:listCategories": [sourceCategory, travel],
			},
		});
		const requests: Readonly<Record<string, unknown>>[] = [];
		test.runtime.backendMutation = async <Result>(
			_name: string,
			args: Readonly<Record<string, unknown>>
		): Promise<Result> => {
			requests.push(args);
			if (requests.length === 1) {
				throw new CliError("NETWORK_ERROR", "Saved, response lost");
			}
			return await Promise.resolve({ cycle, copiedCategories: [] } as Result);
		};
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					"--interactive",
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.temporary);
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					"--copy-category-id",
					"travel",
					"--copy-category-id",
					"food",
					"--planned-amount",
					"travel=0",
					"--clear-planned-amount",
					"food",
					"--if-copy-snapshot",
					copySnapshot,
					"--idempotency-key",
					"generated-cycle-key",
					"--non-interactive",
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(requests[1]).toEqual(requests[0]);
	});
	it.each([
		"no-prefill",
		"copy-none",
	] as const)("can replay the exact guided creation payload: %s", async (mode) => {
		const test = createTestRuntime({
			prompter: scriptedPrompter({
				select: mode === "copy-none" ? ["none"] : ["all", "keep"],
				confirm: mode === "copy-none" ? [true] : [false, true],
			}),
			responses: { "cli/v1/resources:listCategories": [sourceCategory] },
		});
		const requests: Readonly<Record<string, unknown>>[] = [];
		test.runtime.backendMutation = async <Result>(
			name: string,
			args: Readonly<Record<string, unknown>>
		): Promise<Result> => {
			if (name !== "cli/v1/cycles:create") {
				throw new Error(`Unexpected mutation ${name}`);
			}
			requests.push(args);
			if (requests.length === 1) {
				throw new CliError("NETWORK_ERROR", "Saved, response lost");
			}
			return await Promise.resolve({ cycle, copiedCategories: [] } as Result);
		};
		const optionalFlags =
			mode === "copy-none" ? ["--include-planned-amounts"] : [];
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					...optionalFlags,
					"--interactive",
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.temporary);
		const recoveryFlags =
			mode === "copy-none"
				? ["--without-categories"]
				: [
						"--copy-category-id",
						sourceCategory.id,
						"--clear-planned-amount",
						sourceCategory.id,
					];
		expect(
			await runCli(
				[
					"cycles",
					"add",
					...createFlags,
					"--copy-from-cycle-id",
					cycle.id,
					...recoveryFlags,
					"--if-copy-snapshot",
					copySnapshot,
					"--idempotency-key",
					"generated-cycle-key",
					"--non-interactive",
				],
				test.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(requests).toHaveLength(2);
		expect(requests[1]).toEqual(requests[0]);
	});
	it("routes reads and financial previews as queries but deletion confirmations as mutations", async () => {
		const read = createTestRuntime();
		const create = createTestRuntime();
		const edit = createTestRuntime();
		const deletion = createTestRuntime();
		expect(
			await runCli(["cycles", "get", cycle.id, ...machine], read.runtime)
		).toBe(CLI_EXIT_CODE.success);
		expect(
			await runCli(
				["cycles", "add", ...createFlags, "--dry-run", ...machine],
				create.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(
			await runCli(
				[
					"cycles",
					"edit",
					cycle.id,
					"--name",
					"Renamed",
					"--dry-run",
					...machine,
				],
				edit.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(
			await runCli(
				["cycles", "delete", cycle.id, "--dry-run", ...machine],
				deletion.runtime
			)
		).toBe(CLI_EXIT_CODE.success);
		expect(read.queryNames).toEqual(["cli/v1/cycles:get"]);
		expect(create.queryNames).toEqual(["cli/v1/cycles:previewCreate"]);
		expect(edit.queryNames).toEqual(["cli/v1/cycles:previewUpdate"]);
		expect([
			read.mutationNames,
			create.mutationNames,
			edit.mutationNames,
		]).toEqual([[], [], []]);
		expect(deletion.mutationNames).toEqual(["cli/v1/cycles:previewDelete"]);
		expect(deletion.queryNames).toEqual([]);
	});
	it.each([
		"edit",
		"delete",
	] as const)("allows explicit non-interactive %s recovery without pre-reading changed or deleted records", async (operation) => {
		const test = createTestRuntime({
			prompter: scriptedPrompter(),
			responses: {
				"cli/v1/cycles:get": new CliError(
					"RESOURCE_NOT_FOUND",
					"Record no longer exists"
				),
				"cli/v1/cycles:previewUpdate": new CliError(
					"CYCLE_REVISION_CONFLICT",
					"Revision changed"
				),
				"cli/v1/cycles:previewDelete": new CliError(
					"RESOURCE_NOT_FOUND",
					"Record no longer exists"
				),
			},
		});
		const fields =
			operation === "edit"
				? ["--name", "Renamed"]
				: ["--confirmation-token", "confirmation-token"];
		const exitCode = await runCli(
			[
				"cycles",
				operation,
				cycle.id,
				...fields,
				"--if-revision",
				"1",
				"--idempotency-key",
				"original-cycle-key",
				"--non-interactive",
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.calls).toHaveLength(1);
		expect(test.calls[0]?.name).toBe(
			operation === "edit" ? "cli/v1/cycles:update" : "cli/v1/cycles:remove"
		);
	});
	it("preserves a human deletion token and key when the response is uncertain", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter(),
			responses: {
				"cli/v1/cycles:remove": new CliError(
					"NETWORK_ERROR",
					"Uncertain deletion"
				),
			},
		});
		const exitCode = await runCli(["cycles", "delete", cycle.id], test.runtime);
		expect(exitCode).toBe(CLI_EXIT_CODE.temporary);
		expect(test.stderr()).toContain('"confirmationToken":"confirmation-token"');
		expect(test.stderr()).toContain('"expectedRevision":1');
		expect(test.stderr()).toContain('"idempotencyKey":"generated-cycle-key"');
	});
	it.each([
		"none",
		"clear-plan",
	] as const)("supports accessible category copying: %s", async (mode) => {
		const test = createTestRuntime({
			prompter: accessibleCopyPrompter(mode),
			responses: { "cli/v1/resources:listCategories": [sourceCategory] },
		});
		const exitCode = await runCli(
			[
				"cycles",
				"add",
				...createFlags,
				"--copy-from-cycle-id",
				cycle.id,
				"--include-planned-amounts",
				"--interactive",
				"--accessible",
				"--dry-run",
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		const args = test.calls.find(
			(call) => call.name === "cli/v1/cycles:previewCreate"
		)?.args;
		if (mode === "none") {
			expect(args?.copyCategoryIds).toEqual([]);
		} else {
			expect(args?.categoryPlannedOverrides).toEqual([{ id: "food" }]);
		}
	});
	it("retains resolved human recovery inputs when an edit response is lost", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter(),
			responses: {
				"cli/v1/cycles:update": new CliError(
					"NETWORK_ERROR",
					"Uncertain commit"
				),
			},
		});
		const exitCode = await runCli(
			["cycles", "edit", cycle.id, "--name", "Renamed"],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.temporary);
		expect(test.stderr()).toContain('"idempotencyKey":"generated-cycle-key"');
		expect(test.stderr()).toContain('"expectedRevision":1');
		expect(test.stderr()).toContain("--non-interactive");
	});
	it("accepts fully specified JSON deletion without prompting", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			[
				"cycles",
				"delete",
				cycle.id,
				"--confirmation-token",
				"confirmation-token",
				"--if-revision",
				"1",
				"--idempotency-key",
				"cycle-delete-key",
				"--json",
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: { deleted: true },
		});
	});
	it.each([
		["add", ...createFlags],
		[
			"edit",
			cycle.id,
			"--name",
			"Renamed",
			"--idempotency-key",
			"cycle-update-key",
		],
		["delete", cycle.id, "--idempotency-key", "cycle-delete-key"],
	])("rejects incomplete machine write inputs: %j", async (...args) => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			["cycles", ...args, ...machine],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(JSON.parse(test.stdout())).toMatchObject({
			error: { code: "NON_INTERACTIVE_INPUT_REQUIRED" },
		});
		expect(test.calls).toEqual([]);
	});
	it.each([
		[
			"--name",
			"   ",
			"--start-date",
			"2026-09-01",
			"--end-date-exclusive",
			"2026-10-01",
		],
		[
			"--name",
			"Invalid",
			"--start-date",
			"2026-02-30",
			"--end-date-exclusive",
			"2026-03-01",
		],
		[
			"--name",
			"Invalid",
			"--start-date",
			"2026-09-01",
			"--end-date-exclusive",
			"2026-09-01",
		],
		[...createFlags, "--planned-amount", "food=200"],
		[
			...createFlags,
			"--copy-from-cycle-id",
			"source",
			"--planned-amount",
			"food=-1",
		],
		[
			...createFlags,
			"--copy-from-cycle-id",
			"source",
			"--planned-amount",
			"food=Infinity",
		],
		[
			...createFlags,
			"--copy-from-cycle-id",
			"source",
			"--planned-amount",
			"food=10",
			"--clear-planned-amount",
			"food",
		],
		[
			...createFlags,
			"--copy-from-cycle-id",
			"source",
			"--without-categories",
			"--copy-category-id",
			"food",
		],
	])("rejects invalid cycle creation: %j", async (...args) => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			["cycles", "add", ...args, "--dry-run", ...machine],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(test.calls).toEqual([]);
	});
	it("copies all categories by omitting the selection rather than inventing category IDs", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			[
				"cycles",
				"add",
				...createFlags,
				"--copy-from-cycle-id",
				"source",
				"--dry-run",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.calls[0]?.args).toMatchObject({ copyFromCycleId: "source" });
		expect(test.calls[0]?.args).not.toHaveProperty("copyCategoryIds");
	});
	it("guides cycle editing using the fetched revision", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter({
				select: [cycle.id],
				text: ["Renamed"],
				date: ["2026-09-01", "2026-10-01"],
			}),
		});
		const exitCode = await runCli(
			["cycles", "edit", "--interactive"],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.stdout()).toContain("Existing expenses were not reassigned.");
		expect(
			test.calls.find((call) => call.name === "cli/v1/cycles:update")?.args
		).toMatchObject({
			cycleId: cycle.id,
			expectedRevision: 1,
			name: "Renamed",
			idempotencyKey: "generated-cycle-key",
		});
	});
	it("does not commit a human deletion when confirmation is declined", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter({ confirm: [false] }),
		});
		const exitCode = await runCli(["cycles", "delete", cycle.id], test.runtime);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.stderr()).toContain("Permanently deletes 2 categories");
		expect(test.stderr()).toContain("Cancelled; no changes made");
		expect(test.calls.map((call) => call.name)).not.toContain(
			"cli/v1/cycles:remove"
		);
	});
	it("confirms a human deletion before submitting the reviewed token", async () => {
		const test = createTestRuntime({ prompter: scriptedPrompter() });
		const exitCode = await runCli(["cycles", "delete", cycle.id], test.runtime);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.stdout()).toContain("Categories deleted: 2");
		expect(
			test.calls.find((call) => call.name === "cli/v1/cycles:remove")?.args
		).toMatchObject({
			cycleId: cycle.id,
			expectedRevision: 1,
			confirmationToken: "confirmation-token",
			idempotencyKey: "generated-cycle-key",
		});
	});
	it("returns an uncertain commit with its key and does not automatically retry it", async () => {
		const test = createTestRuntime({
			responses: {
				"cli/v1/cycles:create": new CliError(
					"NETWORK_ERROR",
					"Uncertain commit"
				),
			},
		});
		const exitCode = await runCli(
			[
				"cycles",
				"add",
				...createFlags,
				"--idempotency-key",
				"cycle-create-key",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.temporary);
		expect(JSON.parse(test.stdout())).toMatchObject({
			error: {
				code: "NETWORK_ERROR",
				details: { outcome: "unknown", idempotencyKey: "cycle-create-key" },
			},
		});
		expect(
			test.calls.filter((call) => call.name === "cli/v1/cycles:create")
		).toHaveLength(1);
	});
	it.each([
		"DELETION_CONFIRMATION_EXPIRED",
		"DELETION_CONFIRMATION_INVALID",
	])("reports %s without obtaining a replacement confirmation", async (code) => {
		const test = createTestRuntime({
			responses: {
				"cli/v1/cycles:remove": new ConvexError({
					code,
					details: {},
					message: "Confirmation rejected",
					retryable: false,
				}),
			},
		});
		const exitCode = await runCli(
			[
				"cycles",
				"delete",
				cycle.id,
				"--confirmation-token",
				"confirmation-token",
				"--if-revision",
				"1",
				"--idempotency-key",
				"cycle-delete-key",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.confirmation);
		expect(JSON.parse(test.stdout())).toMatchObject({ error: { code } });
		expect(test.calls.map((call) => call.name)).not.toContain(
			"cli/v1/cycles:previewDelete"
		);
	});
	it("launches guided cycle creation from Planning data and allows cancellation", async () => {
		const test = createTestRuntime({
			prompter: scriptedPrompter({
				select: ["planning", "cycles add", "none"],
				text: ["September", "2026-09-01", "2026-10-01"],
				confirm: [false],
			}),
		});
		const exitCode = await runCli(["--interactive"], test.runtime);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.stderr()).toContain("Cancelled; no changes made");
		expect(test.calls.map((call) => call.name)).not.toContain(
			"cli/v1/cycles:create"
		);
	});
	it("advertises guided and flag-based cycle help without authentication", async () => {
		const test = createTestRuntime();
		test.runtime.getConfig = () => {
			throw new Error("Help must not load configuration");
		};
		const exitCode = await runCli(["cycles", "add", "--help"], test.runtime);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.stdout()).toContain(
			"Guided: spendly cycles add --interactive --dry-run"
		);
		expect(test.stdout()).toContain("--end-date-exclusive");
		expect(test.calls).toEqual([]);
	});
	it.each([
		"CYCLE_OVERLAP",
		"CYCLE_HAS_EXPENSES",
		"CYCLE_REVISION_CONFLICT",
	])("reports %s as a stable conflict rather than an internal error", async (code) => {
		const test = createTestRuntime({
			responses: {
				"cli/v1/cycles:update": new ConvexError({
					code,
					details: {},
					message: "Cycle conflict",
					retryable: false,
				}),
			},
		});
		const exitCode = await runCli(
			[
				"cycles",
				"edit",
				cycle.id,
				"--name",
				"Renamed",
				"--if-revision",
				"1",
				"--idempotency-key",
				"cycle-update-key",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.conflict);
		expect(JSON.parse(test.stdout())).toMatchObject({
			error: { code, retryable: false },
		});
	});
	it("guides category copying and preserves an empty interactive selection", async () => {
		const sourceCategory = {
			id: "food",
			cycleId: cycle.id,
			name: "Food",
			order: 0,
			plannedAmount: 200,
			icon: null,
			isHidden: false,
			categoryType: null,
			createdAt: cycle.createdAt,
		};
		const test = createTestRuntime({
			prompter: scriptedPrompter({
				select: [cycle.id, "subset"],
				multiselect: [[]],
			}),
			responses: { "cli/v1/resources:listCategories": [sourceCategory] },
		});
		const exitCode = await runCli(
			["cycles", "add", ...createFlags, "--interactive", "--dry-run"],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.stdout()).toContain("PREVIEW ONLY");
		expect(
			test.calls.find((call) => call.name === "cli/v1/cycles:previewCreate")
				?.args
		).toMatchObject({ copyFromCycleId: cycle.id, copyCategoryIds: [] });
	});
	it("commits deletion only with the exact reviewed token, revision, and key", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			[
				"cycles",
				"delete",
				cycle.id,
				"--confirmation-token",
				"confirmation-token",
				"--if-revision",
				"1",
				"--idempotency-key",
				"cycle-delete-key",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: { cycle, deleted: true, deletedCategoryCount: 2 },
			meta: { dryRun: false },
		});
		expect(test.calls).toEqual([
			{
				name: "cli/v1/cycles:remove",
				args: {
					agent: true,
					cycleId: cycle.id,
					confirmationToken: "confirmation-token",
					expectedRevision: 1,
					idempotencyKey: "cycle-delete-key",
				},
			},
		]);
	});
	it("previews category loss and a deletion token without deleting", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			["cycles", "delete", cycle.id, "--dry-run", ...machine],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: deletionPreview,
			meta: { dryRun: true },
		});
		expect(test.calls).toEqual([
			{ name: "cli/v1/cycles:previewDelete", args: { cycleId: cycle.id } },
		]);
	});
	it("commits an edit using the supplied revision and key without replacing the revision", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			[
				"cycles",
				"edit",
				cycle.id,
				"--name",
				"Renamed",
				"--if-revision",
				"1",
				"--idempotency-key",
				"cycle-update-key",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: { name: "Renamed", revision: 2 },
			meta: { dryRun: false },
		});
		expect(test.calls).toEqual([
			{
				name: "cli/v1/cycles:update",
				args: {
					agent: true,
					cycleId: cycle.id,
					name: "Renamed",
					expectedRevision: 1,
					idempotencyKey: "cycle-update-key",
				},
			},
		]);
	});
	it("previews an edit with before/after values and no commit", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			[
				"cycles",
				"edit",
				cycle.id,
				"--name",
				"Renamed",
				"--dry-run",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: { before: cycle, after: { name: "Renamed", revision: 2 } },
			meta: { dryRun: true },
		});
		expect(test.calls.map((call) => call.name)).not.toContain(
			"cli/v1/cycles:update"
		);
	});
	it("represents an explicitly empty category selection as an empty array", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			[
				"cycles",
				"add",
				...createFlags,
				"--copy-from-cycle-id",
				"source",
				"--without-categories",
				"--dry-run",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(test.calls[0]?.args).toMatchObject({
			copyFromCycleId: "source",
			copyCategoryIds: [],
		});
	});
	it("copies selected categories with planned overrides and explicit clearing", async () => {
		const copiedCategories = [
			{ sourceCategoryId: "food", name: "Food", plannedAmount: 200 },
			{ sourceCategoryId: "travel", name: "Travel", plannedAmount: null },
		];
		const test = createTestRuntime({
			responses: {
				"cli/v1/cycles:previewCreate": {
					...proposal,
					copiedCategories,
					copySnapshot,
				},
			},
		});
		const exitCode = await runCli(
			[
				"cycles",
				"add",
				...createFlags,
				"--copy-from-cycle-id",
				"source",
				"--copy-category-id",
				"food",
				"--copy-category-id",
				"travel",
				"--include-planned-amounts",
				"--planned-amount",
				"food=200",
				"--clear-planned-amount",
				"travel",
				"--dry-run",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: { copiedCategories },
		});
		expect(test.calls[0]?.args).toMatchObject({
			copyFromCycleId: "source",
			copyCategoryIds: ["food", "travel"],
			includePlannedAmounts: true,
			categoryPlannedOverrides: [
				{ id: "food", plannedAmount: 200 },
				{ id: "travel" },
			],
		});
	});
	it("commits agent creation with a stable idempotency key", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			[
				"cycles",
				"add",
				...createFlags,
				"--idempotency-key",
				"cycle-create-key",
				...machine,
			],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: { cycle },
			meta: { dryRun: false, idempotencyKey: "cycle-create-key" },
		});
		expect(test.calls).toEqual([
			{
				name: "cli/v1/cycles:create",
				args: {
					agent: true,
					name: "September",
					startDate: "2026-09-01",
					endDateExclusive: "2026-10-01",
					idempotencyKey: "cycle-create-key",
				},
			},
		]);
	});
	it("previews cycle creation without a commit or idempotency key", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			["cycles", "add", ...createFlags, "--dry-run", ...machine],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({
			data: proposal,
			meta: { dryRun: true },
		});
		expect(test.calls).toEqual([
			{
				name: "cli/v1/cycles:previewCreate",
				args: {
					name: "September",
					startDate: "2026-09-01",
					endDateExclusive: "2026-10-01",
				},
			},
		]);
	});
	it("gets a cycle with its revision in one JSON envelope", async () => {
		const test = createTestRuntime();
		const exitCode = await runCli(
			["cycles", "get", cycle.id, ...machine],
			test.runtime
		);
		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(test.stdout())).toMatchObject({ data: cycle });
		expect(test.stdout().trim().split("\n")).toHaveLength(1);
		expect(test.stderr()).toBe("");
	});
});
