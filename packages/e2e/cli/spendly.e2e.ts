import { randomUUID } from "node:crypto";
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
import { z } from "zod";
import { CLI_EXIT_CODE } from "../../../apps/cli/src/errors";
import type { Id, TableNames } from "../../backend/convex/_generated/dataModel";
import { configureClerk } from "../src/authentication";
import { api } from "../src/backend-api";
import { type E2EEnvironment, loadEnvironment } from "../src/environment";
import {
	readExpenseFinancialState,
	seedExpenseCycleBoundary,
	seedExpenseMetadata,
} from "../src/expense-regression";
import { createUser, type E2EUser, seedUser } from "../src/users";

// Black-box wire schemas: do not import CLI operations, clients or action code.
const id = <Table extends TableNames>() =>
	z.custom<Id<Table>>((value) => typeof value === "string" && value.length > 0);
const accountType = z.object({
	balanceNature: z.enum(["asset", "liability"]),
	color: z.string().nullable(),
	icon: z.string().nullable(),
	id: id<"account_types">(),
	name: z.string(),
});
const account = z.object({
	accountType,
	createdAt: z.string(),
	currency: z.string(),
	currentBalance: z.number(),
	id: id<"accounts">(),
	isArchived: z.boolean(),
	isDefault: z.boolean(),
	name: z.string(),
	revision: z.number().int().positive(),
	startingBalance: z.number(),
	updatedAt: z.string(),
});
const cycle = z.object({
	endDateExclusive: z.string(),
	id: id<"expense_cycles">(),
	name: z.string(),
	startDate: z.string(),
});
const expense = z.object({
	account: z
		.object({
			accountType,
			currency: z.string(),
			id: id<"accounts">(),
			name: z.string(),
		})
		.nullable(),
	amount: z.number(),
	category: z.object({ id: id<"categories">(), name: z.string() }).nullable(),
	createdAt: z.string(),
	currency: z.string(),
	cycle: cycle.nullable(),
	date: z.string(),
	id: id<"expenses">(),
	revision: z.number().int().positive(),
	spentOn: z.string().nullable(),
	tags: z.array(z.object({ id: id<"tags">(), name: z.string() })),
});
const effect = z.object({
	accountId: id<"accounts">(),
	accountName: z.string(),
	balanceAfter: z.number(),
	balanceBefore: z.number(),
	currency: z.string(),
	delta: z.number(),
});
const expenseResult = expense.extend({ accountEffects: z.array(effect) });
const expenseCreate = expenseResult.extend({
	accountSource: z.enum(["explicit", "user_default", "none"]),
	categorySource: z.enum(["explicit", "history", "none"]),
});
const expenseProposal = z.object({
	accountEffects: z.array(effect),
	accountId: id<"accounts">().nullable(),
	accountSource: z.enum(["explicit", "user_default", "none"]),
	amount: z.number(),
	categoryId: id<"categories">().nullable(),
	categorySource: z.enum(["explicit", "history", "none"]),
	currency: z.string(),
	cycleId: id<"expense_cycles">().nullable(),
	date: z.string(),
	revision: z.number().int().positive(),
	spentOn: z.string().nullable(),
	tagIds: z.array(id<"tags">()),
});
const transaction = z.object({
	accountId: id<"accounts">(),
	amount: z.number(),
	balanceAfter: z.number(),
	createdAt: z.string(),
	date: z.string(),
	id: id<"account_transactions">(),
	note: z.string().nullable(),
	relatedId: z.string().nullable(),
	type: z.enum([
		"opening_balance",
		"expense",
		"manual_adjustment",
		"transfer_in",
		"transfer_out",
	]),
});
const transferPreview = z.object({
	amount: z.number(),
	currency: z.string(),
	date: z.string(),
	fromAccount: account,
	fromBalanceAfter: z.number(),
	note: z.string().nullable(),
	toAccount: account,
	toBalanceAfter: z.number(),
	warnings: z.array(z.string()),
});
const transferResult = transferPreview
	.omit({
		fromBalanceAfter: true,
		toBalanceAfter: true,
	})
	.extend({
		fromTransaction: transaction,
		id: id<"account_transfers">(),
		toTransaction: transaction,
	});
const adjustmentPreview = z.object({
	account,
	adjustment: z.number(),
	currency: z.string(),
	date: z.string(),
	resultingBalance: z.number(),
	warnings: z.array(z.string()),
});
const pagination = z.object({
	hasMore: z.boolean(),
	nextCursor: z.string().nullable(),
	pageSize: z.number(),
});
const authStatus = z.object({
	authenticated: z.literal(true),
	backendUserId: id<"users">(),
	currency: z.string().nullable(),
	identitySubject: z.string(),
	subjectMatchesBackendUser: z.literal(true),
});

const parse = <Output>(schema: z.ZodType<Output>, value: unknown): Output => {
	const result = schema.safeParse(value);
	if (!result.success) {
		throw new Error("CLI JSON contract mismatch; output withheld.");
	}
	return result.data;
};

const document = (stdout: string): unknown => {
	try {
		// JSON.parse rejects empty output, banners and multiple JSON documents.
		return JSON.parse(stdout);
	} catch {
		throw new Error("CLI stdout was not one JSON document; output withheld.");
	}
};

const success = async <Output>(
	user: E2EUser,
	args: readonly string[],
	schema: z.ZodType<Output>
) => {
	const result = await user.runCli(args);
	if (
		result.exitCode !== CLI_EXIT_CODE.success ||
		result.signal !== null ||
		result.stderr !== ""
	) {
		throw new Error("CLI subprocess did not succeed cleanly; output withheld.");
	}
	return parse(
		z
			.object({
				schemaVersion: z.literal(1),
				data: schema,
				meta: z.record(z.string(), z.unknown()),
			})
			.strict(),
		document(result.stdout)
	);
};

const failure = async (user: E2EUser, args: readonly string[]) => {
	const result = await user.runCli(args);
	if (result.signal !== null || result.stderr !== "") {
		throw new Error(
			"CLI error subprocess did not terminate cleanly; output withheld."
		);
	}
	const envelope = parse(
		z
			.object({
				schemaVersion: z.literal(1),
				error: z
					.object({
						code: z.string(),
						details: z.record(z.string(), z.unknown()),
						message: z.string(),
						retryable: z.boolean(),
					})
					.strict(),
			})
			.strict(),
		document(result.stdout)
	);
	return { ...envelope, exitCode: result.exitCode };
};

