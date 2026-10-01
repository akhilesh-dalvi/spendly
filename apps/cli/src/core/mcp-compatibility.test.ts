import { PassThrough } from "node:stream";
import {
	Client,
	type JSONRPCMessage,
	ReadBuffer,
	serializeMessage,
	type Transport,
} from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import {
	type StdioServerHandle,
	StdioServerTransport,
	serveStdio,
} from "@modelcontextprotocol/server/stdio";
import { afterEach, describe, expect, it } from "vitest";
import { CliError } from "../errors.js";
import {
	createSpendlyOperations,
	operationDefinitions,
	type SpendlyOperations,
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

const expense = {
	account: {
		accountType: account.accountType,
		currency: "INR",
		id: account.id,
		name: account.name,
	},
	amount: 125,
	category: null,
	createdAt: "2026-09-16T10:00:00.000Z",
	currency: "INR",
	cycle: null,
	date: "2026-09-16",
	id: "expense_1",
	revision: 1,
	spentOn: "Lunch",
	tags: [],
};

const proposal = {
	accountEffects: [
		{
			accountId: account.id,
			accountName: account.name,
			balanceAfter: 375,
			balanceBefore: 500,
			currency: "INR",
			delta: -125,
		},
	],
	accountId: account.id,
	accountSource: "explicit" as const,
	amount: 125,
	categoryId: null,
	categorySource: "none" as const,
	currency: "INR",
	cycleId: null,
	date: "2026-09-16",
	revision: 1,
	spentOn: "Lunch",
	tagIds: [],
};

interface Harness {
	client: Client;
	server: StdioServerHandle;
}

const MCP_PROTOCOL_VERSION = "2026-07-28";

const openHarnesses: Harness[] = [];

class CapturingStdioClientTransport implements Transport {
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: JSONRPCMessage) => void;
	readonly received: JSONRPCMessage[] = [];
	readonly sent: JSONRPCMessage[] = [];
	stdout = "";
	private readonly buffer = new ReadBuffer();
	private readonly input: PassThrough;
	private readonly output: PassThrough;
	private readonly waiters: Array<{
		predicate: (message: JSONRPCMessage) => boolean;
		resolve: (message: JSONRPCMessage) => void;
	}> = [];

	constructor(input: PassThrough, output: PassThrough) {
		this.input = input;
		this.output = output;
	}

	start = async (): Promise<void> => {
		this.output.on("data", this.handleData);
		this.output.on("error", this.handleError);
		await Promise.resolve();
	};

	send = async (message: JSONRPCMessage): Promise<void> => {
		this.sent.push(message);
		this.input.write(serializeMessage(message));
		await Promise.resolve();
	};

	close = async (): Promise<void> => {
		this.output.off("data", this.handleData);
		this.output.off("error", this.handleError);
		this.input.end();
		this.onclose?.();
		await Promise.resolve();
	};

	waitForMessage = async (
		predicate: (message: JSONRPCMessage) => boolean
	): Promise<JSONRPCMessage> => {
		const existing = this.received.find(predicate);
		if (existing) {
			return existing;
		}
		return await new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("Timed out waiting for an MCP message")),
				1000
			);
			this.waiters.push({
				predicate,
				resolve: (message) => {
					clearTimeout(timeout);
					resolve(message);
				},
			});
		});
	};

	private readonly handleData = (chunk: Buffer): void => {
		this.stdout += chunk.toString("utf8");
		this.buffer.append(chunk);
		for (;;) {
			const message = this.buffer.readMessage();
			if (!message) {
				break;
			}
			this.received.push(message);
			for (const waiter of [...this.waiters]) {
				if (waiter.predicate(message)) {
					this.waiters.splice(this.waiters.indexOf(waiter), 1);
					waiter.resolve(message);
				}
			}
			this.onmessage?.(message);
		}
	};

	private readonly handleError = (error: Error): void => {
		this.onerror?.(error);
	};
}

const asToolSuccess = (result: unknown) => ({
	content: [{ text: JSON.stringify(result), type: "text" as const }],
	structuredContent: result as Record<string, unknown>,
});

const asToolError = (error: unknown) => {
	const failure =
		error instanceof CliError
			? {
					code: error.code,
					details: error.details,
					message: error.message,
					retryable: error.retryable,
				}
			: {
					code: "INTERNAL_ERROR",
					details: {},
					message: "The operation failed",
					retryable: false,
				};
	return {
		content: [{ text: JSON.stringify(failure), type: "text" as const }],
		isError: true,
	};
};

