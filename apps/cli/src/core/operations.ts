import { z } from "zod";
import {
	accountCreateProposalSchema,
	accountCreateResultSchema,
	accountUpdatePreviewArraySchema,
	accountUpdatePreviewSchema,
	balanceAdjustmentPreviewSchema,
	balanceAdjustmentResultSchema,
	transferPreviewSchema,
	transferResultSchema,
} from "../domain/account-mutation-schemas.js";
import {
	cycleCreateResultSchema,
	cycleDeletePreviewSchema,
	cycleDeleteResultSchema,
	cycleDetailSchema,
	cycleProposalSchema,
	cycleUpdatePreviewSchema,
} from "../domain/cycle-schemas.js";
import {
	expenseCreateResultSchema,
	expenseDeletePreviewSchema,
	expenseDeleteResultSchema,
	expenseMutationResultSchema,
	expenseProposalSchema,
	expenseUpdatePreviewSchema,
} from "../domain/mutation-schemas.js";
import {
	accountSchema,
	accountTypeSchema,
	categorySchema,
	contextSchema,
	cycleSchema,
	expensePageSchema,
	expenseSchema,
	summarySchema,
	tagSchema,
	transactionPageSchema,
} from "../domain/read-schemas.js";
import { CliError } from "../errors.js";

const idSchema = z.string().min(1);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const cursorSchema = z.string().min(1).optional();
const pageSizeSchema = z.number().int().min(1).max(100).optional();
const revisionSchema = z.number().int().positive();
const idempotencyKeySchema = z.string().min(8).max(200);
const noArgumentsSchema = z.object({}).strict();

const contextInputSchema = z
	.object({
		date: localDateSchema,
		dateSource: z.enum(["explicit", "local_default"]).optional(),
		timezone: z.string().min(1).optional(),
	})
	.strict();

const expenseListInputSchema = z
	.object({
		accountId: idSchema.optional(),
		categoryId: idSchema.optional(),
		cursor: cursorSchema,
		cycleId: idSchema.optional(),
		from: localDateSchema.optional(),
		limit: pageSizeSchema,
		tagIds: z.array(idSchema).max(100).optional(),
		to: localDateSchema.optional(),
		unassigned: z.boolean().optional(),
		uncategorized: z.boolean().optional(),
	})
	.strict();

const expenseCreateInputSchema = z
	.object({
		accountId: idSchema.nullable().optional(),
		amount: z.number().finite().positive(),
		categoryId: idSchema.nullable().optional(),
		date: localDateSchema,
		spentOn: z.string().optional(),
		tagIds: z.array(idSchema).optional(),
	})
	.strict();

const expenseUpdateFields = {
	accountId: idSchema.nullable().optional(),
	amount: z.number().finite().positive().optional(),
	categoryId: idSchema.nullable().optional(),
	date: localDateSchema.optional(),
	expectedRevision: revisionSchema.optional(),
	spentOn: z.string().nullable().optional(),
	tagIds: z.array(idSchema).optional(),
} as const;

const expenseUpdateInputSchema = z
	.object({ expenseId: idSchema, ...expenseUpdateFields })
	.strict();

const accountCreateInputSchema = z
	.object({
		accountTypeId: idSchema,
		date: localDateSchema,
		name: z.string().min(1),
		startingBalance: z.number().finite(),
	})
	.strict();

const accountUpdateFields = {
	accountTypeId: idSchema.optional(),
	expectedRevision: revisionSchema.optional(),
	name: z.string().min(1).optional(),
} as const;

const accountUpdateInputSchema = z
	.object({ accountId: idSchema, ...accountUpdateFields })
	.strict();

const accountLifecyclePreviewInputSchema = z
	.object({
		accountId: idSchema,
		expectedRevision: revisionSchema.optional(),
	})
	.strict();

const lifecycleBatchAccountsSchema = z
	.array(
		z
			.object({
				accountId: idSchema,
				expectedRevision: revisionSchema,
			})
			.strict()
	)
	.min(1)
	.max(100);

const balanceAdjustmentInputSchema = z
	.object({
		accountId: idSchema,
		date: localDateSchema,
		expectedRevision: revisionSchema.optional(),
		newBalance: z.number().finite(),
		note: z.string().optional(),
	})
	.strict();