const addArgs = (
	seed: Awaited<ReturnType<typeof seedUser>>,
	extra: readonly string[] = []
) => [
	"expenses",
	"add",
	"--amount",
	"25",
	"--date",
	seed.date,
	"--spent-on",
	"Synthetic lunch",
	"--account-id",
	seed.accountId,
	...extra,
];

const addExpense = async (
	user: E2EUser,
	seed: Awaited<ReturnType<typeof seedUser>>
) =>
	(
		await success(
			user,
			addArgs(seed, ["--idempotency-key", randomUUID()]),
			expenseCreate
		)
	).data;

const walletEffect = (
	seed: Awaited<ReturnType<typeof seedUser>>,
	before: number,
	after: number
) => ({
	accountId: seed.accountId,
	accountName: "E2E Wallet",
	balanceBefore: before,
	balanceAfter: after,
	currency: "USD",
	delta: after - before,
});

describe("live CLI subprocess contract", () => {
	let config: E2EEnvironment;
	let browser: Browser;
	let context: BrowserContext | undefined;
	let user: E2EUser | undefined;
	let seed: Awaited<ReturnType<typeof seedUser>>;

	const fixture = () => {
		if (!user) {
			throw new Error("Live CLI user fixture is unavailable");
		}
		return { user, seed };
	};

	beforeAll(async () => {
		config = loadEnvironment();
		await configureClerk(config);
		browser = await chromium.launch();
	});

	beforeEach(async () => {
		user = undefined;
		context = await browser.newContext({ timezoneId: "UTC" });
		user = await createUser(await context.newPage(), config);
		seed = await seedUser(user);
		await user.loginCli();
	});

	afterEach(async () => {
		try {
			await user?.dispose();
		} finally {
			user = undefined;
			await context?.close();
			context = undefined;
		}
	});

	afterAll(async () => {
		await browser?.close();
	});

	it("adds, reads, replaces and clears populated expense metadata with exact financial effects @smoke", async () => {
		const { user, seed } = fixture();
		const metadata = await seedExpenseMetadata(user, seed.cycleId);
		const categories = await success(
			user,
			["categories", "list", "--cycle-id", seed.cycleId],
			z.array(
				z.object({
					id: id<"categories">(),
					name: z.string(),
					cycleId: id<"expense_cycles">(),
				})
			)
		);
		expect(categories.data).toEqual([
			{ id: metadata.meals._id, name: "E2E Meals", cycleId: seed.cycleId },
			{ id: metadata.travel._id, name: "E2E Travel", cycleId: seed.cycleId },
		]);
		const tags = await success(
			user,
			["tags", "list"],
			z.array(z.object({ id: id<"tags">(), name: z.string() }))
		);
		expect(tags.data).toEqual([
			{ id: metadata.personalId, name: "E2E Personal" },
			{ id: metadata.workId, name: "E2E Work" },
		]);
		const created = (
			await success(
				user,
				addArgs(seed, [
					"--category-id",
					metadata.meals._id,
					"--tag-id",
					metadata.workId,
					"--tag-id",
					metadata.personalId,
					"--idempotency-key",
					randomUUID(),
				]),
				expenseCreate
			)
		).data;
		expect(created).toMatchObject({
			amount: 25,
			date: seed.date,
			spentOn: "Synthetic lunch",
			currency: "USD",
			revision: 1,
			account: { id: seed.accountId },
			accountSource: "explicit",
			category: { id: metadata.meals._id, name: "E2E Meals" },
			categorySource: "explicit",
			cycle: { id: seed.cycleId },
			tags: [
				{ id: metadata.workId, name: "E2E Work" },
				{ id: metadata.personalId, name: "E2E Personal" },
			],
			accountEffects: [walletEffect(seed, 1000, 975)],
		});
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, created));
		expect(
			(await success(user, ["expenses", "get", created.id], expense)).data
		).toEqual(parse(expense, created));
		expect(
			(
				await success(
					user,
					[
						"expenses",
						"list",
						"--category-id",
						metadata.meals._id,
						"--tag-id",
						metadata.workId,
					],
					expense.array()
				)
			).data
		).toEqual([parse(expense, created)]);
		const edited = await success(
			user,
			[
				"expenses",
				"edit",
				created.id,
				"--amount",
				"40",
				"--clear-spent-on",
				"--category-id",
				metadata.travel._id,
				"--tag-id",
				metadata.personalId,
				"--if-revision",
				"1",
				"--idempotency-key",
				randomUUID(),
			],
			expenseResult
		);
		expect(edited.data).toMatchObject({
			id: created.id,
			amount: 40,
			revision: 2,
			spentOn: null,
			category: { id: metadata.travel._id, name: "E2E Travel" },
			tags: [{ id: metadata.personalId, name: "E2E Personal" }],
		});
		expect(edited.data.accountEffects).toEqual([walletEffect(seed, 975, 960)]);
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, edited.data));
		expect(
			(await success(user, ["expenses", "get", created.id], expense)).data
		).toEqual(parse(expense, edited.data));
		expect(
			await user.query(api.accounts.get, { accountId: seed.accountId })
		).toMatchObject({ currentBalance: 960 });
		const ledger = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.accountId,
		});
		expect(
			ledger.items
				.filter((entry) => entry.relatedId === created.id)
				.map((entry) => entry.amount)
				.sort((a, b) => a - b)
		).toEqual([-25, -15]);
		const beforeClear = await readExpenseFinancialState(user, seed);
		const clearArgs = [
			"expenses",
			"edit",
			created.id,
			"--clear-category",
			"--clear-tags",
			"--if-revision",
			"2",
			"--idempotency-key",
			randomUUID(),
		];
		const cleared = await success(user, clearArgs, expenseResult);
		expect(cleared.data).toMatchObject({
			id: created.id,
			amount: 40,
			revision: 3,
			category: null,
			tags: [],
			accountEffects: [],
		});
		expect((await success(user, clearArgs, expenseResult)).data).toEqual(
			cleared.data
		);
		const read = await success(user, ["expenses", "get", created.id], expense);
		expect(read.data).toEqual(parse(expense, cleared.data));
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(read.data);
		expect(
			(
				await success(
					user,
					["expenses", "list", "--category-id", metadata.travel._id],
					expense.array()
				)
			).data
		).toEqual([]);
		expect(
			(
				await success(
					user,
					["expenses", "list", "--tag-id", metadata.personalId],
					expense.array()
				)
			).data
		).toEqual([]);
		expect(await readExpenseFinancialState(user, seed)).toEqual(beforeClear);
	});

	it("commits an account switch and clearing, replaying each without double debits or refunds", async () => {
		const { user, seed } = fixture();
		const opening = await readExpenseFinancialState(user, seed);
		const created = await addExpense(user, seed);
		const beforeMove = await readExpenseFinancialState(user, seed);
		expect(beforeMove.wallet.currentBalance).toBe(975);
		expect(beforeMove.savings).toEqual(opening.savings);
		expect(beforeMove.savingsLedger).toEqual(opening.savingsLedger);
		expect(beforeMove.walletLedger).toHaveLength(
			opening.walletLedger.length + 1
		);
		expect(beforeMove.walletLedger.slice(1)).toEqual(opening.walletLedger);
		const moveArgs = [
			"expenses",
			"edit",
			created.id,
			"--account-id",
			seed.destinationId,
			"--if-revision",
			"1",
			"--idempotency-key",
			randomUUID(),
		];
		const moved = await success(user, moveArgs, expenseResult);
		expect(moved.data).toMatchObject({
			id: created.id,
			amount: 25,
			revision: 2,
			account: { id: seed.destinationId },
		});
		expect(moved.data.accountEffects).toEqual([
			walletEffect(seed, 975, 1000),
			{
				accountId: seed.destinationId,
				accountName: "E2E Savings",
				currency: "USD",
				balanceBefore: 200,
				balanceAfter: 175,
				delta: -25,
			},
		]);
		const afterMove = await readExpenseFinancialState(user, seed);
		expect(afterMove.wallet).toMatchObject({
			currentBalance: 1000,
			revision: beforeMove.wallet.revision + 1,
		});
		expect(afterMove.savings).toMatchObject({
			currentBalance: 175,
			revision: beforeMove.savings.revision + 1,
		});
		expect(afterMove.walletLedger).toHaveLength(
			beforeMove.walletLedger.length + 1
		);
		expect(afterMove.walletLedger[0]).toMatchObject({
			accountId: seed.accountId,
			expenseId: created.id,
			amount: 25,
			balanceAfter: 1000,
			type: "expense",
			source: "cli",
			date: seed.date,
		});
		expect(afterMove.walletLedger.slice(1)).toEqual(beforeMove.walletLedger);
		expect(afterMove.savingsLedger).toHaveLength(
			beforeMove.savingsLedger.length + 1
		);
		expect(afterMove.savingsLedger[0]).toMatchObject({
			accountId: seed.destinationId,
			expenseId: created.id,
			amount: -25,
			balanceAfter: 175,
			type: "expense",
			source: "cli",
			date: seed.date,
		});
		expect(afterMove.savingsLedger.slice(1)).toEqual(beforeMove.savingsLedger);
		expect((await success(user, moveArgs, expenseResult)).data).toEqual(
			moved.data
		);
		expect(await readExpenseFinancialState(user, seed)).toEqual(afterMove);
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, moved.data));

		const clearArgs = [
			"expenses",
			"edit",
			created.id,
			"--clear-account",
			"--if-revision",
			"2",
			"--idempotency-key",
			randomUUID(),
		];
		const cleared = await success(user, clearArgs, expenseResult);
		expect(cleared.data).toMatchObject({
			id: created.id,
			amount: 25,
			revision: 3,
			account: null,
		});
		expect(cleared.data.accountEffects).toEqual([
			{
				accountId: seed.destinationId,
				accountName: "E2E Savings",
				currency: "USD",
				balanceBefore: 175,
				balanceAfter: 200,
				delta: 25,
			},
		]);
		const afterClear = await readExpenseFinancialState(user, seed);
		expect(afterClear.wallet).toEqual(afterMove.wallet);
		expect(afterClear.walletLedger).toEqual(afterMove.walletLedger);
		expect(afterClear.savings).toMatchObject({
			currentBalance: 200,
			revision: afterMove.savings.revision + 1,
		});
		expect(afterClear.savingsLedger).toHaveLength(
			afterMove.savingsLedger.length + 1
		);
		expect(afterClear.savingsLedger[0]).toMatchObject({
			accountId: seed.destinationId,
			expenseId: created.id,
			amount: 25,
			balanceAfter: 200,
			type: "expense",
			source: "cli",
			date: seed.date,
		});
		expect(afterClear.savingsLedger.slice(1)).toEqual(afterMove.savingsLedger);
		expect((await success(user, clearArgs, expenseResult)).data).toEqual(
			cleared.data
		);
		expect(await readExpenseFinancialState(user, seed)).toEqual(afterClear);
		expect(
			(await success(user, ["expenses", "get", created.id], expense)).data
		).toEqual(parse(expense, cleared.data));
		const clearAgain = await success(
			user,
			[
				"expenses",
				"edit",
				created.id,
				"--clear-account",
				"--if-revision",
				"3",
				"--idempotency-key",
				randomUUID(),
			],
			expenseResult
		);
		expect(clearAgain.data).toMatchObject({
			account: null,
			revision: 4,
			accountEffects: [],
		});
		expect(await readExpenseFinancialState(user, seed)).toEqual(afterClear);
		expect(
			(await success(user, ["expenses", "list"], expense.array())).data
		).toEqual([parse(expense, clearAgain.data)]);
	});

	it("rejects a cross-cycle date edit, retries with an explicit category reset, and reselects the new cycle category", async () => {
		const { user, seed } = fixture();
		const { boundary, nextCycle, oldCategory, newCategory } =
			await seedExpenseCycleBoundary(user, seed);
		const created = (
			await success(
				user,
				addArgs(seed, [
					"--category-id",
					oldCategory._id,
					"--idempotency-key",
					randomUUID(),
				]),
				expenseCreate
			)
		).data;
		expect(created).toMatchObject({
			date: seed.date,
			category: { id: oldCategory._id },
			cycle: { id: seed.cycleId },
		});
		const before = await readExpenseFinancialState(user, seed);
		expect(
			(await success(user, ["cycles", "current", "--date", seed.date], cycle))
				.data.id
		).toBe(seed.cycleId);
		expect(
			(await success(user, ["cycles", "current", "--date", boundary], cycle))
				.data.id
		).toBe(nextCycle._id);
		const rejected = await failure(user, [
			"expenses",
			"edit",
			created.id,
			"--date",
			boundary,
			"--if-revision",
			"1",
			"--idempotency-key",
			randomUUID(),
		]);
		expect(rejected).toMatchObject({
			exitCode: CLI_EXIT_CODE.conflict,
			error: {
				code: "CATEGORY_CYCLE_MISMATCH",
				retryable: false,
				details: {
					category: { id: oldCategory._id, name: oldCategory.name },
					oldCycle: { id: seed.cycleId, endDateExclusive: boundary },
					newCycle: { id: nextCycle._id, startDate: boundary },
					candidates: [{ id: newCategory._id, name: newCategory.name }],
				},
			},
		});
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, created));
		expect(await readExpenseFinancialState(user, seed)).toEqual(before);
		const resetArgs = [
			"expenses",
			"edit",
			created.id,
			"--date",
			boundary,
			"--clear-category",
			"--if-revision",
			"1",
			"--idempotency-key",
			randomUUID(),
		];
		const reset = await success(user, resetArgs, expenseResult);
		expect(reset.data).toMatchObject({
			date: boundary,
			category: null,
			cycle: { id: nextCycle._id, startDate: boundary },
			revision: 2,
			accountEffects: [],
		});
		expect((await success(user, resetArgs, expenseResult)).data).toEqual(
			reset.data
		);
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, reset.data));
		expect(
			(
				await success(
					user,
					["expenses", "list", "--cycle-id", seed.cycleId],
					expense.array()
				)
			).data
		).toEqual([]);
		expect(
			(
				await success(
					user,
					["expenses", "list", "--cycle-id", nextCycle._id],
					expense.array()
				)
			).data
		).toEqual([parse(expense, reset.data)]);
		expect(await readExpenseFinancialState(user, seed)).toEqual(before);
		const reselectArgs = [
			"expenses",
			"edit",
			created.id,
			"--category-id",
			newCategory._id,
			"--if-revision",
			"2",
			"--idempotency-key",
			randomUUID(),
		];
		const reselected = await success(user, reselectArgs, expenseResult);
		expect(reselected.data).toMatchObject({
			date: boundary,
			cycle: { id: nextCycle._id },
			category: { id: newCategory._id, name: newCategory.name },
			revision: 3,
			accountEffects: [],
		});
		expect((await success(user, reselectArgs, expenseResult)).data).toEqual(
			reselected.data
		);
		expect(
			(await success(user, ["expenses", "get", created.id], expense)).data
		).toEqual(parse(expense, reselected.data));
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, reselected.data));
		expect(await readExpenseFinancialState(user, seed)).toEqual(before);
	});

	it("previews expense creation and editing without changing persisted financial state", async () => {
		const { user, seed } = fixture();
		const before = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.accountId,
		});
		const proposal = await success(
			user,
			addArgs(seed, ["--dry-run"]),
			expenseProposal
		);
		expect(proposal.meta).toMatchObject({
			dryRun: true,
			date: seed.date,
			dateSource: "explicit",
		});
		expect(proposal.data).toEqual({
			accountEffects: [walletEffect(seed, 1000, 975)],
			accountId: seed.accountId,
			accountSource: "explicit",
			amount: 25,
			categoryId: null,
			categorySource: "none",
			currency: "USD",
			cycleId: seed.cycleId,
			date: seed.date,
			revision: 1,
			spentOn: "Synthetic lunch",
			tagIds: [],
		});
		expect((await user.query(api.cli.v1.expenses.list, {})).items).toEqual([]);
		expect(
			await user.query(api.cli.v1.accounts.listTransactions, {
				accountId: seed.accountId,
			})
		).toEqual(before);
		const created = await addExpense(user, seed);
		const beforeEdit = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.accountId,
		});
		const preview = await success(
			user,
			[
				"expenses",
				"edit",
				created.id,
				"--clear-account",
				"--if-revision",
				"1",
				"--dry-run",
			],
			z.object({
				before: expense,
				after: expense,
				accountEffects: z.array(effect),
			})
		);
		expect(preview.meta).toMatchObject({ dryRun: true, expectedRevision: 1 });
		expect(preview.data.before).toEqual(parse(expense, created));
		expect(preview.data.after).toMatchObject({
			id: created.id,
			account: null,
			revision: 2,
			amount: 25,
		});
		expect(preview.data.accountEffects).toEqual([
			walletEffect(seed, 975, 1000),
		]);
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, created));
		expect(
			await user.query(api.accounts.get, { accountId: seed.accountId })
		).toMatchObject({ currentBalance: 975 });
		expect(
			await user.query(api.cli.v1.accounts.listTransactions, {
				accountId: seed.accountId,
			})
		).toEqual(beforeEdit);
	});

	it("requires deletion confirmation, then deletes and refunds exactly once @smoke", async () => {
		const { user, seed } = fixture();
		const created = await addExpense(user, seed);
		const rejected = await failure(user, [
			"expenses",
			"delete",
			created.id,
			"--idempotency-key",
			randomUUID(),
		]);
		expect(rejected).toMatchObject({
			exitCode: CLI_EXIT_CODE.invalidInput,
			error: { code: "NON_INTERACTIVE_INPUT_REQUIRED", retryable: false },
		});
		const preview = await success(
			user,
			["expenses", "delete", created.id, "--dry-run"],
			z.object({
				accountEffects: z.array(effect),
				confirmationToken: z.string().min(1),
				expiresAt: z.string(),
				expense,
				revision: z.number(),
			})
		);
		expect(preview.meta).toMatchObject({ dryRun: true });
		expect(preview.data.expense).toEqual(parse(expense, created));
		expect(preview.data.revision).toBe(1);
		expect(preview.data.accountEffects).toEqual([
			walletEffect(seed, 975, 1000),
		]);
		expect(Number.isFinite(Date.parse(preview.data.expiresAt))).toBe(true);
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(parse(expense, created));
		expect(
			await user.query(api.accounts.get, { accountId: seed.accountId })
		).toMatchObject({ currentBalance: 975 });
		const args = [
			"expenses",
			"delete",
			created.id,
			"--confirmation-token",
			preview.data.confirmationToken,
			"--if-revision",
			"1",
			"--idempotency-key",
			randomUUID(),
		];
		const schema = z.object({
			accountEffects: z.array(effect),
			deleted: z.literal(true),
			expense,
		});
		const removed = await success(user, args, schema);
		expect(removed.data).toEqual({
			accountEffects: [walletEffect(seed, 975, 1000)],
			deleted: true,
			expense: parse(expense, created),
		});
		expect((await success(user, args, schema)).data).toEqual(removed.data);
		expect((await user.query(api.cli.v1.expenses.list, {})).items).toEqual([]);
		expect(
			await user.query(api.accounts.get, { accountId: seed.accountId })
		).toMatchObject({ currentBalance: 1000 });
		const ledger = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.accountId,
		});
		expect(
			ledger.items
				.filter((entry) => entry.relatedId === created.id)
				.map((entry) => entry.amount)
				.sort((a, b) => a - b)
		).toEqual([-25, 25]);
		expect(await failure(user, ["expenses", "get", created.id])).toMatchObject({
			exitCode: CLI_EXIT_CODE.notFound,
			error: { code: "RESOURCE_NOT_FOUND" },
		});
	});

	it("replays an idempotent add across subprocesses and rejects changed payloads", async () => {
		const { user, seed } = fixture();
		const key = randomUUID();
		const args = addArgs(seed, ["--idempotency-key", key]);
		const first = await success(user, args, expenseCreate);
		const replay = await success(user, args, expenseCreate);
		expect(replay.data).toEqual(first.data);
		expect(replay.meta).toMatchObject({ dryRun: false, idempotencyKey: key });
		const conflict = await failure(user, [
			"expenses",
			"add",
			"--amount",
			"26",
			"--date",
			seed.date,
			"--spent-on",
			"Synthetic lunch",
			"--account-id",
			seed.accountId,
			"--idempotency-key",
			key,
		]);
		expect(conflict).toMatchObject({
			exitCode: CLI_EXIT_CODE.conflict,
			error: { code: "IDEMPOTENCY_CONFLICT", details: {}, retryable: false },
		});
		expect((await user.query(api.cli.v1.expenses.list, {})).items).toEqual([
			parse(expense, first.data),
		]);
		expect(
			await user.query(api.accounts.get, { accountId: seed.accountId })
		).toMatchObject({ currentBalance: 975 });
		const ledger = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.accountId,
		});
		expect(
			ledger.items.filter((entry) => entry.relatedId === first.data.id)
		).toHaveLength(1);
	});

	it("rejects stale expense and account revisions without another write", async () => {
		const { user, seed } = fixture();
		const created = await addExpense(user, seed);
		const edited = await success(
			user,
			[
				"expenses",
				"edit",
				created.id,
				"--amount",
				"30",
				"--if-revision",
				"1",
				"--idempotency-key",
				randomUUID(),
			],
			expenseResult
		);
		expect(edited.data).toMatchObject({ amount: 30, revision: 2 });
		const editedExpense = parse(expense, edited.data);
		const ledgerBeforeConflicts = await user.query(
			api.cli.v1.accounts.listTransactions,
			{
				accountId: seed.accountId,
			}
		);
		expect(
			await failure(user, [
				"expenses",
				"edit",
				created.id,
				"--amount",
				"99",
				"--if-revision",
				"1",
				"--idempotency-key",
				randomUUID(),
			])
		).toMatchObject({
			exitCode: CLI_EXIT_CODE.conflict,
			error: {
				code: "EXPENSE_REVISION_CONFLICT",
				details: { expectedRevision: 1 },
				retryable: false,
			},
		});
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual(editedExpense);
		const current = await user.query(api.cli.v1.accounts.get, {
			accountId: seed.accountId,
		});
		const renamed = await success(
			user,
			[
				"accounts",
				"edit",
				seed.accountId,
				"--name",
				"Synthetic renamed wallet",
				"--if-revision",
				String(current.revision),
				"--idempotency-key",
				randomUUID(),
			],
			account
		);
		expect(renamed.data).toMatchObject({
			name: "Synthetic renamed wallet",
			revision: current.revision + 1,
		});
		expect(
			await failure(user, [
				"accounts",
				"archive",
				seed.accountId,
				"--if-revision",
				String(current.revision),
				"--idempotency-key",
				randomUUID(),
			])
		).toMatchObject({
			exitCode: CLI_EXIT_CODE.conflict,
			error: {
				code: "ACCOUNT_REVISION_CONFLICT",
				details: { expectedRevision: current.revision, lifecycle: "archive" },
				retryable: false,
			},
		});
		expect(
			await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
		).toEqual({
			...editedExpense,
			// Account metadata is joined at read time; only the intended rename changes.
			account: { ...editedExpense.account, name: "Synthetic renamed wallet" },
		});
		expect(
			await user.query(api.cli.v1.accounts.listTransactions, {
				accountId: seed.accountId,
			})
		).toEqual(ledgerBeforeConflicts);
		expect(
			await user.query(api.cli.v1.accounts.get, { accountId: seed.accountId })
		).toEqual(renamed.data);
		expect(renamed.data.currentBalance).toBe(970);
	});

	it("creates, renames, defaults, archives and reactivates an account while preserving its ledger @smoke", async () => {
		const { user, seed } = fixture();
		const args = [
			"accounts",
			"add",
			"--name",
			"Synthetic travel",
			"--starting-balance",
			"50",
			"--account-type-id",
			seed.assetTypeId,
			"--date",
			seed.date,
		];
		const proposal = await success(
			user,
			[...args, "--dry-run"],
			z.object({
				accountType,
				currency: z.string(),
				currentBalance: z.number(),
				date: z.string(),
				name: z.string(),
				revision: z.number(),
				startingBalance: z.number(),
			})
		);
		expect(proposal.data).toMatchObject({
			name: "Synthetic travel",
			startingBalance: 50,
			currentBalance: 50,
			currency: "USD",
			date: seed.date,
			revision: 1,
			accountType: { id: seed.assetTypeId },
		});
		expect(await user.query(api.cli.v1.accounts.list, {})).toHaveLength(2);
		const created = await success(
			user,
			[...args, "--idempotency-key", randomUUID()],
			account.extend({ openingTransaction: transaction })
		);
		expect(created.data).toMatchObject({
			name: "Synthetic travel",
			currentBalance: 50,
			startingBalance: 50,
			isArchived: false,
			isDefault: false,
			revision: 1,
		});
		expect(created.data.openingTransaction).toMatchObject({
			accountId: created.data.id,
			amount: 50,
			balanceAfter: 50,
			date: seed.date,
			type: "opening_balance",
		});
		const edited = await success(
			user,
			[
				"accounts",
				"edit",
				created.data.id,
				"--name",
				"Synthetic travel renamed",
				"--if-revision",
				"1",
				"--idempotency-key",
				randomUUID(),
			],
			account
		);
		expect(edited.data).toMatchObject({
			id: created.data.id,
			name: "Synthetic travel renamed",
			revision: 2,
		});
		const madeDefault = await success(
			user,
			[
				"accounts",
				"set-default",
				created.data.id,
				"--if-revision",
				String(edited.data.revision),
				"--idempotency-key",
				randomUUID(),
			],
			account
		);
		expect(madeDefault.data.isDefault).toBe(true);
		expect((await user.query(api.users.get, {})).defaultAccountId).toBe(
			created.data.id
		);
		expect(
			(await user.query(api.cli.v1.accounts.list, {}))
				.filter((entry) => entry.isDefault)
				.map((entry) => entry.id)
		).toEqual([created.data.id]);
		const archived = await success(
			user,
			[
				"accounts",
				"archive",
				created.data.id,
				"--if-revision",
				String(madeDefault.data.revision),
				"--idempotency-key",
				randomUUID(),
			],
			account
		);
		expect(archived.data).toMatchObject({
			isArchived: true,
			isDefault: false,
			currentBalance: 50,
		});
		expect(
			(await user.query(api.users.get, {})).defaultAccountId
		).toBeUndefined();
		const active = await success(user, ["accounts", "list"], account.array());
		expect(active.data.map((entry) => entry.id)).not.toContain(created.data.id);
		const all = await success(
			user,
			["accounts", "list", "--include-archived"],
			account.array()
		);
		expect(all.data.find((entry) => entry.id === created.data.id)).toEqual(
			archived.data
		);
		const restored = await success(
			user,
			[
				"accounts",
				"reactivate",
				created.data.id,
				"--if-revision",
				String(archived.data.revision),
				"--idempotency-key",
				randomUUID(),
			],
			account
		);
		expect(restored.data).toMatchObject({
			isArchived: false,
			isDefault: false,
			currentBalance: 50,
			name: "Synthetic travel renamed",
		});
		expect(
			await user.query(api.cli.v1.accounts.get, { accountId: created.data.id })
		).toEqual(restored.data);
		expect(
			(
				await user.query(api.cli.v1.accounts.listTransactions, {
					accountId: created.data.id,
				})
			).items
		).toEqual([created.data.openingTransaction]);
	});

	it("previews and commits an atomic transfer, replaying without duplicate ledger entries @smoke", async () => {
		const { user, seed } = fixture();
		const from = await user.query(api.cli.v1.accounts.get, {
			accountId: seed.accountId,
		});
		const to = await user.query(api.cli.v1.accounts.get, {
			accountId: seed.destinationId,
		});
		const beforeFrom = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.accountId,
		});
		const beforeTo = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.destinationId,
		});
		const args = [
			"accounts",
			"transfer",
			"--amount",
			"125",
			"--from-account-id",
			seed.accountId,
			"--to-account-id",
			seed.destinationId,
			"--if-from-revision",
			String(from.revision),
			"--if-to-revision",
			String(to.revision),
			"--date",
			seed.date,
			"--note",
			"Synthetic move",
		];
		const preview = await success(
			user,
			[...args, "--dry-run"],
			transferPreview
		);
		expect(preview.data).toMatchObject({
			amount: 125,
			currency: "USD",
			date: seed.date,
			fromBalanceAfter: 875,
			toBalanceAfter: 325,
			note: "Synthetic move",
			warnings: [],
		});
		expect(preview.data.fromAccount).toEqual(from);
		expect(preview.data.toAccount).toEqual(to);
		expect(
			await user.query(api.cli.v1.accounts.listTransactions, {
				accountId: seed.accountId,
			})
		).toEqual(beforeFrom);
		expect(
			await user.query(api.cli.v1.accounts.listTransactions, {
				accountId: seed.destinationId,
			})
		).toEqual(beforeTo);
		const commit = [...args, "--idempotency-key", randomUUID()];
		const result = await success(user, commit, transferResult);
		expect(result.data).toMatchObject({
			amount: 125,
			currency: "USD",
			date: seed.date,
			note: "Synthetic move",
			warnings: [],
		});
		expect((await success(user, commit, transferResult)).data).toEqual(
			result.data
		);
		expect(result.data.fromAccount).toMatchObject({
			id: seed.accountId,
			currentBalance: 875,
			revision: from.revision + 1,
		});
		expect(result.data.toAccount).toMatchObject({
			id: seed.destinationId,
			currentBalance: 325,
			revision: to.revision + 1,
		});
		expect(result.data.fromTransaction).toMatchObject({
			accountId: seed.accountId,
			amount: -125,
			balanceAfter: 875,
			type: "transfer_out",
			relatedId: result.data.id,
			date: seed.date,
			note: "Synthetic move",
		});
		expect(result.data.toTransaction).toMatchObject({
			accountId: seed.destinationId,
			amount: 125,
			balanceAfter: 325,
			type: "transfer_in",
			relatedId: result.data.id,
			date: seed.date,
			note: "Synthetic move",
		});
		expect(
			await user.query(api.cli.v1.accounts.get, { accountId: seed.accountId })
		).toEqual(result.data.fromAccount);
		expect(
			await user.query(api.cli.v1.accounts.get, {
				accountId: seed.destinationId,
			})
		).toEqual(result.data.toAccount);
		expect(
			(
				await user.query(api.cli.v1.accounts.listTransactions, {
					accountId: seed.accountId,
				})
			).items
		).toEqual([result.data.fromTransaction, ...beforeFrom.items]);
		expect(
			(
				await user.query(api.cli.v1.accounts.listTransactions, {
					accountId: seed.destinationId,
				})
			).items
		).toEqual([result.data.toTransaction, ...beforeTo.items]);
	});

	it("adjusts to an absolute negative balance with a warning and one persisted adjustment", async () => {
		const { user, seed } = fixture();
		const current = await user.query(api.cli.v1.accounts.get, {
			accountId: seed.accountId,
		});
		const before = await user.query(api.cli.v1.accounts.listTransactions, {
			accountId: seed.accountId,
		});
		const args = [
			"accounts",
			"adjust-balance",
			seed.accountId,
			"--balance",
			"-50",
			"--if-revision",
			String(current.revision),
			"--date",
			seed.date,
			"--note",
			"Synthetic reconciliation",
		];
		const preview = await success(
			user,
			[...args, "--dry-run"],
			adjustmentPreview
		);
		expect(preview.data).toEqual({
			account: current,
			adjustment: -1050,
			currency: "USD",
			date: seed.date,
			resultingBalance: -50,
			warnings: ["NEGATIVE_BALANCE"],
		});
		expect(
			await user.query(api.cli.v1.accounts.get, { accountId: seed.accountId })
		).toEqual(current);
		expect(
			await user.query(api.cli.v1.accounts.listTransactions, {
				accountId: seed.accountId,
			})
		).toEqual(before);
		const commit = [...args, "--idempotency-key", randomUUID()];
		const schema = adjustmentPreview.extend({ transaction });
		const result = await success(user, commit, schema);
		expect((await success(user, commit, schema)).data).toEqual(result.data);
		expect(result.data).toMatchObject({
			adjustment: -1050,
			resultingBalance: -50,
			warnings: ["NEGATIVE_BALANCE"],
			account: { currentBalance: -50, revision: current.revision + 1 },
		});
		expect(result.data.transaction).toMatchObject({
			accountId: seed.accountId,
			amount: -1050,
			balanceAfter: -50,
			type: "manual_adjustment",
			date: seed.date,
			note: "Synthetic reconciliation",
			relatedId: null,
		});
		expect(
			await user.query(api.cli.v1.accounts.get, { accountId: seed.accountId })
		).toEqual(result.data.account);
		const ledger = await success(
			user,
			["accounts", "transactions", seed.accountId, "--limit", "1"],
			transaction.array()
		);
		expect(ledger.data).toEqual([result.data.transaction]);
		const page = parse(pagination, ledger.meta);
		expect(page).toMatchObject({ hasMore: true, pageSize: 1 });
		expect(page.nextCursor).toEqual(expect.any(String));
		if (!page.nextCursor) {
			throw new Error("Expected ledger continuation cursor");
		}
		const entries = [...ledger.data];
		const seenCursors = new Set<string>();
		let cursor: string = page.nextCursor;
		let exhausted = false;
		// Convex can return a terminal empty page after a full page of results.
		const maximumContinuationPages = 3;
		for (
			let pageNumber = 0;
			pageNumber < maximumContinuationPages;
			pageNumber += 1
		) {
			if (seenCursors.has(cursor)) {
				throw new Error("Ledger pagination failed to advance");
			}
			seenCursors.add(cursor);
			const next = await success(
				user,
				[
					"accounts",
					"transactions",
					seed.accountId,
					"--limit",
					"1",
					"--cursor",
					cursor,
				],
				transaction.array()
			);
			expect(next.data.length).toBeLessThanOrEqual(1);
			entries.push(...next.data);
			const meta = parse(pagination, next.meta);
			expect(meta.pageSize).toBe(1);
			if (!meta.hasMore) {
				expect(meta.nextCursor).toBeNull();
				exhausted = true;
				break;
			}
			if (!meta.nextCursor) {
				throw new Error("Expected ledger continuation cursor");
			}
			cursor = meta.nextCursor;
		}
		expect(exhausted).toBe(true);
		expect(entries).toEqual([result.data.transaction, ...before.items]);
		expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
		expect(
			(
				await user.query(api.cli.v1.accounts.listTransactions, {
					accountId: seed.accountId,
				})
			).items
		).toHaveLength(before.items.length + 1);
	});

	it("reads context and resources, uses the default account, and filters/paginates unassigned expenses", async () => {
		const { user, seed } = fixture();
		const contextResult = await success(
			user,
			["context", "--date", seed.date],
			z.object({
				accounts: account.array(),
				accountsOnboardingStatus: z.string(),
				currency: z.string(),
				currentCycle: cycle.nullable(),
				dateSource: z.string(),
				effectiveDate: z.string(),
				totals: z.array(z.object({ currency: z.string(), total: z.number() })),
			})
		);
		expect(contextResult.data).toMatchObject({
			accountsOnboardingStatus: "completed",
			currency: "USD",
			currentCycle: { id: seed.cycleId },
			dateSource: "explicit",
			effectiveDate: seed.date,
			totals: [{ currency: "USD", total: 1200 }],
		});
		expect(
			contextResult.data.accounts.find((entry) => entry.id === seed.accountId)
		).toMatchObject({ isDefault: true, currentBalance: 1000 });
		const cycles = await success(user, ["cycles", "list"], cycle.array());
		expect(cycles.data.map((entry) => entry.id)).toEqual([seed.cycleId]);
		expect(
			(await success(user, ["cycles", "current", "--date", seed.date], cycle))
				.data
		).toEqual(cycles.data[0]);
		expect(
			(
				await success(
					user,
					["categories", "list", "--cycle-id", seed.cycleId],
					z.array(z.unknown())
				)
			).data
		).toEqual([]);
		expect(
			(await success(user, ["tags", "list"], z.array(z.unknown()))).data
		).toEqual([]);
		const defaulted = await success(
			user,
			[
				"expenses",
				"add",
				"--amount",
				"10",
				"--date",
				seed.date,
				"--idempotency-key",
				randomUUID(),
			],
			expenseCreate
		);
		expect(defaulted.data).toMatchObject({
			account: { id: seed.accountId },
			accountSource: "user_default",
			amount: 10,
		});
		expect(defaulted.data.accountEffects).toEqual([
			walletEffect(seed, 1000, 990),
		]);
		const unassignedIds: Id<"expenses">[] = [];
		for (const amount of [20, 30]) {
			const added = await success(
				user,
				[
					"expenses",
					"add",
					"--amount",
					String(amount),
					"--date",
					seed.date,
					"--without-account",
					"--idempotency-key",
					randomUUID(),
				],
				expenseCreate
			);
			expect(added.data).toMatchObject({
				account: null,
				accountSource: "none",
				category: null,
				amount,
				accountEffects: [],
			});
			unassignedIds.push(added.data.id);
		}
		const filters = [
			"expenses",
			"list",
			"--cycle-id",
			seed.cycleId,
			"--from",
			seed.date,
			"--to",
			seed.date,
			"--unassigned",
			"--uncategorized",
			"--limit",
			"1",
		];
		// Backend filters run after pagination; follow even empty pages.
		let cursor: string | null = null;
		const seenCursors = new Set<string>();
		const seenIds: Id<"expenses">[] = [];
		let exhausted = false;
		const maximumPages = 4;
		for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
			const page = await success(
				user,
				[...filters, ...(cursor ? ["--cursor", cursor] : [])],
				expense.array()
			);
			const meta: z.infer<typeof pagination> = parse(pagination, page.meta);
			expect(meta.pageSize).toBe(1);
			for (const entry of page.data) {
				expect(entry).toMatchObject({
					account: null,
					category: null,
					date: seed.date,
					cycle: { id: seed.cycleId },
				});
				seenIds.push(entry.id);
			}
			if (!meta.hasMore) {
				exhausted = true;
				expect(meta.nextCursor).toBeNull();
				break;
			}
			expect(meta.nextCursor).toEqual(expect.any(String));
			if (!meta.nextCursor || seenCursors.has(meta.nextCursor)) {
				throw new Error("Expense pagination failed to advance");
			}
			seenCursors.add(meta.nextCursor);
			cursor = meta.nextCursor;
		}
		expect(exhausted).toBe(true);
		expect(seenIds.slice().sort()).toEqual(unassignedIds.slice().sort());
		expect(new Set(seenIds).size).toBe(2);
		const assigned = await success(
			user,
			["expenses", "list", "--account-id", seed.accountId],
			expense.array()
		);
		expect(assigned.data).toEqual([parse(expense, defaulted.data)]);
		const get = await success(
			user,
			["expenses", "get", defaulted.data.id],
			expense
		);
		expect(get.data).toEqual(
			await user.query(api.cli.v1.expenses.get, {
				expenseId: defaulted.data.id,
			})
		);
		const summary = await success(
			user,
			["summary", "--cycle-id", seed.cycleId, "--date", seed.date],
			z.object({
				cycle,
				totalSpent: z.number(),
				totalPlanned: z.number(),
				remaining: z.number(),
			})
		);
		expect(summary.data).toMatchObject({
			cycle: { id: seed.cycleId },
			totalSpent: 60,
			totalPlanned: 0,
			remaining: -60,
		});
		expect(
			(await user.query(api.cli.v1.expenses.list, {})).items
				.map((entry) => entry.id)
				.sort()
		).toEqual([defaulted.data.id, ...unassignedIds].sort());
		expect(
			await user.query(api.accounts.get, { accountId: seed.accountId })
		).toMatchObject({ currentBalance: 990 });
	});

	it("proves the authenticated identity, logs out, and rejects missing-session commands @smoke", async () => {
		const { user, seed } = fixture();
		const backend = await user.query(api.users.get, {});
		const status = await success(user, ["auth", "status"], authStatus);
		expect(status.data.authenticated).toBe(true);
		expect(status.data.currency).toBe("USD");
		expect(status.data.subjectMatchesBackendUser).toBe(true);
		expect(status.data.backendUserId === backend._id).toBe(true);
		expect(status.data.identitySubject === backend.clerkId).toBe(true);
		const logoutSchema = z.object({
			authenticated: z.literal(false),
			localCredentialsRemoved: z.literal(true),
			remoteRevocation: z.enum(["confirmed", "not-confirmed", "not-needed"]),
		});
		const logout = await success(user, ["auth", "logout"], logoutSchema);
		expect(logout.data).toMatchObject({
			authenticated: false,
			localCredentialsRemoved: true,
		});
		expect(logout.data.remoteRevocation).not.toBe("not-needed");
		for (const args of [
			["auth", "status"],
			["accounts", "get", seed.accountId],
		]) {
			expect(await failure(user, args)).toMatchObject({
				exitCode: CLI_EXIT_CODE.authentication,
				error: { code: "AUTHENTICATION_REQUIRED", retryable: false },
			});
		}
		expect(
			(await success(user, ["auth", "logout"], logoutSchema)).data
		).toEqual({
			authenticated: false,
			localCredentialsRemoved: true,
			remoteRevocation: "not-needed",
		});
		// Web authentication remains valid and logout must not delete user data.
		expect(
			await user.query(api.accounts.get, { accountId: seed.accountId })
		).toMatchObject({ currentBalance: 1000 });
	});

	it("isolates two browser/OAuth users and refuses foreign reads and mutations", async () => {
		const { user, seed } = fixture();
		const created = await addExpense(user, seed);
		const otherContext = await browser.newContext();
		let other: E2EUser | undefined;
		try {
			other = await createUser(await otherContext.newPage(), config);
			const otherSeed = await seedUser(other);
			await other.loginCli();
			const identity = await success(other, ["auth", "status"], authStatus);
			const backend = await other.query(api.users.get, {});
			expect(identity.data.backendUserId === backend._id).toBe(true);
			expect(identity.data.identitySubject === backend.clerkId).toBe(true);
			for (const args of [
				["expenses", "get", created.id],
				["accounts", "get", seed.accountId],
				[
					"expenses",
					"edit",
					created.id,
					"--amount",
					"99",
					"--if-revision",
					"1",
					"--idempotency-key",
					randomUUID(),
				],
				[
					"accounts",
					"adjust-balance",
					seed.accountId,
					"--balance",
					"0",
					"--if-revision",
					"1",
					"--idempotency-key",
					randomUUID(),
				],
			]) {
				expect(await failure(other, args)).toMatchObject({
					exitCode: CLI_EXIT_CODE.notFound,
					error: { code: "RESOURCE_NOT_FOUND", details: {}, retryable: false },
				});
			}
			expect(
				(await success(other, ["expenses", "list"], expense.array())).data
			).toEqual([]);
			expect(
				await user.query(api.cli.v1.expenses.get, { expenseId: created.id })
			).toEqual(parse(expense, created));
			expect(
				await user.query(api.accounts.get, { accountId: seed.accountId })
			).toMatchObject({ currentBalance: 975 });
			expect(
				await other.query(api.accounts.get, { accountId: otherSeed.accountId })
			).toMatchObject({ currentBalance: 1000 });
		} finally {
			try {
				await other?.dispose();
			} finally {
				await otherContext.close();
			}
		}
	});
});
