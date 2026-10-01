import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import type { RuntimeConfig } from "../config.js";
import { CLI_EXIT_CODE } from "../errors.js";
import type { BackendQuery, CliRuntime } from "../runtime.js";

const developmentConfig: RuntimeConfig = {
	authReady: true,
	clientId: "client-id",
	convexUrl: "https://example.convex.cloud",
	environment: "development",
	issuer: "https://issuer.example",
	webUrl: "http://localhost:3001",
};

const readFixture = (name: string): unknown =>
	JSON.parse(
		readFileSync(
			new URL(`../../test/fixtures/${name}.json`, import.meta.url),
			"utf8"
		)
	);

const contextFixture = readFixture("context");
const expensePageFixture = readFixture("expense-page");
const resourcesFixture = readFixture("resources") as Record<string, unknown>;
const accountsFixture = readFixture("accounts") as Record<string, unknown>;

const createTestRuntime = (backendQuery: BackendQuery, columns?: number) => {
	let stderr = "";
	let stdout = "";
	const runtime: CliRuntime = {
		backendQuery,
		developmentTools: false,
		environment: {},
		getConfig: () => developmentConfig,
		now: () => new Date("2026-09-02T12:00:00.000Z"),
		sleep: () => Promise.resolve(),
		stderr: {
			write: (value) => {
				stderr += value;
			},
		},
		stdout: {
			columns,
			write: (value) => {
				stdout += value;
			},
		},
		timeZone: () => "Asia/Kolkata",
	};
	return {
		getStderr: () => stderr,
		getStdout: () => stdout,
		runtime,
	};
};

const createFixtureQuery =
	(
		overrides: Record<string, unknown> = {},
		calls: Array<{ args: Readonly<Record<string, unknown>>; name: string }> = []
	): BackendQuery =>
	async <Result>(
		functionName: string,
		args: Readonly<Record<string, unknown>>
	): Promise<Result> => {
		calls.push({ args, name: functionName });
		const responses: Record<string, unknown> = {
			"cli/v1/accountTypes:list": accountsFixture.accountTypes,
			"cli/v1/accounts:get": (accountsFixture.accounts as unknown[])[0],
			"cli/v1/accounts:list": accountsFixture.accounts,
			"cli/v1/accounts:listTransactions": accountsFixture.transactions,
			"cli/v1/context:get": contextFixture,
			"cli/v1/expenses:get": (expensePageFixture as { items: unknown[] })
				.items[0],
			"cli/v1/expenses:list": expensePageFixture,
			"cli/v1/resources:getCurrentCycle": (
				resourcesFixture.cycles as unknown[]
			)[0],
			"cli/v1/resources:getSummary": resourcesFixture.summary,
			"cli/v1/resources:listCategories": resourcesFixture.categories,
			"cli/v1/resources:listCycles": resourcesFixture.cycles,
			"cli/v1/resources:listTags": resourcesFixture.tags,
			...overrides,
		};
		if (!(functionName in responses)) {
			throw new Error(`Unexpected query: ${functionName}`);
		}
		return await Promise.resolve(
			structuredClone(responses[functionName]) as Result
		);
	};

