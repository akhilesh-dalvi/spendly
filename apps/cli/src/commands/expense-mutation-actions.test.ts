import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import type { RuntimeConfig } from "../config.js";
import { CLI_EXIT_CODE } from "../errors.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const developmentConfig: RuntimeConfig = {
	authReady: true,
	clientId: "client-id",
	convexUrl: "https://example.convex.cloud",
	environment: "development",
	issuer: "https://issuer.example",
	webUrl: "http://localhost:3001",
};

const readFixture = (name: string): Record<string, unknown> =>
	JSON.parse(
		readFileSync(
			new URL(`../../test/fixtures/${name}.json`, import.meta.url),
			"utf8"
		)
	) as Record<string, unknown>;

const mutationsFixture = readFixture("expense-mutations");
const expensePageFixture = readFixture("expense-page");
const resourcesFixture = readFixture("resources");
const accountsFixture = readFixture("accounts");

interface BackendCall {
	args: Readonly<Record<string, unknown>>;
	kind: "mutation" | "query";
	name: string;
}

const createTestRuntime = (
	options: {
		confirm?: (message: string) => Promise<boolean>;
		mutationOverrides?: Record<string, unknown>;
		mutations?: BackendMutation;
		queryOverrides?: Record<string, unknown>;
	} = {}
) => {
	const calls: BackendCall[] = [];
	let stderr = "";
	let stdout = "";
	const queryResponses: Record<string, unknown> = {
		"cli/v1/accounts:list": accountsFixture.accounts,
		"cli/v1/expenses:get": (expensePageFixture.items as unknown[])[0],
		"cli/v1/expenses:previewCreate": mutationsFixture.createProposal,
		"cli/v1/expenses:previewUpdate": mutationsFixture.updatePreview,
		"cli/v1/resources:getCurrentCycle": (
			resourcesFixture.cycles as unknown[]
		)[0],
		"cli/v1/resources:listCategories": resourcesFixture.categories,
		"cli/v1/resources:listTags": resourcesFixture.tags,
		...options.queryOverrides,
	};
	const mutationResponses: Record<string, unknown> = {
		"cli/v1/expenses:create": mutationsFixture.createResult,
		"cli/v1/expenses:previewDelete": mutationsFixture.deletePreview,
		"cli/v1/expenses:remove": mutationsFixture.deleteResult,
		"cli/v1/expenses:update": {
			...(mutationsFixture.updatePreview as { after: Record<string, unknown> })
				.after,
			accountEffects: (
				mutationsFixture.updatePreview as { accountEffects: unknown }
			).accountEffects,
		},
		...options.mutationOverrides,
	};
	const backendQuery: BackendQuery = async <Result>(name, args) => {
		calls.push({ args, kind: "query", name });
		if (!(name in queryResponses)) {
			throw new Error(`Unexpected query: ${name}`);
		}
		return await Promise.resolve(
			structuredClone(queryResponses[name]) as Result
		);
	};
	const backendMutation: BackendMutation =
		options.mutations ??
		(async <Result>(name, args) => {
			calls.push({ args, kind: "mutation", name });
			if (!(name in mutationResponses)) {
				throw new Error(`Unexpected mutation: ${name}`);
			}
			return await Promise.resolve(
				structuredClone(mutationResponses[name]) as Result
			);
		});
	const runtime: CliRuntime = {
		backendMutation,
		backendQuery,
		confirm: options.confirm,
		developmentTools: false,
		environment: {},
		getConfig: () => developmentConfig,
		now: () => new Date("2026-09-02T12:00:00.000Z"),
		randomIdempotencyKey: () => "generated-expense-key",
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
		getStderr: () => stderr,
		getStdout: () => stdout,
		runtime,
	};
};

