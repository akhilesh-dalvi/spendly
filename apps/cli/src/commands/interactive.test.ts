import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import type { RuntimeConfig } from "../config.js";
import { CLI_EXIT_CODE } from "../errors.js";
import type {
	InteractivePrompter,
	MultiSelectPromptOptions,
	SelectPromptOptions,
	TextPromptOptions,
} from "../input/types.js";
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

const accountMutationsFixture = readFixture("account-mutations");
const contextFixture = readFixture("context");
const expenseMutationsFixture = readFixture("expense-mutations");
const expensePageFixture = readFixture("expense-page");
const resourcesFixture = readFixture("resources");

interface BackendCall {
	args: Readonly<Record<string, unknown>>;
	kind: "mutation" | "query";
	name: string;
}

interface ScriptedAnswers {
	confirms?: Record<string, boolean>;
	dates?: Record<string, string>;
	multiselects?: Record<string, string[]>;
	selects?: Record<string, string | string[]>;
	texts?: Record<string, string>;
}

const requireAnswer = <Value>(
	answers: Record<string, Value> | undefined,
	message: string
): Value => {
	const answer = answers?.[message];
	if (answer === undefined) {
		throw new Error(`Missing scripted prompt answer: ${message}`);
	}
	return answer;
};

const createScriptedPrompter = (
	answers: ScriptedAnswers,
	messages: string[],
	selectOptions: Map<string, Array<{ label: string; value: string }>>
): InteractivePrompter => {
	const selectIndexes = new Map<string, number>();
	return {
		confirm: async ({ message }) => {
			messages.push(message);
			return await Promise.resolve(requireAnswer(answers.confirms, message));
		},
		date: async ({ message }) => {
			messages.push(message);
			return await Promise.resolve(requireAnswer(answers.dates, message));
		},
		multiselect: async <Value extends string>(
			options: MultiSelectPromptOptions<Value>
		) => {
			messages.push(options.message);
			return await Promise.resolve(
				requireAnswer(answers.multiselects, options.message) as Value[]
			);
		},
		select: async <Value extends string>(
			options: SelectPromptOptions<Value>
		) => {
			messages.push(options.message);
			selectOptions.set(
				options.message,
				options.options.map(({ label, value }) => ({ label, value }))
			);
			const scripted = requireAnswer(answers.selects, options.message);
			if (!Array.isArray(scripted)) {
				return await Promise.resolve(scripted as Value);
			}
			const index = selectIndexes.get(options.message) ?? 0;
			const answer = scripted[index];
			if (answer === undefined) {
				throw new Error(`Missing scripted prompt answer: ${options.message}`);
			}
			selectIndexes.set(options.message, index + 1);
			return await Promise.resolve(answer as Value);
		},
		text: async (options: TextPromptOptions) => {
			messages.push(options.message);
			return await Promise.resolve(
				requireAnswer(answers.texts, options.message)
			);
		},
	};
};