const createCompatibilityServer = (
	operations: SpendlyOperations
): McpServer => {
	const server = new McpServer(
		{ name: "spendly-mcp-compatibility", version: "0.0.0-test" },
		{
			cacheHints: {
				"resources/list": { cacheScope: "private", ttlMs: 0 },
				"resources/read": { cacheScope: "private", ttlMs: 0 },
				"tools/list": { cacheScope: "private", ttlMs: 0 },
			},
		}
	);
	server.registerTool(
		"spendly_expenses_list",
		{
			description: "List one page of the signed-in user's expenses",
			inputSchema: operationDefinitions["expenses.list"].inputSchema,
			outputSchema: operationDefinitions["expenses.list"].outputSchema,
		},
		async (input, context) => {
			try {
				return asToolSuccess(
					await operations.invoke("expenses.list", input, {
						signal: context.mcpReq.signal,
					})
				);
			} catch (error) {
				return asToolError(error);
			}
		}
	);
	server.registerTool(
		"spendly_expenses_preview_create",
		{
			description: "Preview an expense without saving it",
			inputSchema: operationDefinitions["expenses.previewCreate"].inputSchema,
			outputSchema: operationDefinitions["expenses.previewCreate"].outputSchema,
		},
		async (input, context) => {
			try {
				return asToolSuccess(
					await operations.invoke("expenses.previewCreate", input, {
						signal: context.mcpReq.signal,
					})
				);
			} catch (error) {
				return asToolError(error);
			}
		}
	);
	server.registerTool(
		"spendly_expenses_create",
		{
			description: "Commit a previously reviewed expense",
			inputSchema: operationDefinitions["expenses.create"].inputSchema,
			outputSchema: operationDefinitions["expenses.create"].outputSchema,
		},
		async (input, context) => {
			try {
				return asToolSuccess(
					await operations.invoke("expenses.create", input, {
						signal: context.mcpReq.signal,
					})
				);
			} catch (error) {
				return asToolError(error);
			}
		}
	);
	server.registerResource(
		"spendly-account-wallet",
		"spendly://accounts/account_1",
		{
			cacheHint: { cacheScope: "private", ttlMs: 0 },
			description: "A bounded signed-in-user account snapshot",
			mimeType: "application/json",
			title: "Spendly account",
		},
		async (uri) => {
			const result = await operations.invoke("accounts.get", {
				accountId: "account_1",
			});
			return {
				contents: [
					{
						mimeType: "application/json",
						text: JSON.stringify(result),
						uri: uri.href,
					},
				],
			};
		}
	);
	return server;
};

const connectHarness = async (
	operations: SpendlyOperations
): Promise<Harness> => {
	const client = new Client(
		{ name: "spendly-mcp-compatibility-test", version: "0.0.0-test" },
		{ versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } } }
	);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const server = serveStdio(() => createCompatibilityServer(operations), {
		legacy: "reject",
		transport: serverTransport,
	});
	await client.connect(clientTransport);
	const harness = { client, server };
	openHarnesses.push(harness);
	return harness;
};

const connectStdioHarness = async (
	operations: SpendlyOperations
): Promise<Harness & { transport: CapturingStdioClientTransport }> => {
	const client = new Client(
		{ name: "spendly-mcp-stdio-test", version: "0.0.0-test" },
		{ versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } } }
	);
	const clientToServer = new PassThrough();
	const serverToClient = new PassThrough();
	const transport = new CapturingStdioClientTransport(
		clientToServer,
		serverToClient
	);
	const server = serveStdio(() => createCompatibilityServer(operations), {
		legacy: "reject",
		transport: new StdioServerTransport(clientToServer, serverToClient),
	});
	await client.connect(transport);
	const harness = { client, server, transport };
	openHarnesses.push(harness);
	return harness;
};

afterEach(async () => {
	for (const harness of openHarnesses.splice(0)) {
		await harness.client.close();
		await harness.server.close();
	}
});

