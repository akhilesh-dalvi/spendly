import type { Command } from "commander";
import type { BackendCommandContext } from "../client/convex-client.js";
import {
	accountCreateProposalSchema,
	accountCreateResultSchema,
	accountUpdatePreviewSchema,
	balanceAdjustmentPreviewSchema,
	balanceAdjustmentResultSchema,
	transferPreviewSchema,
	transferResultSchema,
} from "../domain/account-mutation-schemas.js";
import { resolveCommandDate } from "../domain/dates.js";
import {
	parseAmount,
	parseBalance,
	parseRevision,
	resolveIdempotencyKey,
	validateMutationText,
} from "../domain/mutation-input.js";
import {
	type Account,
	accountSchema,
	accountTypeSchema,
} from "../domain/read-schemas.js";
import { resolveExactName, resolveIdOrExactName } from "../domain/selectors.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import {
	renderAccountCreateProposal,
	renderAccountCreateResult,
	renderAccountUpdatePreview,
	renderBalanceAdjustmentPreview,
	renderBalanceAdjustmentResult,
	renderTransferPreview,
	renderTransferResult,
} from "../output/account-mutation-terminal.js";
import { renderAccount } from "../output/read-terminal.js";
import type { CliRuntime } from "../runtime.js";
import {
	assertNamesAllowed,
	mutationParsed,
	queryParsed,
	withBackend,
	writeMutationSuccess,
} from "./mutation-support.js";

interface AccountCreateOptions {
	accountType?: string;
	accountTypeId?: string;
	date?: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	name: string;
	startingBalance: string;
}

interface AccountUpdateOptions {
	accountType?: string;
	accountTypeId?: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	ifRevision?: string;
	name?: string;
}

interface AccountLifecycleOptions {
	dryRun?: boolean;
	idempotencyKey?: string;
	ifRevision?: string;
}

interface BalanceAdjustmentOptions extends AccountLifecycleOptions {
	balance: string;
	date?: string;
	note?: string;
}

interface TransferOptions {
	amount: string;
	date?: string;
	dryRun?: boolean;
	fromAccount?: string;
	fromAccountId?: string;
	idempotencyKey?: string;
	ifFromRevision?: string;
	ifToRevision?: string;
	note?: string;
	toAccount?: string;
	toAccountId?: string;
}

type AccountLifecycle = "archive" | "reactivate" | "set-default";

const listAccounts = async (
	context: BackendCommandContext
): Promise<Account[]> =>
	await queryParsed(
		context,
		"cli/v1/accounts:list",
		{ includeArchived: true },
		accountSchema.array()
	);

const getAccount = async (
	context: BackendCommandContext,
	selector: string
): Promise<Account> => {
	if (context.globalOptions.nonInteractive) {
		return await queryParsed(
			context,
			"cli/v1/accounts:get",
			{ accountId: selector },
			accountSchema
		);
	}
	return resolveIdOrExactName({
		kind: "Account",
		nonInteractive: false,
		resources: await listAccounts(context),
		selector,
	});
};

const resolveAccountTypeId = async (
	context: BackendCommandContext,
	options: { accountType?: string; accountTypeId?: string }
): Promise<string> => {
	if (options.accountTypeId) {
		return options.accountTypeId;
	}
	if (!options.accountType) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide --account-type-id or an exact --account-type name"
		);
	}
	const accountTypes = await queryParsed(
		context,
		"cli/v1/accountTypes:list",
		{ includeArchived: true },
		accountTypeSchema.array()
	);
	return resolveExactName({
		kind: "Account type",
		name: options.accountType,
		nonInteractive: false,
		resources: accountTypes,
	}).id;
};

const parseOptionalRevision = (
	value: string | undefined
): number | undefined =>
	value === undefined ? undefined : parseRevision(value);

const requireRevision = (options: {
	nonInteractive: boolean;
	provided?: number;
	what: string;
}): void => {
	if (options.nonInteractive && options.provided === undefined) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			`Non-interactive ${options.what} require an expected revision`
		);
	}
};

const throwRevisionGuidance = (
	error: unknown,
	details: Readonly<Record<string, unknown>>
): never => {
	if (error instanceof CliError && error.code === "ACCOUNT_REVISION_CONFLICT") {
		throw new CliError(
			"ACCOUNT_REVISION_CONFLICT",
			"An account changed after it was read; read the affected account again and rerun the dry run",
			{ cause: error, details }
		);
	}
	throw error;
};