describe("Phase 4 read commands", () => {
	it("renders a narrow expense list with visible pagination", async () => {
		const testRuntime = createTestRuntime(createFixtureQuery(), 40);

		const exitCode = await runCli(["expenses", "list"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.getStdout()).toContain("DATE    : 2026-09-02");
		expect(testRuntime.getStdout()).toContain(
			"Showing 1. More results are available."
		);
		expect(testRuntime.getStdout()).toContain(
			"Next page: spendly expenses list --cursor cursor-next"
		);
	});

	it("distinguishes filtered empty expenses from an empty account", async () => {
		const testRuntime = createTestRuntime(
			createFixtureQuery({
				"cli/v1/expenses:list": {
					hasMore: false,
					items: [],
					nextCursor: null,
				},
			})
		);

		const exitCode = await runCli(
			["expenses", "list", "--from", "2026-09-01"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.getStdout()).toContain(
			"No expenses match these filters."
		);
		expect(testRuntime.getStdout()).toContain("Filters: from: 2026-09-01");
		expect(testRuntime.getStdout()).toContain("Showing 0. End of results.");
	});

	it("writes one context JSON document with the machine-local date", async () => {
		const calls: Array<{
			args: Readonly<Record<string, unknown>>;
			name: string;
		}> = [];
		const testRuntime = createTestRuntime(createFixtureQuery({}, calls));

		const exitCode = await runCli(
			["context", "--json", "--non-interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.getStderr()).toBe("");
		expect(testRuntime.getStdout().trim().split("\n")).toHaveLength(1);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: {
				dateSource: "local_default",
				effectiveDate: "2026-09-02",
				timezone: "Asia/Kolkata",
				userId: "user-one",
			},
			meta: {},
			schemaVersion: 1,
		});
		expect(calls).toEqual([
			{
				args: {
					date: "2026-09-02",
					dateSource: "local_default",
					timezone: "Asia/Kolkata",
				},
				name: "cli/v1/context:get",
			},
		]);
	});

	it("passes approved expense filters and returns cursor metadata", async () => {
		const calls: Array<{
			args: Readonly<Record<string, unknown>>;
			name: string;
		}> = [];
		const testRuntime = createTestRuntime(createFixtureQuery({}, calls));

		const exitCode = await runCli(
			[
				"expenses",
				"list",
				"--cycle-id",
				"cycle-september",
				"--category-id",
				"category-food",
				"--account-id",
				"account-wallet",
				"--tag-id",
				"tag-essential",
				"--from",
				"2026-09-01",
				"--to",
				"2026-09-30",
				"--limit",
				"1",
				"--cursor",
				"cursor-before",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.getStderr()).toBe("");
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: [{ id: "expense-lunch" }],
			meta: {
				hasMore: true,
				nextCursor: "cursor-next",
				pageSize: 1,
			},
		});
		expect(calls.at(-1)).toEqual({
			args: {
				accountId: "account-wallet",
				categoryId: "category-food",
				cursor: "cursor-before",
				cycleId: "cycle-september",
				from: "2026-09-01",
				limit: 1,
				tagIds: ["tag-essential"],
				to: "2026-09-30",
			},
			name: "cli/v1/expenses:list",
		});
	});

	it("renders human account names and resolves exact account selectors", async () => {
		const calls: Array<{
			args: Readonly<Record<string, unknown>>;
			name: string;
		}> = [];
		const testRuntime = createTestRuntime(createFixtureQuery({}, calls));

		const exitCode = await runCli(
			["accounts", "get", " daily wallet "],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.getStdout()).toContain("Account: Daily Wallet");
		expect(testRuntime.getStdout()).toContain("Balance: INR 1,250.00");
		expect(testRuntime.getStderr()).toBe("");
		expect(calls.map((call) => call.name)).toEqual([
			"cli/v1/accounts:list",
			"cli/v1/accounts:get",
		]);
	});

	it("resolves every human expense filter by trimmed exact name", async () => {
		const calls: Array<{
			args: Readonly<Record<string, unknown>>;
			name: string;
		}> = [];
		const testRuntime = createTestRuntime(createFixtureQuery({}, calls));

		const exitCode = await runCli(
			[
				"expenses",
				"list",
				"--cycle",
				" september ",
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
		expect(
			calls.findLast((call) => call.name === "cli/v1/expenses:list")
		).toEqual({
			args: {
				accountId: "account-wallet",
				categoryId: "category-food",
				cycleId: "cycle-september",
				tagIds: ["tag-essential"],
			},
			name: "cli/v1/expenses:list",
		});
	});

	it("supports all supporting and account read routes", async () => {
		const commands = [
			["cycles", "list"],
			["cycles", "current", "--date", "2026-09-02"],
			["categories", "list", "--cycle-id", "cycle-september"],
			["tags", "list"],
			["summary", "--cycle-id", "cycle-september"],
			["accounts", "list", "--include-archived"],
			[
				"accounts",
				"transactions",
				"account-wallet",
				"--limit",
				"10",
				"--json",
				"--non-interactive",
			],
			["account-types", "list", "--include-archived"],
		] as const;

		for (const args of commands) {
			const testRuntime = createTestRuntime(createFixtureQuery());
			const exitCode = await runCli(args, testRuntime.runtime);
			expect(exitCode).toBe(CLI_EXIT_CODE.success);
			expect(testRuntime.getStderr()).toBe("");
			expect(testRuntime.getStdout().length).toBeGreaterThan(0);
		}
	});

	it("passes an explicit local date to summary calculations", async () => {
		const calls: Array<{
			args: Readonly<Record<string, unknown>>;
			name: string;
		}> = [];
		const testRuntime = createTestRuntime(createFixtureQuery({}, calls));

		const exitCode = await runCli(
			[
				"summary",
				"--cycle-id",
				"cycle-september",
				"--date",
				"2026-09-15",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(calls).toEqual([
			{
				args: { cycleId: "cycle-september", today: "2026-09-15" },
				name: "cli/v1/resources:getSummary",
			},
		]);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			meta: {
				cycleId: "cycle-september",
				date: "2026-09-15",
				dateSource: "explicit",
			},
		});
	});

	it("rejects invalid local filters before a backend request", async () => {
		let queryCount = 0;
		const testRuntime = createTestRuntime(async <Result>() => {
			queryCount += 1;
			return await Promise.resolve(undefined as Result);
		});

		const exitCode = await runCli(
			[
				"expenses",
				"list",
				"--from",
				"2026-09-31",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(queryCount).toBe(0);
		expect(testRuntime.getStderr()).toBe("");
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: { code: "INVALID_INPUT" },
		});
	});

	it("requires IDs for non-interactive name selectors before querying", async () => {
		let queryCount = 0;
		const testRuntime = createTestRuntime(async <Result>() => {
			queryCount += 1;
			return await Promise.resolve(undefined as Result);
		});

		const exitCode = await runCli(
			[
				"expenses",
				"list",
				"--account",
				"Daily Wallet",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(queryCount).toBe(0);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: { code: "NON_INTERACTIVE_INPUT_REQUIRED" },
		});
	});

	it("returns ambiguity candidates without selecting the first account", async () => {
		const duplicate = structuredClone(
			(accountsFixture.accounts as Record<string, unknown>[])[0]
		);
		if (!duplicate) {
			throw new Error("Expected account fixture");
		}
		duplicate.id = "account-wallet-two";
		const testRuntime = createTestRuntime(
			createFixtureQuery({
				"cli/v1/accounts:list": [
					...(accountsFixture.accounts as unknown[]),
					duplicate,
				],
			})
		);

		const exitCode = await runCli(
			["accounts", "get", "Daily Wallet", "--json"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.getStderr()).toBe("");
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: {
				code: "INVALID_INPUT",
				details: {
					candidates: [
						{ id: "account-wallet", name: "Daily Wallet" },
						{ id: "account-wallet-two", name: "Daily Wallet" },
					],
				},
			},
		});
	});
});