describe("MCP 2026-07-28 reuse compatibility", () => {
	it("registers shared schemas and executes a page, resource, preview, and commit", async () => {
		const calls: Array<{
			args: Readonly<Record<string, unknown>>;
			name: string;
		}> = [];
		const operations = createSpendlyOperations({
			commitProvenance: {
				decorate: (args, origin) => ({ ...args, origin }),
				origin: "mcp",
			},
			mutation: async (name, args) => {
				calls.push({ args, name });
				if (name.endsWith("create")) {
					return await Promise.resolve({
						...expense,
						accountEffects: proposal.accountEffects,
						accountSource: "explicit",
						categorySource: "none",
					});
				}
				throw new Error(`Unexpected mutation: ${name}`);
			},
			query: async (name, args) => {
				calls.push({ args, name });
				if (name.endsWith("expenses:list")) {
					return await Promise.resolve({
						hasMore: false,
						items: [expense],
						nextCursor: null,
					});
				}
				if (name.endsWith("accounts:get")) {
					return await Promise.resolve(account);
				}
				if (name.endsWith("previewCreate")) {
					return await Promise.resolve(proposal);
				}
				throw new Error(`Unexpected query: ${name}`);
			},
		});
		const { client } = await connectHarness(operations);
		expect(client.getProtocolEra()).toBe("modern");
		expect(client.getNegotiatedProtocolVersion()).toBe(MCP_PROTOCOL_VERSION);

		const tools = await client.listTools();
		expect(tools).toMatchObject({ cacheScope: "private", ttlMs: 0 });
		expect(tools.tools.map((tool) => tool.name)).toEqual([
			"spendly_expenses_list",
			"spendly_expenses_preview_create",
			"spendly_expenses_create",
		]);
		expect(
			tools.tools.find((tool) => tool.name === "spendly_expenses_list")
				?.inputSchema
		).toMatchObject({ type: "object" });

		const page = await client.callTool({
			arguments: { limit: 25 },
			name: "spendly_expenses_list",
		});
		expect(page.structuredContent).toMatchObject({
			hasMore: false,
			nextCursor: null,
		});

		const resources = await client.listResources();
		expect(resources).toMatchObject({ cacheScope: "private", ttlMs: 0 });
		expect(resources.resources).toEqual([
			expect.objectContaining({ uri: "spendly://accounts/account_1" }),
		]);
		const resource = await client.readResource({
			uri: "spendly://accounts/account_1",
		});
		expect(resource.contents[0]).toMatchObject({
			mimeType: "application/json",
			uri: "spendly://accounts/account_1",
		});

		const input = {
			accountId: "account_1",
			amount: 125,
			categoryId: null,
			date: "2026-09-16",
			spentOn: "Lunch",
			tagIds: [],
		};
		const preview = await client.callTool({
			arguments: input,
			name: "spendly_expenses_preview_create",
		});
		expect(preview.structuredContent).toEqual(proposal);
		const commit = await client.callTool({
			arguments: { ...input, idempotencyKey: "expense-create-1" },
			name: "spendly_expenses_create",
		});
		expect(commit.isError).not.toBe(true);
		expect(calls.at(-1)?.args).toMatchObject({ origin: "mcp" });
		expect(calls.at(-2)?.args).not.toHaveProperty("origin");
	});

	it("maps typed business failures to tool errors", async () => {
		const operations = createSpendlyOperations({
			mutation: async () =>
				await Promise.reject(
					new CliError("ACCOUNT_ARCHIVED", "Account is archived", {
						details: { accountId: "account_1" },
					})
				),
			query: async () =>
				await Promise.reject(
					new CliError("ACCOUNT_ARCHIVED", "Account is archived", {
						details: { accountId: "account_1" },
					})
				),
		});
		const { client } = await connectHarness(operations);

		const result = await client.callTool({
			arguments: {
				accountId: "account_1",
				amount: 125,
				categoryId: null,
				date: "2026-09-16",
				spentOn: "Lunch",
				tagIds: [],
			},
			name: "spendly_expenses_preview_create",
		});

		expect(result.isError).toBe(true);
		expect(result.content).toEqual([
			expect.objectContaining({
				text: expect.stringContaining("ACCOUNT_ARCHIVED"),
			}),
		]);
	});

	it("rejects malformed tool arguments before shared backend work", async () => {
		let queryCalls = 0;
		const operations = createSpendlyOperations({
			mutation: async () => await Promise.resolve(proposal),
			query: async () => {
				queryCalls += 1;
				return await Promise.resolve({
					hasMore: false,
					items: [],
					nextCursor: null,
				});
			},
		});
		const { client } = await connectHarness(operations);

		const result = await client.callTool({
			arguments: { limit: 101 },
			name: "spendly_expenses_list",
		});

		expect(result.isError).toBe(true);
		expect(queryCalls).toBe(0);
	});

	it("keeps real stdio output to JSON-RPC and returns protocol errors for malformed requests", async () => {
		const operations = createSpendlyOperations({
			mutation: async () => await Promise.resolve(proposal),
			query: async (name) => {
				if (name.endsWith("expenses:list")) {
					return await Promise.resolve({
						hasMore: false,
						items: [],
						nextCursor: null,
					});
				}
				return await Promise.resolve(account);
			},
		});
		const { client, transport } = await connectStdioHarness(operations);
		await client.listTools();
		await client.callTool({
			arguments: { limit: 10 },
			name: "spendly_expenses_list",
		});

		const listRequest = transport.sent.find(
			(message) => "method" in message && message.method === "tools/list"
		);
		expect(listRequest).toBeDefined();
		const metadata =
			listRequest && "params" in listRequest && listRequest.params
				? listRequest.params._meta
				: undefined;
		expect(metadata).toBeDefined();
		await transport.send({
			id: 999,
			jsonrpc: "2.0",
			method: "tools/call",
			params: { _meta: metadata },
		});
		const malformedResponse = await transport.waitForMessage(
			(message) => "id" in message && message.id === 999
		);

		expect(malformedResponse).toMatchObject({
			error: { code: -32_602 },
			id: 999,
			jsonrpc: "2.0",
		});
		const lines = transport.stdout.trim().split("\n");
		expect(lines.length).toBeGreaterThan(2);
		for (const line of lines) {
			expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
		}
	});
});