export const runAccountCreate = async (
	options: AccountCreateOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	assertNamesAllowed([options.accountType], globalOptions.nonInteractive);
	const name = validateMutationText(options.name, "--name");
	if (name === undefined) {
		throw new CliError("INVALID_INPUT", "--name is required");
	}
	const startingBalance = parseBalance(options.startingBalance);
	const date = resolveCommandDate({
		explicitDate: options.date,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		const accountTypeId = await resolveAccountTypeId(context, options);
		const input = {
			accountTypeId,
			date: date.date,
			name,
			startingBalance,
		};
		if (dryRun) {
			const proposal = await mutationParsed({
				args: input,
				context,
				name: "cli/v1/accounts:previewCreate",
				schema: accountCreateProposalSchema,
			});
			writeMutationSuccess({
				context,
				data: proposal,
				human: renderAccountCreateProposal(proposal),
				meta: { dryRun: true, ...date },
				runtime,
			});
			return;
		}
		const result = await mutationParsed({
			args: { ...input, idempotencyKey },
			context,
			idempotencyKey,
			name: "cli/v1/accounts:create",
			schema: accountCreateResultSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: renderAccountCreateResult(result),
			meta: { dryRun: false, idempotencyKey, ...date },
			runtime,
		});
	});
};

export const runAccountUpdate = async (
	selector: string,
	options: AccountUpdateOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	if (
		!(
			options.name !== undefined ||
			options.accountTypeId ||
			options.accountType
		)
	) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide an account name or type change"
		);
	}
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	assertNamesAllowed([options.accountType], globalOptions.nonInteractive);
	const name = validateMutationText(options.name, "--name");
	const providedRevision = parseOptionalRevision(options.ifRevision);
	requireRevision({
		nonInteractive: globalOptions.nonInteractive,
		provided: providedRevision,
		what: "account updates",
	});
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		const current = await getAccount(context, selector);
		const expectedRevision = providedRevision ?? current.revision;
		const input: Record<string, unknown> = {
			accountId: current.id,
			expectedRevision,
		};
		if (name !== undefined) {
			input.name = name;
		}
		if (options.accountTypeId || options.accountType) {
			input.accountTypeId = await resolveAccountTypeId(context, options);
		}
		try {
			if (dryRun) {
				const preview = await mutationParsed({
					args: input,
					context,
					name: "cli/v1/accounts:previewUpdate",
					schema: accountUpdatePreviewSchema,
				});
				writeMutationSuccess({
					context,
					data: preview,
					human: renderAccountUpdatePreview(preview),
					meta: { dryRun: true, expectedRevision },
					runtime,
				});
				return;
			}
			const result = await mutationParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: "cli/v1/accounts:update",
				schema: accountSchema,
			});
			writeMutationSuccess({
				context,
				data: result,
				human: renderAccount(result),
				meta: { dryRun: false, expectedRevision, idempotencyKey },
				runtime,
			});
		} catch (error) {
			throwRevisionGuidance(error, { expectedRevision });
		}
	});
};

const lifecycleFunctionNames = {
	archive: { commit: "archive", preview: "previewArchive" },
	reactivate: { commit: "reactivate", preview: "previewReactivate" },
	"set-default": { commit: "setDefault", preview: "previewSetDefault" },
} as const;

export const runAccountLifecycle = async (
	lifecycle: AccountLifecycle,
	selector: string,
	options: AccountLifecycleOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const providedRevision = parseOptionalRevision(options.ifRevision);
	requireRevision({
		nonInteractive: globalOptions.nonInteractive,
		provided: providedRevision,
		what: `${lifecycle} commands`,
	});
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	await withBackend(command, runtime, async (context) => {
		const current = await getAccount(context, selector);
		const expectedRevision = providedRevision ?? current.revision;
		const input = { accountId: current.id, expectedRevision };
		const names = lifecycleFunctionNames[lifecycle];
		try {
			if (dryRun) {
				if (lifecycle === "set-default") {
					const preview = await mutationParsed({
						args: input,
						context,
						name: `cli/v1/accounts:${names.preview}`,
						schema: accountSchema,
					});
					writeMutationSuccess({
						context,
						data: preview,
						human: renderAccount(preview),
						meta: { dryRun: true, expectedRevision, lifecycle },
						runtime,
					});
					return;
				}
				const preview = await mutationParsed({
					args: input,
					context,
					name: `cli/v1/accounts:${names.preview}`,
					schema: accountUpdatePreviewSchema,
				});
				writeMutationSuccess({
					context,
					data: preview,
					human: renderAccountUpdatePreview(preview),
					meta: { dryRun: true, expectedRevision, lifecycle },
					runtime,
				});
				return;
			}
			const result = await mutationParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: `cli/v1/accounts:${names.commit}`,
				schema: accountSchema,
			});
			writeMutationSuccess({
				context,
				data: result,
				human: renderAccount(result),
				meta: { dryRun: false, expectedRevision, idempotencyKey, lifecycle },
				runtime,
			});
		} catch (error) {
			throwRevisionGuidance(error, { expectedRevision, lifecycle });
		}
	});
};

