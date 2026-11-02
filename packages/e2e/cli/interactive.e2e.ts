import { type Browser, type BrowserContext, chromium } from "@playwright/test";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { configureClerk } from "../src/authentication";
import { api } from "../src/backend-api";
import { type E2EEnvironment, loadEnvironment } from "../src/environment";
import { type RunningTerminal, terminalKeys } from "../src/terminal";
import { answerAddExpense } from "../src/terminal-add-expense";
import { startInteractiveCli } from "../src/terminal-fixture";
import { createUser, type E2EUser, seedUser } from "../src/users";

const patterns = {
	amount: /Expense amount/u,
	cancelled: /Cancelled; no changes made/u,
	dryRun:
		/PREVIEW ONLY - no changes were saved\.[\s\S]*Account: E2E Savings[\s\S]*Tags: E2E Essential/u,
	success: /OK - Expense added successfully/u,
};

const PREVIEW_CONFIRMATION =
	/Add expense preview[\s\S]*Account: E2E Savings[\s\S]*Tags: E2E Essential[\s\S]*Add this expense\?/u;

const financialState = async (user: E2EUser) => {
	const accounts = await user.query(api.cli.v1.accounts.list, {
		includeArchived: true,
	});
	return {
		accounts,
		expenses: (await user.query(api.cli.v1.expenses.list, {})).items,
		ledgers: await Promise.all(
			accounts.map(async (account) => ({
				accountId: account.id,
				items: (
					await user.query(api.cli.v1.accounts.listTransactions, {
						accountId: account.id,
					})
				).items,
			}))
		),
	};
};

describe("genuine interactive CLI terminal journeys", () => {
	let config: E2EEnvironment;
	let browser: Browser;
	let context: BrowserContext | undefined;
	let fixtureUser: E2EUser | undefined;
	let seed: Awaited<ReturnType<typeof seedUser>>;
	let terminal: RunningTerminal | undefined;

	const fixture = () => {
		if (!fixtureUser) {
			throw new Error("Interactive CLI user unavailable");
		}
		return fixtureUser;
	};

	const start = (dryRun = false) => {
		terminal = startInteractiveCli(fixture(), [
			"expenses",
			"add",
			"--date",
			seed.date,
			...(dryRun ? ["--dry-run"] : []),
		]);
		return terminal;
	};

	beforeAll(async () => {
		if (process.platform === "win32") {
			throw new Error(
				"Interactive E2E requires POSIX and Python 3; Windows PTY coverage is not implemented"
			);
		}
		config = loadEnvironment();
		await configureClerk(config);
		browser = await chromium.launch();
	});

	beforeEach(async () => {
		fixtureUser = undefined;
		terminal = undefined;
		context = await browser.newContext({ timezoneId: "UTC" });
		fixtureUser = await createUser(await context.newPage(), config);
		seed = await seedUser(fixtureUser);
		await fixtureUser.mutation(api.tags.create, { name: "E2E Essential" });
		await fixtureUser.mutation(api.tags.create, { name: "E2E Optional" });
		await fixtureUser.loginCli();
	});

	afterEach(async () => {
		try {
			// Reap the prompt before fixture cleanup so it cannot write afterward.
			await terminal?.stop();
		} finally {
			try {
				await fixtureUser?.dispose();
			} finally {
				terminal = undefined;
				fixtureUser = undefined;
				await context?.close();
				context = undefined;
			}
		}
	});

	afterAll(async () => {
		await browser?.close();
	});

	it("enters an expense, navigates account/tag selectors and dry-runs without financial writes", async () => {
		const user = fixture();
		const before = await financialState(user);
		const child = start(true);
		await answerAddExpense(
			child,
			before.accounts.map((account) => account.name)
		);
		await child.waitForOutput(patterns.dryRun);
		expect(await child.result).toEqual({ exitCode: 0, signal: null });
		expect(await financialState(user)).toEqual(before);
	});

	it("confirms through the terminal and persists exactly the selected account and tag", async () => {
		const user = fixture();
		const before = await financialState(user);
		const child = start();
		await answerAddExpense(
			child,
			before.accounts.map((account) => account.name)
		);
		await child.waitForOutput(PREVIEW_CONFIRMATION);
		// Clack's real y shortcut submits the confirmation (initially No).
		child.write("y");
		await child.waitForOutput(patterns.success);
		expect(await child.result).toEqual({ exitCode: 0, signal: null });
		const after = await financialState(user);
		expect(after.expenses).toHaveLength(1);
		expect(after.expenses[0]).toMatchObject({
			account: { id: seed.destinationId, name: "E2E Savings" },
			amount: 12.5,
			date: seed.date,
			spentOn: "PTY synthetic purchase",
			tags: [{ name: "E2E Essential" }],
		});
		expect(
			after.accounts.find((account) => account.id === seed.destinationId)
				?.currentBalance
		).toBe(187.5);
		expect(
			after.accounts.find((account) => account.id === seed.accountId)
				?.currentBalance
		).toBe(1000);
		const ledger = after.ledgers.find(
			(entry) => entry.accountId === seed.destinationId
		);
		expect(
			ledger?.items.filter((entry) => entry.type === "expense")
		).toMatchObject([
			{
				amount: -12.5,
				relatedId: after.expenses[0].id,
			},
		]);
	});

	it("declines the real confirmation and leaves expenses, balances and ledgers unchanged", async () => {
		const user = fixture();
		const before = await financialState(user);
		const child = start();
		await answerAddExpense(
			child,
			before.accounts.map((account) => account.name)
		);
		await child.waitForOutput(PREVIEW_CONFIRMATION);
		child.write("n");
		await child.waitForOutput(patterns.cancelled);
		expect(await child.result).toEqual({ exitCode: 0, signal: null });
		expect(await financialState(user)).toEqual(before);
	});

	it.each(["amount", "confirmation"] as const)(
		"handles actual Ctrl+C at %s without financial writes",
		async (stage) => {
			const user = fixture();
			const before = await financialState(user);
			const child = start();
			if (stage === "amount") {
				await child.waitForOutput(patterns.amount);
			} else {
				await answerAddExpense(
					child,
					before.accounts.map((account) => account.name)
				);
				await child.waitForOutput(PREVIEW_CONFIRMATION);
			}
			child.write(terminalKeys.ctrlC);
			await child.waitForOutput(patterns.cancelled);
			expect(await child.result).toEqual({ exitCode: 0, signal: null });
			expect(await financialState(user)).toEqual(before);
		}
	);
});