const transferInputSchema = z
	.object({
		amount: z.number().finite().positive(),
		date: localDateSchema,
		expectedFromRevision: revisionSchema.optional(),
		expectedToRevision: revisionSchema.optional(),
		fromAccountId: idSchema,
		note: z.string().optional(),
		toAccountId: idSchema,
	})
	.strict();

const cycleUpdateInputFields = {
	cycleId: idSchema,
	name: z.string().trim().min(1).optional(),
	startDate: localDateSchema.optional(),
	endDateExclusive: localDateSchema.optional(),
	expectedRevision: revisionSchema.optional(),
} as const;

const cycleCreateInputFields = {
	name: z.string().trim().min(1),
	startDate: localDateSchema,
	endDateExclusive: localDateSchema,
	copyFromCycleId: idSchema.optional(),
	copyCategoryIds: z.array(idSchema).max(1000).optional(),
	includePlannedAmounts: z.boolean().optional(),
	categoryPlannedOverrides: z
		.array(
			z
				.object({
					id: idSchema,
					plannedAmount: z.number().finite().nonnegative().optional(),
				})
				.strict()
		)
		.max(1000)
		.optional(),
} as const;

const commitFields = {
	idempotencyKey: idempotencyKeySchema,
} as const;

export const operationDefinitions = {
	"accountTypes.list": {
		functionName: "cli/v1/accountTypes:list",
		inputSchema: z.object({ includeArchived: z.boolean().optional() }).strict(),
		mode: "query",
		outputSchema: accountTypeSchema.array(),
	},
	"accounts.adjustBalance": {
		commit: true,
		functionName: "cli/v1/accounts:adjustBalance",
		inputSchema: z
			.object({
				...balanceAdjustmentInputSchema.shape,
				expectedRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: balanceAdjustmentResultSchema,
	},
	"accounts.archive": {
		commit: true,
		functionName: "cli/v1/accounts:archive",
		inputSchema: z
			.object({
				accountId: idSchema,
				expectedRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: accountSchema,
	},
	"accounts.archiveBatch": {
		commit: true,
		functionName: "cli/v1/accounts:archiveBatch",
		inputSchema: z
			.object({ accounts: lifecycleBatchAccountsSchema, ...commitFields })
			.strict(),
		mode: "mutation",
		outputSchema: accountSchema.array(),
	},
	"accounts.create": {
		commit: true,
		functionName: "cli/v1/accounts:create",
		inputSchema: z
			.object({ ...accountCreateInputSchema.shape, ...commitFields })
			.strict(),
		mode: "mutation",
		outputSchema: accountCreateResultSchema,
	},
	"accounts.get": {
		functionName: "cli/v1/accounts:get",
		inputSchema: z.object({ accountId: idSchema }).strict(),
		mode: "query",
		outputSchema: accountSchema,
	},
	"accounts.list": {
		functionName: "cli/v1/accounts:list",
		inputSchema: z.object({ includeArchived: z.boolean().optional() }).strict(),
		mode: "query",
		outputSchema: accountSchema.array(),
	},
	"accounts.listTransactions": {
		functionName: "cli/v1/accounts:listTransactions",
		inputSchema: z
			.object({
				accountId: idSchema,
				cursor: cursorSchema,
				limit: pageSizeSchema,
			})
			.strict(),
		mode: "query",
		outputSchema: transactionPageSchema,
	},
	"accounts.previewArchive": {
		functionName: "cli/v1/accounts:previewArchive",
		inputSchema: accountLifecyclePreviewInputSchema,
		mode: "mutation",
		outputSchema: accountUpdatePreviewSchema,
	},
	"accounts.previewArchiveBatch": {
		functionName: "cli/v1/accounts:previewArchiveBatch",
		inputSchema: z.object({ accounts: lifecycleBatchAccountsSchema }).strict(),
		mode: "mutation",
		outputSchema: accountUpdatePreviewArraySchema,
	},
	"accounts.previewBalanceAdjustment": {
		functionName: "cli/v1/accounts:previewBalanceAdjustment",
		inputSchema: balanceAdjustmentInputSchema,
		mode: "mutation",
		outputSchema: balanceAdjustmentPreviewSchema,
	},
	"accounts.previewCreate": {
		functionName: "cli/v1/accounts:previewCreate",
		inputSchema: accountCreateInputSchema,
		mode: "mutation",
		outputSchema: accountCreateProposalSchema,
	},
	"accounts.previewReactivate": {
		functionName: "cli/v1/accounts:previewReactivate",
		inputSchema: accountLifecyclePreviewInputSchema,
		mode: "mutation",
		outputSchema: accountUpdatePreviewSchema,
	},
	"accounts.previewReactivateBatch": {
		functionName: "cli/v1/accounts:previewReactivateBatch",
		inputSchema: z.object({ accounts: lifecycleBatchAccountsSchema }).strict(),
		mode: "mutation",
		outputSchema: accountUpdatePreviewArraySchema,
	},
	"accounts.previewSetDefault": {
		functionName: "cli/v1/accounts:previewSetDefault",
		inputSchema: accountLifecyclePreviewInputSchema,
		mode: "mutation",
		outputSchema: accountSchema,
	},
	"accounts.previewTransfer": {
		functionName: "cli/v1/accounts:previewTransfer",
		inputSchema: transferInputSchema,
		mode: "mutation",
		outputSchema: transferPreviewSchema,
	},
	"accounts.previewUpdate": {
		functionName: "cli/v1/accounts:previewUpdate",
		inputSchema: accountUpdateInputSchema,
		mode: "mutation",
		outputSchema: accountUpdatePreviewSchema,
	},
	"accounts.reactivate": {
		commit: true,
		functionName: "cli/v1/accounts:reactivate",
		inputSchema: z
			.object({
				accountId: idSchema,
				expectedRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: accountSchema,
	},
	"accounts.reactivateBatch": {
		commit: true,
		functionName: "cli/v1/accounts:reactivateBatch",
		inputSchema: z
			.object({ accounts: lifecycleBatchAccountsSchema, ...commitFields })
			.strict(),
		mode: "mutation",
		outputSchema: accountSchema.array(),
	},
	"accounts.setDefault": {
		commit: true,
		functionName: "cli/v1/accounts:setDefault",
		inputSchema: z
			.object({
				accountId: idSchema,
				expectedRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: accountSchema,
	},
	"accounts.transfer": {
		commit: true,
		functionName: "cli/v1/accounts:transfer",
		inputSchema: z
			.object({
				...transferInputSchema.shape,
				expectedFromRevision: revisionSchema,
				expectedToRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: transferResultSchema,
	},
	"accounts.update": {
		commit: true,
		functionName: "cli/v1/accounts:update",
		inputSchema: z
			.object({
				accountId: idSchema,
				...accountUpdateFields,
				expectedRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: accountSchema,
	},
	"context.get": {
		functionName: "cli/v1/context:get",
		inputSchema: contextInputSchema,
		mode: "query",
		outputSchema: contextSchema,
	},
	"cycles.create": {
		commit: true,
		functionName: "cli/v1/cycles:create",
		inputSchema: z
			.object({ ...cycleCreateInputFields, ...commitFields })
			.strict(),
		mode: "mutation",
		outputSchema: cycleCreateResultSchema,
	},
	"cycles.previewDelete": {
		functionName: "cli/v1/cycles:previewDelete",
		inputSchema: z.object({ cycleId: idSchema }).strict(),
		mode: "mutation",
		outputSchema: cycleDeletePreviewSchema,
	},
	"cycles.remove": {
		commit: true,
		functionName: "cli/v1/cycles:remove",
		inputSchema: z
			.object({
				cycleId: idSchema,
				expectedRevision: revisionSchema,
				confirmationToken: idSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: cycleDeleteResultSchema,
	},
	"cycles.update": {
		commit: true,
		functionName: "cli/v1/cycles:update",
		inputSchema: z
			.object({
				...cycleUpdateInputFields,
				expectedRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: cycleDetailSchema,
	},
	"cycles.previewUpdate": {
		functionName: "cli/v1/cycles:previewUpdate",
		inputSchema: z.object(cycleUpdateInputFields).strict(),
		mode: "query",
		outputSchema: cycleUpdatePreviewSchema,
	},
	"cycles.previewCreate": {
		functionName: "cli/v1/cycles:previewCreate",
		inputSchema: z.object(cycleCreateInputFields).strict(),
		mode: "query",
		outputSchema: cycleProposalSchema,
	},
	"cycles.get": {
		functionName: "cli/v1/cycles:get",
		inputSchema: z.object({ cycleId: idSchema }).strict(),
		mode: "query",
		outputSchema: cycleDetailSchema,
	},
	"expenses.create": {
		commit: true,
		functionName: "cli/v1/expenses:create",
		inputSchema: z
			.object({ ...expenseCreateInputSchema.shape, ...commitFields })
			.strict(),
		mode: "mutation",
		outputSchema: expenseCreateResultSchema,
	},
	"expenses.get": {
		functionName: "cli/v1/expenses:get",
		inputSchema: z.object({ expenseId: idSchema }).strict(),
		mode: "query",
		outputSchema: expenseSchema,
	},
	"expenses.list": {
		functionName: "cli/v1/expenses:list",
		inputSchema: expenseListInputSchema,
		mode: "query",
		outputSchema: expensePageSchema,
	},
	"expenses.previewCreate": {
		functionName: "cli/v1/expenses:previewCreate",
		inputSchema: expenseCreateInputSchema,
		mode: "query",
		outputSchema: expenseProposalSchema,
	},
	"expenses.previewDelete": {
		functionName: "cli/v1/expenses:previewDelete",
		inputSchema: z.object({ expenseId: idSchema }).strict(),
		mode: "mutation",
		outputSchema: expenseDeletePreviewSchema,
	},
	"expenses.previewUpdate": {
		functionName: "cli/v1/expenses:previewUpdate",
		inputSchema: expenseUpdateInputSchema,
		mode: "query",
		outputSchema: expenseUpdatePreviewSchema,
	},
	"expenses.remove": {
		commit: true,
		functionName: "cli/v1/expenses:remove",
		inputSchema: z
			.object({
				confirmationToken: idSchema,
				expectedRevision: revisionSchema,
				expenseId: idSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: expenseDeleteResultSchema,
	},
	"expenses.update": {
		commit: true,
		functionName: "cli/v1/expenses:update",
		inputSchema: z
			.object({
				expenseId: idSchema,
				...expenseUpdateFields,
				expectedRevision: revisionSchema,
				...commitFields,
			})
			.strict(),
		mode: "mutation",
		outputSchema: expenseMutationResultSchema,
	},
	"resources.getCurrentCycle": {
		functionName: "cli/v1/resources:getCurrentCycle",
		inputSchema: z.object({ date: localDateSchema }).strict(),
		mode: "query",
		outputSchema: cycleSchema.nullable(),
	},
	"resources.getSummary": {
		functionName: "cli/v1/resources:getSummary",
		inputSchema: z
			.object({ cycleId: idSchema, today: localDateSchema })
			.strict(),
		mode: "query",
		outputSchema: summarySchema,
	},
	"resources.listCategories": {
		functionName: "cli/v1/resources:listCategories",
		inputSchema: z.object({ cycleId: idSchema }).strict(),
		mode: "query",
		outputSchema: categorySchema.array(),
	},
	"resources.listCycles": {
		functionName: "cli/v1/resources:listCycles",
		inputSchema: noArgumentsSchema,
		mode: "query",
		outputSchema: cycleSchema.array(),
	},
	"resources.listTags": {
		functionName: "cli/v1/resources:listTags",
		inputSchema: noArgumentsSchema,
		mode: "query",
		outputSchema: tagSchema.array(),
	},
} as const;

export type OperationName = keyof typeof operationDefinitions;
export type OperationInput<Name extends OperationName> = z.input<
	(typeof operationDefinitions)[Name]["inputSchema"]
>;
export type OperationOutput<Name extends OperationName> = z.output<
	(typeof operationDefinitions)[Name]["outputSchema"]
>;

export const getOperationJsonSchemas = (name: OperationName) => {
	const definition = operationDefinitions[name];
	return {
		input: z.toJSONSchema(definition.inputSchema, {
			target: "draft-2020-12",
		}),
		output: z.toJSONSchema(definition.outputSchema, {
			target: "draft-2020-12",
		}),
	};
};

export interface OperationRequestContext {
	signal?: AbortSignal;
	reportProgress?: (progress: number, total?: number) => void;
}

export type BackendOperation = <Result>(
	functionName: string,
	args: Readonly<Record<string, unknown>>,
	context?: OperationRequestContext
) => Promise<Result>;

type InvocationOrigin = "cli" | "cli_agent" | "mcp" | "raycast";

interface CommitProvenanceAdapter {
	decorate: (
		args: Readonly<Record<string, unknown>>,
		origin: InvocationOrigin
	) => Readonly<Record<string, unknown>>;
	origin: InvocationOrigin;
}

export interface SpendlyOperationDependencies {
	commitProvenance?: CommitProvenanceAdapter;
	mutation: BackendOperation;
	query: BackendOperation;
}

interface RuntimeOperationDefinition {
	commit?: boolean;
	functionName: string;
	inputSchema: z.ZodType<Record<string, unknown>>;
	mode: "mutation" | "query";
	outputSchema: z.ZodType<unknown>;
}

const toUncertainMutationError = (
	error: CliError,
	idempotencyKey: string | undefined
): CliError =>
	new CliError(
		"NETWORK_ERROR",
		idempotencyKey
			? "The mutation outcome is uncertain; repeat the same command with the same idempotency key"
			: "The mutation outcome is uncertain; repeat the preview command",
		{
			cause: error,
			details: {
				...(idempotencyKey ? { idempotencyKey } : {}),
				outcome: "unknown",
			},
			retryable: true,
		}
	);

const parseOperationInput = (
	definition: RuntimeOperationDefinition,
	input: unknown,
	name: OperationName
): Record<string, unknown> => {
	const parsed = definition.inputSchema.safeParse(input);
	if (parsed.success) {
		return parsed.data;
	}
	throw new CliError("INVALID_INPUT", `Invalid input for ${name}`, {
		details: {
			issues: parsed.error.issues.map((issue) => ({
				code: issue.code,
				message: issue.message,
				path: issue.path.map(String),
			})),
			operation: name,
		},
	});
};

const parseOperationOutput = <Name extends OperationName>(
	definition: RuntimeOperationDefinition,
	output: unknown,
	name: Name
): OperationOutput<Name> => {
	const parsed = definition.outputSchema.safeParse(output);
	if (parsed.success) {
		return parsed.data as OperationOutput<Name>;
	}
	throw new CliError("INTERNAL_ERROR", `Invalid backend result for ${name}`, {
		details: { operation: name },
	});
};

export interface SpendlyOperations {
	invoke<Name extends OperationName>(
		name: Name,
		input: OperationInput<Name>,
		context?: OperationRequestContext
	): Promise<OperationOutput<Name>>;
}

export const createSpendlyOperations = (
	dependencies: SpendlyOperationDependencies
): SpendlyOperations => ({
	invoke: async <Name extends OperationName>(
		name: Name,
		input: OperationInput<Name>,
		context?: OperationRequestContext
	): Promise<OperationOutput<Name>> => {
		context?.signal?.throwIfAborted();
		context?.reportProgress?.(0, 1);
		const definition = operationDefinitions[name] as RuntimeOperationDefinition;
		const parsedInput = parseOperationInput(definition, input, name);
		const backendArgs =
			definition.commit && dependencies.commitProvenance
				? dependencies.commitProvenance.decorate(
						parsedInput,
						dependencies.commitProvenance.origin
					)
				: parsedInput;
		const execute =
			definition.mode === "query" ? dependencies.query : dependencies.mutation;
		try {
			const rawResult = await execute<unknown>(
				definition.functionName,
				backendArgs,
				context
			);
			context?.signal?.throwIfAborted();
			const result = parseOperationOutput(definition, rawResult, name);
			context?.reportProgress?.(1, 1);
			return result;
		} catch (error) {
			if (
				definition.mode === "mutation" &&
				error instanceof CliError &&
				error.code === "NETWORK_ERROR"
			) {
				throw toUncertainMutationError(
					error,
					typeof parsedInput.idempotencyKey === "string"
						? parsedInput.idempotencyKey
						: undefined
				);
			}
			throw error;
		}
	},
});