const createTestRuntime = (
	answers: ScriptedAnswers,
	queryOverrides: Record<string, unknown> = {},
	querySequences: Record<string, unknown[]> = {}
) => {
	const calls: BackendCall[] = [];
	const messages: string[] = [];
	const selectOptions = new Map<
		string,
		Array<{ label: string; value: string }>
	>();
	let stderr = "";
	let stdout = "";
	const querySequenceIndexes = new Map<string, number>();
	const accounts = accountMutationsFixture.accounts as Record<
		string,
		unknown
	>[];
	const archiveBatchPreview = accounts.map((account) => ({
		after: {
			...account,
			isArchived: true,
			isDefault: false,
			revision: Number(account.revision) + 1,
		},
		before: account,
	}));
	const archivedAccounts = archiveBatchPreview.map((preview) => preview.after);
	const reactivateBatchPreview = archivedAccounts.map((account) => ({
		after: {
			...account,
			isArchived: false,
			revision: Number(account.revision) + 1,
		},
		before: account,
	}));
	const queryResponses: Record<string, unknown> = {
		"cli/v1/accountTypes:list": accountMutationsFixture.accountTypes,
		"cli/v1/accounts:list": accountMutationsFixture.accounts,
		"cli/v1/context:get": contextFixture,
		"cli/v1/expenses:get": (expensePageFixture.items as unknown[])[0],
		"cli/v1/expenses:list": expensePageFixture,
		"cli/v1/expenses:previewCreate": expenseMutationsFixture.createProposal,
		"cli/v1/expenses:previewUpdate": expenseMutationsFixture.updatePreview,
		"cli/v1/resources:getCurrentCycle": (
			resourcesFixture.cycles as unknown[]
		)[0],
		"cli/v1/resources:getSummary": resourcesFixture.summary,
		"cli/v1/resources:listCategories": resourcesFixture.categories,
		"cli/v1/resources:listCycles": resourcesFixture.cycles,
		"cli/v1/resources:listTags": resourcesFixture.tags,
		...queryOverrides,
	};
	const mutationResponses: Record<string, unknown> = {
		"cli/v1/accounts:archiveBatch": archivedAccounts,
		"cli/v1/accounts:previewBalanceAdjustment":
			accountMutationsFixture.balanceAdjustmentPreview,
		"cli/v1/accounts:previewCreate":
			accountMutationsFixture.accountCreateProposal,
		"cli/v1/accounts:previewArchiveBatch": archiveBatchPreview,
		"cli/v1/accounts:previewReactivateBatch": reactivateBatchPreview,
		"cli/v1/accounts:previewTransfer": accountMutationsFixture.transferPreview,
		"cli/v1/accounts:transfer": accountMutationsFixture.transferResult,
		"cli/v1/expenses:create": expenseMutationsFixture.createResult,
		"cli/v1/expenses:update": {
			...(
				expenseMutationsFixture.updatePreview as {
					after: Record<string, unknown>;
				}
			).after,
			accountEffects: (
				expenseMutationsFixture.updatePreview as { accountEffects: unknown }
			).accountEffects,
		},
	};
	const backendQuery: BackendQuery = async <Result>(name, args) => {
		calls.push({ args, kind: "query", name });
		const sequence = querySequences[name];
		if (sequence) {
			const index = querySequenceIndexes.get(name) ?? 0;
			const response = sequence[index];
			if (response === undefined) {
				throw new Error(`Missing scripted query response: ${name}`);
			}
			querySequenceIndexes.set(name, index + 1);
			return await Promise.resolve(structuredClone(response) as Result);
		}
		if (name === "cli/v1/expenses:list" && args.cursor) {
			return await Promise.resolve(
				structuredClone({
					...expensePageFixture,
					hasMore: false,
					nextCursor: null,
				}) as Result
			);
		}
		if (name === "cli/v1/accounts:get") {
			return await Promise.resolve(
				structuredClone(
					accounts.find((account) => account.id === args.accountId) ??
						accounts[0]
				) as Result
			);
		}
		if (!(name in queryResponses)) {
			throw new Error(`Unexpected query: ${name}`);
		}
		return await Promise.resolve(
			structuredClone(queryResponses[name]) as Result
		);
	};
	const backendMutation: BackendMutation = async <Result>(name, args) => {
		calls.push({ args, kind: "mutation", name });
		if (!(name in mutationResponses)) {
			throw new Error(`Unexpected mutation: ${name}`);
		}
		return await Promise.resolve(
			structuredClone(mutationResponses[name]) as Result
		);
	};
	const runtime: CliRuntime = {
		backendMutation,
		backendQuery,
		developmentTools: false,
		environment: {},
		getConfig: () => developmentConfig,
		now: () => new Date("2026-09-02T12:00:00.000Z"),
		prompter: createScriptedPrompter(answers, messages, selectOptions),
		randomIdempotencyKey: () => "generated-interactive-key",
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
		messages,
		runtime,
		selectOptions,
	};
};

