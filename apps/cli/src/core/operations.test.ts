import { describe, expect, it, vi } from "vitest";
import { CliError } from "../errors.js";
import {
	createSpendlyOperations,
	getOperationJsonSchemas,
} from "./operations.js";

const account = {
	accountType: {
		balanceNature: "asset" as const,
		color: null,
		icon: null,
		id: "account_type_1",
		name: "Cash",
	},
	createdAt: "2026-09-16T10:00:00.000Z",
	currency: "INR",
	currentBalance: 500,
	id: "account_1",
	isArchived: false,
	isDefault: true,
	name: "Wallet",
	revision: 1,
	startingBalance: 500,
	updatedAt: "2026-09-16T10:00:00.000Z",
};

describe("Spendly operations", () => {
	it("exports JSON Schema 2020-12 contracts for adapters", () => {
		const schemas = getOperationJsonSchemas("expenses.list");

		expect(schemas.input).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			additionalProperties: false,
			properties: {
				cursor: { type: "string" },
				limit: { maximum: 100, minimum: 1, type: "integer" },
				tagIds: { items: { type: "string" }, type: "array" },
			},
			type: "object",
		});
		expect(schemas.output).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			properties: {
				nextCursor: { anyOf: [{ type: "string" }, { type: "null" }] },
			},
			type: "object",
		});
	});

	it("maps symbolic reads to the authenticated gateway and validates results", async () => {
		const query = vi.fn(async () => await Promise.resolve([account]));
		const operations = createSpendlyOperations({
			mutation: vi.fn(),
			query,
		});

		await expect(
			operations.invoke("accounts.list", { includeArchived: false })
		).resolves.toEqual([account]);
		expect(query).toHaveBeenCalledWith(
			"cli/v1/accounts:list",
			{ includeArchived: false },
			undefined
		);
	});

	it("lets the adapter decorate commits without decorating previews", async () => {
		const mutation = vi.fn(async (name: string) => {
			if (name.endsWith("previewCreate")) {
				return await Promise.resolve({
					accountType: account.accountType,
					currency: account.currency,
					currentBalance: 500,
					date: "2026-09-16",
					name: account.name,
					revision: 1,
					startingBalance: 500,
				});
			}
			return await Promise.resolve({
				...account,
				openingTransaction: {
					accountId: account.id,
					amount: 500,
					balanceAfter: 500,
					createdAt: "2026-09-16T10:00:00.000Z",
					date: "2026-09-16",
					id: "transaction_1",
					note: null,
					relatedId: null,
					type: "opening_balance",
				},
			});
		});
		const operations = createSpendlyOperations({
			commitProvenance: {
				decorate: (args, origin) => ({
					...args,
					agent: origin === "cli_agent",
				}),
				origin: "cli_agent",
			},
			mutation,
			query: vi.fn(),
		});
		const input = {
			accountTypeId: "account_type_1",
			date: "2026-09-16",
			name: "Wallet",
			startingBalance: 500,
		};

		await operations.invoke("accounts.previewCreate", input);
		await operations.invoke("accounts.create", {
			...input,
			idempotencyKey: "account-create-1",
		});

		expect(mutation.mock.calls[0]?.[1]).not.toHaveProperty("agent");
		expect(mutation.mock.calls[1]?.[1]).toMatchObject({ agent: true });
	});

	it("supports a Raycast-owned mutation origin without coupling it to CLI provenance", async () => {
		const mutation = vi.fn(async (name: string) => {
			if (name.endsWith("previewCreate")) {
				return await Promise.resolve({
					accountType: account.accountType,
					currency: account.currency,
					currentBalance: 500,
					date: "2026-09-16",
					name: account.name,
					revision: 1,
					startingBalance: 500,
				});
			}
			return await Promise.resolve({
				...account,
				openingTransaction: {
					accountId: account.id,
					amount: 500,
					balanceAfter: 500,
					createdAt: "2026-09-16T10:00:00.000Z",
					date: "2026-09-16",
					id: "transaction_1",
					note: null,
					relatedId: null,
					type: "opening_balance",
				},
			});
		});
		const operations = createSpendlyOperations({
			commitProvenance: {
				decorate: (args, origin) => ({ ...args, source: origin }),
				origin: "raycast",
			},
			mutation,
			query: vi.fn(),
		});
		const input = {
			accountTypeId: "account_type_1",
			date: "2026-09-16",
			name: "Wallet",
			startingBalance: 500,
		};

		await operations.invoke("accounts.previewCreate", input);
		await operations.invoke("accounts.create", {
			...input,
			idempotencyKey: "raycast-account-create-1",
		});

		expect(mutation.mock.calls[0]?.[1]).not.toHaveProperty("source");
		expect(mutation.mock.calls[1]?.[1]).toMatchObject({ source: "raycast" });
	});

	it("rejects malformed input before invoking the gateway", async () => {
		const query = vi.fn();
		const operations = createSpendlyOperations({
			mutation: vi.fn(),
			query,
		});

		await expect(
			operations.invoke("expenses.list", { limit: 101 })
		).rejects.toMatchObject({ code: "INVALID_INPUT", exitCode: 2 });
		expect(query).not.toHaveBeenCalled();
	});

	it("maps invalid backend results to a typed internal contract error", async () => {
		const operations = createSpendlyOperations({
			mutation: vi.fn(),
			query: async () => await Promise.resolve({ not: "an expense page" }),
		});

		await expect(operations.invoke("expenses.list", {})).rejects.toMatchObject({
			code: "INTERNAL_ERROR",
			details: { operation: "expenses.list" },
			exitCode: 1,
		});
	});

	it("preserves uncertain commit outcomes with the idempotency key", async () => {
		const operations = createSpendlyOperations({
			mutation: async () =>
				await Promise.reject(
					new CliError("NETWORK_ERROR", "offline", { retryable: true })
				),
			query: vi.fn(),
		});

		await expect(
			operations.invoke("accounts.archive", {
				accountId: "account_1",
				expectedRevision: 1,
				idempotencyKey: "archive-account-1",
			})
		).rejects.toMatchObject({
			code: "NETWORK_ERROR",
			details: {
				idempotencyKey: "archive-account-1",
				outcome: "unknown",
			},
		});
	});

	it("honors cancellation before authenticated work starts", async () => {
		const controller = new AbortController();
		controller.abort();
		const query = vi.fn();
		const operations = createSpendlyOperations({
			mutation: vi.fn(),
			query,
		});

		await expect(
			operations.invoke("resources.listTags", {}, { signal: controller.signal })
		).rejects.toMatchObject({ name: "AbortError" });
		expect(query).not.toHaveBeenCalled();
	});
});