export const runBalanceAdjustment = async (
	selector: string,
	options: BalanceAdjustmentOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const providedRevision = parseOptionalRevision(options.ifRevision);
	requireRevision({
		nonInteractive: globalOptions.nonInteractive,
		provided: providedRevision,
		what: "balance adjustments",
	});
	const newBalance = parseBalance(options.balance);
	const note = validateMutationText(options.note, "--note");
	const date = resolveCommandDate({
		explicitDate: options.date,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	await withBackend(command, runtime, async (context) => {
		const current = await getAccount(context, selector);
		const expectedRevision = providedRevision ?? current.revision;
		const input = {
			accountId: current.id,
			date: date.date,
			expectedRevision,
			newBalance,
			...(note === undefined ? {} : { note }),
		};
		try {
			if (dryRun) {
				const preview = await mutationParsed({
					args: input,
					context,
					name: "cli/v1/accounts:previewBalanceAdjustment",
					schema: balanceAdjustmentPreviewSchema,
				});
				writeMutationSuccess({
					context,
					data: preview,
					human: renderBalanceAdjustmentPreview(preview),
					meta: { dryRun: true, expectedRevision, ...date },
					runtime,
				});
				return;
			}
			const result = await mutationParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: "cli/v1/accounts:adjustBalance",
				schema: balanceAdjustmentResultSchema,
			});
			writeMutationSuccess({
				context,
				data: result,
				human: renderBalanceAdjustmentResult(result),
				meta: { dryRun: false, expectedRevision, idempotencyKey, ...date },
				runtime,
			});
		} catch (error) {
			throwRevisionGuidance(error, { expectedRevision });
		}
	});
};

const requireTransferSelectors = (
	options: TransferOptions
): { from: string; to: string } => {
	const from = options.fromAccountId ?? options.fromAccount;
	const to = options.toAccountId ?? options.toAccount;
	if (!(from && to)) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide one source and one destination account"
		);
	}
	return { from, to };
};

const resolveTransferAccounts = async (
	context: BackendCommandContext,
	selectors: { from: string; to: string }
): Promise<{ fromAccount: Account; toAccount: Account }> => {
	if (context.globalOptions.nonInteractive) {
		const [fromAccount, toAccount] = await Promise.all([
			getAccount(context, selectors.from),
			getAccount(context, selectors.to),
		]);
		return { fromAccount, toAccount };
	}
	const accounts = await listAccounts(context);
	return {
		fromAccount: resolveIdOrExactName({
			kind: "Source account",
			nonInteractive: false,
			resources: accounts,
			selector: selectors.from,
		}),
		toAccount: resolveIdOrExactName({
			kind: "Destination account",
			nonInteractive: false,
			resources: accounts,
			selector: selectors.to,
		}),
	};
};

export const runAccountTransfer = async (
	options: TransferOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	assertNamesAllowed(
		[options.fromAccount, options.toAccount],
		globalOptions.nonInteractive
	);
	const selectors = requireTransferSelectors(options);
	const providedFromRevision = parseOptionalRevision(options.ifFromRevision);
	const providedToRevision = parseOptionalRevision(options.ifToRevision);
	if (
		globalOptions.nonInteractive &&
		(providedFromRevision === undefined || providedToRevision === undefined)
	) {
		throw new CliError(
			"NON_INTERACTIVE_INPUT_REQUIRED",
			"Non-interactive transfers require both expected account revisions"
		);
	}
	const amount = parseAmount(options.amount);
	const note = validateMutationText(options.note, "--note");
	const date = resolveCommandDate({
		explicitDate: options.date,
		now: runtime.now,
		timeZone: runtime.timeZone,
	});
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});
	await withBackend(command, runtime, async (context) => {
		const { fromAccount, toAccount } = await resolveTransferAccounts(
			context,
			selectors
		);
		const expectedFromRevision = providedFromRevision ?? fromAccount.revision;
		const expectedToRevision = providedToRevision ?? toAccount.revision;
		const input = {
			amount,
			date: date.date,
			expectedFromRevision,
			expectedToRevision,
			fromAccountId: fromAccount.id,
			...(note === undefined ? {} : { note }),
			toAccountId: toAccount.id,
		};
		try {
			if (dryRun) {
				const preview = await mutationParsed({
					args: input,
					context,
					name: "cli/v1/accounts:previewTransfer",
					schema: transferPreviewSchema,
				});
				writeMutationSuccess({
					context,
					data: preview,
					human: renderTransferPreview(preview),
					meta: {
						dryRun: true,
						expectedFromRevision,
						expectedToRevision,
						...date,
					},
					runtime,
				});
				return;
			}
			const result = await mutationParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: "cli/v1/accounts:transfer",
				schema: transferResultSchema,
			});
			writeMutationSuccess({
				context,
				data: result,
				human: renderTransferResult(result),
				meta: {
					dryRun: false,
					expectedFromRevision,
					expectedToRevision,
					idempotencyKey,
					...date,
				},
				runtime,
			});
		} catch (error) {
			throwRevisionGuidance(error, {
				expectedFromRevision,
				expectedToRevision,
			});
		}
	});
};
