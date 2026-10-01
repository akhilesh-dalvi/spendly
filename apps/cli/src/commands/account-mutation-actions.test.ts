import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import type { RuntimeConfig } from "../config.js";
import { CLI_EXIT_CODE, CliError } from "../errors.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const developmentConfig: RuntimeConfig = {
	authReady: true,
	clientId: "client-id",
	convexUrl: "https://example.convex.cloud",
	environment: "development",
	issuer: "https://issuer.example",
	webUrl: "http://localhost:3001",
};

const fixture = JSON.parse(
	readFileSync(
		new URL("../../test/fixtures/account-mutations.json", import.meta.url),
		"utf8"
	)
) as Record<string, unknown>;

interface BackendCall {
	args: Readonly<Record<string, unknown>>;
	kind: "mutation" | "query";
	name: string;
}

const createTestRuntime = (
	options: {
		mutationOverrides?: Record<string, unknown>;
		mutations?: BackendMutation;
		queryOverrides?: Record<string, unknown>;
	} = {}
) => {
	const calls: BackendCall[] = [];
	let stderr = "";
	let stdout = "";
	const accounts = fixture.accounts as Record<string, unknown>[];
	const queryResponses: Record<string, unknown> = {
		"cli/v1/accounts:list": accounts,
		"cli/v1/accountTypes:list": fixture.accountTypes,
		...options.queryOverrides,
	};
	const mutationResponses: Record<string, unknown> = {
		"cli/v1/accounts:adjustBalance": fixture.balanceAdjustmentResult,
		"cli/v1/accounts:archive": {
			...(fixture.accountUpdatePreview as { after: Record<string, unknown> })
				.after,
			isArchived: true,
		},
		"cli/v1/accounts:create": fixture.accountCreateResult,
		"cli/v1/accounts:previewArchive": fixture.accountUpdatePreview,
		"cli/v1/accounts:previewBalanceAdjustment":
			fixture.balanceAdjustmentPreview,
		"cli/v1/accounts:previewCreate": fixture.accountCreateProposal,
		"cli/v1/accounts:previewReactivate": fixture.accountUpdatePreview,
		"cli/v1/accounts:previewSetDefault": accounts[1],
		"cli/v1/accounts:previewTransfer": fixture.transferPreview,
		"cli/v1/accounts:previewUpdate": fixture.accountUpdatePreview,
		"cli/v1/accounts:reactivate": accounts[0],
		"cli/v1/accounts:setDefault": { ...accounts[1], isDefault: true },
		"cli/v1/accounts:transfer": fixture.transferResult,
		"cli/v1/accounts:update": (
			fixture.accountUpdatePreview as { after: unknown }
		).after,
		...options.mutationOverrides,
	};
	const backendQuery: BackendQuery = <Result>(name, args) => {
		calls.push({ args, kind: "query", name });
		if (name === "cli/v1/accounts:get") {
			return Promise.resolve(
				structuredClone(
					accounts.find((account) => account.id === args.accountId) ??
						accounts[0]
				) as Result
			);
		}
		if (!(name in queryResponses)) {
			throw new Error(`Unexpected query: ${name}`);
		}
		return Promise.resolve(structuredClone(queryResponses[name]) as Result);
	};
	const backendMutation: BackendMutation =
		options.mutations ??
		(<Result>(name, args) => {
			calls.push({ args, kind: "mutation", name });
			if (!(name in mutationResponses)) {
				throw new Error(`Unexpected mutation: ${name}`);
			}
			return Promise.resolve(
				structuredClone(mutationResponses[name]) as Result
			);
		});
	const runtime: CliRuntime = {
		backendMutation,
		backendQuery,
		developmentTools: false,
		environment: {},
		getConfig: () => developmentConfig,
		now: () => new Date("2026-09-04T12:00:00.000Z"),
		randomIdempotencyKey: () => "generated-account-key",
		stderr: {
			write: (chunk) => {
				stderr += chunk;
			},
		},
		stdout: {
			write: (chunk) => {
				stdout += chunk;
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

describe("Phase 6 account mutation commands", () => {
	it("previews account creation with an explicit type and signed balance", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"add",
				"--name",
				"Travel Cash",
				"--account-type-id",
				"account-type-wallet",
				"--starting-balance",
				"-100",
				"--date",
				"2026-09-04",
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
					accountTypeId: "account-type-wallet",
					date: "2026-09-04",
					name: "Travel Cash",
					startingBalance: -100,
				},
				kind: "mutation",
				name: "cli/v1/accounts:previewCreate",
			},
		]);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: { currentBalance: -100 },
			meta: { dateSource: "explicit", dryRun: true },
		});
	});

	it("resolves an exact account type without exposing the opening ledger ID", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"add",
				"--name",
				"Travel Cash",
				"--account-type",
				" wallet ",
				"--starting-balance",
				"-100",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.map((call) => call.name)).toEqual([
			"cli/v1/accountTypes:list",
			"cli/v1/accounts:create",
		]);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: { idempotencyKey: "generated-account-key" },
		});
		expect(testRuntime.getStdout()).toContain(
			"Ledger: Opening balance recorded"
		);
		expect(testRuntime.getStdout()).not.toContain("transaction-opening-travel");
	});

	it("rejects non-interactive account-type names before backend access", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"add",
				"--name",
				"Cash",
				"--account-type",
				"Wallet",
				"--starting-balance",
				"0",
				"--dry-run",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.calls).toHaveLength(0);
	});

	it("resolves a human account and transparently previews its revision", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"edit",
				" daily wallet ",
				"--name",
				"Everyday Wallet",
				"--dry-run",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.at(-1)).toEqual({
			args: {
				accountId: "account-wallet",
				expectedRevision: 3,
				name: "Everyday Wallet",
			},
			kind: "mutation",
			name: "cli/v1/accounts:previewUpdate",
		});
	});

	it("requires a revision for non-interactive account edits", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"edit",
				"account-wallet",
				"--name",
				"Cash",
				"--dry-run",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.calls).toHaveLength(0);
	});

	it("routes archive, reactivate, and set-default dry runs", async () => {
		for (const [command, backendName] of [
			["archive", "previewArchive"],
			["reactivate", "previewReactivate"],
			["set-default", "previewSetDefault"],
		] as const) {
			const testRuntime = createTestRuntime();
			const exitCode = await runCli(
				[
					"accounts",
					command,
					"account-wallet",
					"--if-revision",
					"3",
					"--dry-run",
					"--json",
					"--non-interactive",
				],
				testRuntime.runtime
			);
			expect(exitCode).toBe(CLI_EXIT_CODE.success);
			expect(testRuntime.calls.map((call) => call.name)).toContain(
				`cli/v1/accounts:${backendName}`
			);
		}
	});

	it("previews an absolute negative balance and its delta warning", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"adjust-balance",
				"account-wallet",
				"--balance",
				"-50",
				"--date",
				"2026-09-04",
				"--note",
				"Reconcile",
				"--if-revision",
				"3",
				"--dry-run",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: { newBalance: -50 },
			kind: "mutation",
			name: "cli/v1/accounts:previewBalanceAdjustment",
		});
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: { adjustment: -1300, warnings: ["NEGATIVE_BALANCE"] },
		});
	});

	it("returns the balance-adjustment ledger reference on commit", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"adjust-balance",
				"account-wallet",
				"--balance",
				"-50",
				"--note",
				"Reconcile",
				"--if-revision",
				"3",
				"--idempotency-key",
				"adjustment-key",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: { transaction: { id: "transaction-adjustment" } },
		});
	});

	it("resolves transfer names and previews both revisions and warning", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"transfer",
				"--from-account",
				" daily wallet ",
				"--to-account",
				" savings ",
				"--amount",
				"1400",
				"--note",
				"Move funds",
				"--dry-run",
				"--json",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: {
				expectedFromRevision: 3,
				expectedToRevision: 2,
				fromAccountId: "account-wallet",
				toAccountId: "account-savings",
			},
			name: "cli/v1/accounts:previewTransfer",
		});
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: { warnings: ["NEGATIVE_SOURCE_BALANCE"] },
		});
	});

	it("commits a transfer with both ledger references", async () => {
		const testRuntime = createTestRuntime();
		const exitCode = await runCli(
			[
				"accounts",
				"transfer",
				"--from-account-id",
				"account-wallet",
				"--to-account-id",
				"account-savings",
				"--amount",
				"1400",
				"--note",
				"Move funds",
				"--if-from-revision",
				"3",
				"--if-to-revision",
				"2",
				"--idempotency-key",
				"transfer-key",
				"--agent",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: { agent: true, idempotencyKey: "transfer-key" },
			name: "cli/v1/accounts:transfer",
		});
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			data: {
				fromTransaction: { id: "transaction-transfer-out" },
				id: "transfer-1",
				toTransaction: { id: "transaction-transfer-in" },
			},
		});
	});

	it("returns candidates for an ambiguous human account name", async () => {
		const duplicate = {
			...(fixture.accounts as Record<string, unknown>[])[0],
			id: "account-wallet-duplicate",
		};
		const testRuntime = createTestRuntime({
			queryOverrides: {
				"cli/v1/accounts:list": [...(fixture.accounts as unknown[]), duplicate],
			},
		});
		const exitCode = await runCli(
			["accounts", "edit", "Daily Wallet", "--name", "Cash", "--json"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.calls).toHaveLength(1);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: { details: { candidates: expect.any(Array) } },
		});
	});

	it("does not retry a mutation with an uncertain transport result", async () => {
		let attempts = 0;
		const testRuntime = createTestRuntime({
			mutations: () => {
				attempts += 1;
				return Promise.reject(
					new CliError("NETWORK_ERROR", "connection ended", {
						retryable: true,
					})
				);
			},
		});
		const exitCode = await runCli(
			[
				"accounts",
				"add",
				"--name",
				"Cash",
				"--account-type-id",
				"account-type-wallet",
				"--starting-balance",
				"0",
				"--idempotency-key",
				"uncertain-account-key",
				"--json",
				"--non-interactive",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.temporary);
		expect(attempts).toBe(1);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: {
				details: {
					idempotencyKey: "uncertain-account-key",
					outcome: "unknown",
				},
			},
		});
		expect(testRuntime.getStderr()).toBe("");
	});
});