describe("Phase 8.8 guided interactive inputs", () => {
	it("rejects interactive JSON mode before backend or prompt access", async () => {
		const testRuntime = createTestRuntime({});

		const exitCode = await runCli(
			["expenses", "list", "--interactive", "--json"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.calls).toEqual([]);
		expect(testRuntime.messages).toEqual([]);
		expect(JSON.parse(testRuntime.getStdout())).toMatchObject({
			error: { code: "INVALID_INPUT" },
		});
	});

	it("fails immediately when required input cannot use a terminal", async () => {
		const testRuntime = createTestRuntime({});
		testRuntime.runtime.prompter = undefined;

		const exitCode = await runCli(["expenses", "add"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.invalidInput);
		expect(testRuntime.calls).toEqual([]);
		expect(testRuntime.messages).toEqual([]);
		expect(testRuntime.getStderr()).toContain(
			"Interactive input requires a terminal"
		);
	});

	it("launches a selected command from the guided command chooser", async () => {
		const testRuntime = createTestRuntime({
			selects: {
				"Choose an action": "cycles list",
				"What would you like to work with?": "planning",
			},
		});

		const exitCode = await runCli(["--interactive"], testRuntime.runtime);

		expect(exitCode, testRuntime.getStderr()).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.messages).toEqual([
			"What would you like to work with?",
			"Choose an action",
		]);
		expect(testRuntime.getStdout()).toContain("September");
	});

	it("offers an explicit launcher exit without backend access", async () => {
		const testRuntime = createTestRuntime({
			selects: { "What would you like to work with?": "exit" },
		});

		const exitCode = await runCli(["--interactive"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls).toEqual([]);
		expect(testRuntime.messages).toEqual(["What would you like to work with?"]);
		expect(testRuntime.getStderr()).toContain("Exited guided mode.");
	});

	it("returns from an action menu to the launcher group list", async () => {
		const testRuntime = createTestRuntime({
			selects: {
				"Choose an action": "back",
				"What would you like to work with?": ["expenses", "exit"],
			},
		});

		const exitCode = await runCli(["--interactive"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls).toEqual([]);
		expect(testRuntime.messages).toEqual([
			"What would you like to work with?",
			"Choose an action",
			"What would you like to work with?",
		]);
	});

	it("uses the Spendly UI vocabulary in the guided expense actions", async () => {
		const testRuntime = createTestRuntime({
			multiselects: { "Choose expense filters": [] },
			selects: {
				"Choose an action": "expenses list",
				"More expenses are available (1 loaded)": "done",
				"What would you like to work with?": "expenses",
			},
		});

		const exitCode = await runCli(["--interactive"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.selectOptions.get("Choose an action")).toEqual([
			expect.objectContaining({ label: "Add expense", value: "expenses add" }),
			expect.objectContaining({ label: "List expenses" }),
			expect.objectContaining({ label: "View expense" }),
			expect.objectContaining({
				label: "Edit expense",
				value: "expenses edit",
			}),
			expect.objectContaining({ label: "Delete expense" }),
			expect.objectContaining({ label: "Back", value: "back" }),
		]);
		expect(testRuntime.getStdout()).toContain(
			"Showing 1. More results are available."
		);
		expect(testRuntime.getStdout()).not.toContain("Next page:");
	});

	it("collects, previews, confirms, and commits a guided expense", async () => {
		const testRuntime = createTestRuntime({
			confirms: { "Add this expense?": true },
			dates: { "Expense date": "2026-09-02" },
			multiselects: { "Choose tags": ["tag-essential"] },
			selects: {
				"Choose a category for 2026-09-02": "category-food",
				"Choose an account": "account-wallet",
			},
			texts: {
				"Expense amount (INR)": "250",
				"What was this spent on?": "Lunch",
			},
		});

		const exitCode = await runCli(
			["expenses", "add", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.map((call) => call.name)).toContain(
			"cli/v1/expenses:previewCreate"
		);
		expect(
			testRuntime.calls.findLast(
				(call) => call.name === "cli/v1/expenses:create"
			)
		).toMatchObject({
			args: {
				accountId: "account-wallet",
				amount: 250,
				categoryId: "category-food",
				idempotencyKey: "generated-interactive-key",
				tagIds: ["tag-essential"],
			},
			kind: "mutation",
			name: "cli/v1/expenses:create",
		});
		expect(testRuntime.getStderr()).toContain("Add expense preview");
		expect(testRuntime.getStderr()).toContain("Category: Food");
		expect(testRuntime.getStderr()).toContain("Account: Daily Wallet");
		expect(testRuntime.getStderr()).toContain("Tags: Essential");
		expect(testRuntime.getStderr()).not.toContain("Tag IDs:");
	});

	it("cancels a previewed expense without committing", async () => {
		const testRuntime = createTestRuntime({
			confirms: { "Add this expense?": false },
			dates: { "Expense date": "2026-09-02" },
			multiselects: { "Choose tags": [] },
			selects: {
				"Choose a category for 2026-09-02": "clear",
				"Choose an account": "automatic",
			},
			texts: {
				"Expense amount (INR)": "250",
				"What was this spent on?": "Lunch",
			},
		});

		const exitCode = await runCli(
			["expenses", "add", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(
			testRuntime.calls.some(
				(call) =>
					call.kind === "mutation" && call.name === "cli/v1/expenses:create"
			)
		).toBe(false);
		expect(testRuntime.getStderr()).toContain("Cancelled; no changes made");
	});

	it("keeps explicit guided values authoritative without prompting again", async () => {
		const testRuntime = createTestRuntime({});

		const exitCode = await runCli(
			[
				"expenses",
				"add",
				"--interactive",
				"--dry-run",
				"--amount",
				"250",
				"--date",
				"2026-09-02",
				"--spent-on",
				"Lunch",
				"--category-id",
				"category-food",
				"--account-id",
				"account-wallet",
				"--tag-id",
				"tag-essential",
			],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.messages).toEqual([]);
		expect(
			testRuntime.calls.findLast(
				(call) => call.name === "cli/v1/expenses:previewCreate"
			)
		).toMatchObject({
			args: {
				accountId: "account-wallet",
				amount: 250,
				categoryId: "category-food",
				tagIds: ["tag-essential"],
			},
			kind: "query",
			name: "cli/v1/expenses:previewCreate",
		});
	});

	it("builds expense list filters with selects and multiselects", async () => {
		const testRuntime = createTestRuntime({
			dates: {
				"Inclusive end date": "2026-09-30",
				"Inclusive start date": "2026-09-01",
			},
			multiselects: {
				"Choose expense filters": [
					"category",
					"account",
					"tags",
					"from",
					"to",
					"limit",
				],
				"Choose required tags": ["tag-essential"],
			},
			selects: {
				"Choose a category filter": "category-food",
				"Choose an account filter": "account-wallet",
				"Choose the category's cycle": "cycle-september",
				"More expenses are available (1 loaded)": "done",
			},
			texts: { "Page size": "25" },
		});

		const exitCode = await runCli(
			["expenses", "list", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(
			testRuntime.calls.findLast((call) => call.name === "cli/v1/expenses:list")
		).toMatchObject({
			args: {
				accountId: "account-wallet",
				categoryId: "category-food",
				cycleId: "cycle-september",
				from: "2026-09-01",
				limit: 25,
				tagIds: ["tag-essential"],
				to: "2026-09-30",
			},
			kind: "query",
			name: "cli/v1/expenses:list",
		});
	});

	it("loads another expense page inside a guided session", async () => {
		const testRuntime = createTestRuntime({
			multiselects: { "Choose expense filters": [] },
			selects: { "More expenses are available (1 loaded)": "load" },
		});

		const exitCode = await runCli(
			["expenses", "list", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(
			testRuntime.calls.filter((call) => call.name === "cli/v1/expenses:list")
		).toHaveLength(2);
		expect(testRuntime.calls.at(-1)?.args).toMatchObject({
			cursor: "cursor-next",
		});
		expect(testRuntime.getStdout()).toContain("Showing 2. End of results.");
	});

	it("skips empty filtered cursor pages before prompting again", async () => {
		const emptyPage = {
			hasMore: true,
			items: [],
			nextCursor: "cursor-after-empty",
		};
		const matchingPage = {
			...expensePageFixture,
			hasMore: false,
			nextCursor: null,
		};
		const testRuntime = createTestRuntime(
			{
				multiselects: { "Choose expense filters": ["account"] },
				selects: { "Choose an account filter": "unassigned" },
			},
			{},
			{ "cli/v1/expenses:list": [emptyPage, matchingPage] }
		);

		const exitCode = await runCli(
			["expenses", "list", "--interactive", "--limit", "1"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(
			testRuntime.calls.filter((call) => call.name === "cli/v1/expenses:list")
		).toHaveLength(2);
		expect(testRuntime.calls.at(-1)?.args).toMatchObject({
			cursor: "cursor-after-empty",
		});
		expect(testRuntime.messages).not.toContain(
			"More expenses are available (0 loaded)"
		);
		expect(testRuntime.getStdout()).toContain("Showing 1. End of results.");
	});

	it("recovers from a summary date without a cycle", async () => {
		const testRuntime = createTestRuntime(
			{
				dates: { "Summary date": "2026-09-02" },
				selects: {
					"Choose an expense cycle": "cycle-september",
					"No cycle contains 2026-09-02. What would you like to do?": "select",
					"Which cycle should be summarized?": "current",
				},
			},
			{ "cli/v1/resources:getCurrentCycle": null }
		);

		const exitCode = await runCli(
			["summary", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode, testRuntime.getStderr()).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.messages).toContain(
			"No cycle contains 2026-09-02. What would you like to do?"
		);
		expect(testRuntime.calls.map((call) => call.name)).toContain(
			"cli/v1/resources:getSummary"
		);
		expect(testRuntime.getStderr()).not.toContain("RESOURCE_NOT_FOUND");
	});

	it("edits selected fields after reviewing a guided expense edit", async () => {
		const testRuntime = createTestRuntime({
			multiselects: { "What would you like to change?": ["category"] },
			selects: {
				"Save these expense changes?": ["edit", "confirm"],
				"New category for 2026-09-02": "clear",
			},
		});

		const exitCode = await runCli(
			["expenses", "edit", "expense-lunch", "--amount", "300", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(
			testRuntime.calls.filter(
				(call) => call.name === "cli/v1/expenses:previewUpdate"
			)
		).toHaveLength(2);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: { categoryId: null, expenseId: "expense-lunch" },
			kind: "mutation",
			name: "cli/v1/expenses:update",
		});
	});

	it("uses stable account IDs for a guided transfer", async () => {
		const testRuntime = createTestRuntime({
			confirms: { "Transfer these funds?": true },
			dates: { "Transfer date": "2026-09-04" },
			selects: {
				"Choose the destination account": "account-savings",
				"Choose the source account": "account-wallet",
			},
			texts: {
				"Transfer amount (INR; available INR 1,250.00)": "1400",
				"Transfer note": "Move funds",
			},
		});

		const exitCode = await runCli(
			["accounts", "transfer", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.map((call) => call.name)).toEqual([
			"cli/v1/accounts:list",
			"cli/v1/accounts:previewTransfer",
			"cli/v1/accounts:transfer",
		]);
		expect(testRuntime.calls.at(-1)?.args).toMatchObject({
			expectedFromRevision: 3,
			expectedToRevision: 2,
			fromAccountId: "account-wallet",
			idempotencyKey: "generated-interactive-key",
			toAccountId: "account-savings",
		});
		expect(testRuntime.getStderr()).toContain("NEGATIVE_SOURCE_BALANCE");
		expect(testRuntime.messages.slice(0, 3)).toEqual([
			"Choose the source account",
			"Choose the destination account",
			"Transfer amount (INR; available INR 1,250.00)",
		]);
	});

	it("shows account currency before guided monetary input", async () => {
		const testRuntime = createTestRuntime({
			dates: { "Opening balance date": "2026-09-04" },
			selects: { "Choose an account type": "account-type-wallet" },
			texts: {
				"Account name": "Travel Cash",
				"Starting balance (INR)": "100",
			},
		});

		const exitCode = await runCli(
			["accounts", "add", "--interactive", "--dry-run"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.messages).toEqual([
			"Account name",
			"Starting balance (INR)",
			"Opening balance date",
			"Choose an account type",
		]);
		expect(testRuntime.calls.map((call) => call.name)).toContain(
			"cli/v1/accounts:previewCreate"
		);
	});

	it("selects an account before asking for its desired balance", async () => {
		const testRuntime = createTestRuntime({
			dates: { "Adjustment date": "2026-09-04" },
			selects: { "Choose an account to reconcile": "account-wallet" },
			texts: {
				"Adjustment note": "Reconcile",
				"Desired absolute balance (INR; current INR 1,250.00)": "1000",
			},
		});

		const exitCode = await runCli(
			["accounts", "adjust-balance", "--interactive", "--dry-run"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.messages.slice(0, 4)).toEqual([
			"Choose an account to reconcile",
			"Desired absolute balance (INR; current INR 1,250.00)",
			"Adjustment date",
			"Adjustment note",
		]);
	});

	it("archives multiple guided accounts with one preview and commit", async () => {
		const testRuntime = createTestRuntime({
			confirms: { "Archive these 2 accounts?": true },
			multiselects: {
				"Choose accounts to archive": ["account-wallet", "account-savings"],
			},
		});

		const exitCode = await runCli(
			["accounts", "archive", "--interactive"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.map((call) => call.name)).toEqual([
			"cli/v1/accounts:list",
			"cli/v1/accounts:previewArchiveBatch",
			"cli/v1/accounts:archiveBatch",
		]);
		expect(testRuntime.calls.at(-1)?.args).toMatchObject({
			accounts: [
				{ accountId: "account-wallet", expectedRevision: 3 },
				{ accountId: "account-savings", expectedRevision: 2 },
			],
			idempotencyKey: "generated-interactive-key",
		});
		expect(
			testRuntime.messages.filter(
				(message) => message === "Archive these 2 accounts?"
			)
		).toHaveLength(1);
		expect(testRuntime.getStdout()).toContain("OK - 2 accounts archived");
		expect(testRuntime.getStdout()).not.toContain("account-wallet");
	});

	it("previews multiple guided account reactivations together", async () => {
		const accounts = (
			accountMutationsFixture.accounts as Record<string, unknown>[]
		).map((account) => ({ ...account, isArchived: true, isDefault: false }));
		const testRuntime = createTestRuntime(
			{
				multiselects: {
					"Choose accounts to reactivate": [
						"account-wallet",
						"account-savings",
					],
				},
			},
			{ "cli/v1/accounts:list": accounts }
		);

		const exitCode = await runCli(
			["accounts", "reactivate", "--interactive", "--dry-run"],
			testRuntime.runtime
		);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.map((call) => call.name)).toEqual([
			"cli/v1/accounts:list",
			"cli/v1/accounts:previewReactivateBatch",
		]);
		expect(testRuntime.getStdout()).toContain("Reactivate 2 accounts preview");
	});

	it("selects an account ID when a human omits the account argument", async () => {
		const testRuntime = createTestRuntime({
			selects: { "Choose an account": "account-wallet" },
		});

		const exitCode = await runCli(["accounts", "get"], testRuntime.runtime);

		expect(exitCode).toBe(CLI_EXIT_CODE.success);
		expect(testRuntime.calls.at(-1)).toMatchObject({
			args: { accountId: "account-wallet" },
			kind: "query",
			name: "cli/v1/accounts:get",
		});
		expect(testRuntime.getStdout()).toContain("Daily Wallet");
	});
});