describe("Phase 5 expense mutation commands", () => {
	it("previews create with the same normalized server contract", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			[
				"expenses",
				"create",
				"--amount",
				"250",
				"--date",
				"2026-09-02",
				"--spent-on",
				" Lunch ",
				"--category-id",
				"category-food",
				"--account-id",
				"account-wallet",
				"--tag-id",
				"tag-essential",
				"--dry-run",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls).toEqual([
			{
				args: {
					accountId: "account-wallet",
					amount: 250,
					categoryId: "category-food",
					date: "2026-09-02",
					spentOn: " Lunch ",
					tagIds: ["tag-essential"],
				},
				kind: "query",
				name: "cli/v1/expenses:previewCreate",
			},
		]);
		expect(testRuntime.getStderr()).toBe("");
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: { accountSource: "explicit", categorySource: "explicit" },
			meta: { dateSource: "explicit", dryRun: true },
		});
	});

	it("resolves exact human selectors and generates a commit key", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			[
				"expenses",
				"create",
				"--amount",
				"250",
				"--spent-on",
				"Lunch",
				"--category",
				" food ",
				"--account",
				" daily wallet ",
				"--tag",
				" essential ",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.map((call) => call.name)).toEqual([
			"cli/v1/resources:getCurrentCycle",
			"cli/v1/resources:listCategories",
			"cli/v1/accounts:list",
			"cli/v1/resources:listTags",
			"cli/v1/expenses:create",
		]);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: {
				accountId: "account-wallet",
				categoryId: "category-food",
				date: "2026-09-02",
				idempotencyKey: "generated-expense-key",
				tagIds: ["tag-essential"],
			},
			kind: "mutation",
		});
		expect(testRuntime.getStdout()).toContain(
			"Daily Wallet: INR 1500.00 -> INR 1250.00"
		);
		expect(testRuntime.getStdout()).toContain("Category source: explicit");
		expect(testRuntime.getStdout()).toContain("Account source: explicit");
	});

	it("requires stable commit inputs in non-interactive mode before querying", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			["expenses", "create", "--amount", "5", "--json", "--non-interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.calls).toHaveLength(0);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: { code: "NON_INTERACTIVE_INPUT_REQUIRED" },
		});
	});

	it("previews explicit update clears at the supplied revision", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			[
				"expenses",
				"update",
				"expense-lunch",
				"--amount",
				"300",
				"--clear-category",
				"--clear-spent-on",
				"--clear-tags",
				"--if-revision",
				"2",
				"--dry-run",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.at(-1)).toEqual({
			args: {
				amount: 300,
				categoryId: null,
				expectedRevision: 2,
				expenseId: "expense-lunch",
				spentOn: null,
				tagIds: [],
			},
			kind: "query",
			name: "cli/v1/expenses:previewUpdate",
		});
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: { after: { revision: 3 }, before: { revision: 2 } },
			meta: { dryRun: true, expectedRevision: 2 },
		});
	});

	it("uses the current revision transparently for a human update", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			["expenses", "update", "expense-lunch", "--amount", "300"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls).toHaveLength(2);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: {
				amount: 300,
				expectedRevision: 2,
				expenseId: "expense-lunch",
				idempotencyKey: "generated-expense-key",
			},
			kind: "mutation",
			name: "cli/v1/expenses:update",
		});
	});

	it("reports cycle-change category guidance before mutation", async () => {
		const testRuntime = createTestRuntime({
			queryOverrides: {
				"cli/v1/resources:getCurrentCycle": {
					createdAt: "2026-10-01T00:00:00.000Z",
					endDateExclusive: "2026-11-01",
					id: "cycle-october",
					name: "October",
					startDate: "2026-10-01",
				},
			},
		});

		const exitCode = await runCli(
			[
				"expenses",
				"update",
				"expense-lunch",
				"--date",
				"2026-10-02",
				"--if-revision",
				"2",
				"--dry-run",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.conflict);
		expect(testRuntime.calls.every((call) => call.kind === "query")).toBe(true);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: {
				code: "CATEGORY_CYCLE_MISMATCH",
				details: {
					newCycle: { id: "cycle-october" },
					oldCycle: { id: "cycle-september" },
				},
			},
		});
	});

	it("returns a deletion capability without deleting during dry run", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			[
				"expenses",
				"delete",
				"expense-lunch",
				"--dry-run",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls).toEqual([
			{
				args: { expenseId: "expense-lunch" },
				kind: "mutation",
				name: "cli/v1/expenses:previewDelete",
			},
		]);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: {
				confirmationToken: "confirmation-lunch",
				revision: 2,
			},
			meta: { dryRun: true },
		});
	});

	it("commits only a fully confirmed non-interactive deletion", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			[
				"expenses",
				"delete",
				"expense-lunch",
				"--confirmation-token",
				"confirmation-lunch",
				"--if-revision",
				"2",
				"--idempotency-key",
				"delete-lunch-key",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls).toEqual([
			{
				args: {
					confirmationToken: "confirmation-lunch",
					expectedRevision: 2,
					expenseId: "expense-lunch",
					idempotencyKey: "delete-lunch-key",
				},
				kind: "mutation",
				name: "cli/v1/expenses:remove",
			},
		]);
	});

	it("stops a human delete when confirmation is declined", async () => {
		const testRuntime = createTestRuntime({
			confirm: async () => await Promise.resolve(false),
		});

		const exitCode = await runCli(
			["expenses", "delete", "expense-lunch"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.confirmation);
		expect(testRuntime.calls.map((call) => call.name)).toEqual([
			"cli/v1/expenses:previewDelete",
		]);
		expect(testRuntime.getStderr()).toContain("Deletion was not confirmed");
	});

	it("does not retry an uncertain mutation and returns its recovery key", async () => {
		let attempts = 0;
		const testRuntime = createTestRuntime({
			mutations: () => {
				attempts += 1;
				return Promise.reject(new TypeError("fetch failed"));
			},
		});

		const exitCode = await runCli(
			[
				"expenses",
				"create",
				"--amount",
				"5",
				"--idempotency-key",
				"uncertain-create-key",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.temporary);
		expect(attempts).toBe(1);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: {
				code: "NETWORK_ERROR",
				details: {
					idempotencyKey: "uncertain-create-key",
					outcome: "unknown",
				},
				retryable: true,
			},
		});
	});

	it("rejects scientific notation before accessing the backend", async () => {
		const testRuntime = createTestRuntime();

		const exitCode = await runCli(
			["expenses", "create", "--amount", "1e3", "--dry-run"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.calls).toHaveLength(0);
	});
});
