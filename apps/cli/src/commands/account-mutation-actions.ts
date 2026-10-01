import type { Command } from "commander";
import type { BackendCommandContext } from "../client/convex-client.js";
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
	contextSchema,
} from "../domain/read-schemas.js";
import { resolveExactName, resolveIdOrExactName } from "../domain/selectors.js";
import { CliError } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import {
	renderAccountAddProposal,
	renderAccountAddResult,
	renderAccountEditPreview,
	renderAccountLifecycleBatchPreview,
	renderAccountLifecycleBatchSuccess,
	renderAccountLifecyclePreview,
	renderAccountSuccess,
	renderBalanceAdjustmentPreview,
	renderBalanceAdjustmentResult,
	renderSetDefaultPreview,
	renderTransferPreview,
	renderTransferResult,
} from "../output/account-mutation-terminal.js";
import { formatMoney } from "../output/human.js";
import type { CliRuntime } from "../runtime.js";
import {
	confirmMutation,
	getPrompter,
	promptDate,
	promptOptionalText,
	promptRequiredText,
	requirePrompter,
	selectAccount,
	selectAccountType,
} from "./interactive-support.js";
import {
	assertNamesAllowed,
	commitParsed,
	mutationParsed,
	queryParsed,
	withBackend,
	writeMutationSuccess,
} from "./mutation-support.js";

interface AccountAddOptions {
	accountType?: string;
	accountTypeId?: string;
	date?: string;
	dryRun?: boolean;
	idempotencyKey?: string;
	name?: string;
	startingBalance?: string;
}

interface AccountEditOptions {
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
	balance?: string;
	date?: string;
	note?: string;
}

interface TransferOptions {
	amount?: string;
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
		"accounts.list",
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
			"accounts.get",
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
		"accountTypes.list",
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

export const runAccountAdd = async (
	options: AccountAddOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	assertNamesAllowed([options.accountType], globalOptions.nonInteractive);
	const guided =
		globalOptions.interactive ||
		options.name === undefined ||
		options.startingBalance === undefined ||
		!(options.accountTypeId || options.accountType);
	const prompter = guided
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const defaultDate = resolveCommandDate({
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
		const nameInput = await promptRequiredText({
			current: options.name,
			globalOptions,
			message: "Account name",
			parse: (value) => {
				if (value.trim().length === 0) {
					throw new CliError("INVALID_INPUT", "Account name cannot be empty");
				}
			},
			runtime,
		});
		const currency =
			options.startingBalance === undefined
				? (
						await queryParsed(
							context,
							"context.get",
							{
								date: defaultDate.date,
								dateSource: defaultDate.dateSource,
								...(defaultDate.timezone
									? { timezone: defaultDate.timezone }
									: {}),
							},
							contextSchema
						)
					).currency
				: undefined;
		const balanceInput = await promptRequiredText({
			current: options.startingBalance,
			globalOptions,
			message: currency ? `Starting balance (${currency})` : "Starting balance",
			parse: parseBalance,
			runtime,
		});
		const explicitDate = prompter
			? await promptDate({
					current: options.date,
					defaultDate: defaultDate.date,
					message: "Opening balance date",
					prompter,
				})
			: options.date;
		const name = validateMutationText(nameInput, "--name");
		if (name === undefined) {
			throw new CliError("INVALID_INPUT", "--name is required");
		}
		const startingBalance = parseBalance(balanceInput);
		const date = resolveCommandDate({
			explicitDate,
			now: runtime.now,
			timeZone: runtime.timeZone,
		});
		const accountTypeId =
			options.accountTypeId || options.accountType
				? await resolveAccountTypeId(context, options)
				: (
						await selectAccountType({
							context,
							message: "Choose an account type",
							prompter: requirePrompter(prompter),
						})
					).id;
		const input = {
			accountTypeId,
			date: date.date,
			name,
			startingBalance,
		};
		if (dryRun || prompter) {
			const proposal = await mutationParsed({
				args: input,
				context,
				name: "accounts.previewCreate",
				schema: accountCreateProposalSchema,
			});
			if (dryRun) {
				writeMutationSuccess({
					context,
					data: proposal,
					human: renderAccountAddProposal(proposal),
					meta: { dryRun: true, ...date },
					runtime,
				});
				return;
			}
			await confirmMutation({
				message: "Add this account?",
				preview: renderAccountAddProposal(proposal),
				prompter,
				runtime,
			});
		}
		const result = await commitParsed({
			args: { ...input, idempotencyKey },
			context,
			idempotencyKey,
			name: "accounts.create",
			schema: accountCreateResultSchema,
		});
		writeMutationSuccess({
			context,
			data: result,
			human: renderAccountAddResult(result),
			meta: { dryRun: false, idempotencyKey, ...date },
			runtime,
		});
	});
};

const resolveAccountEditInput = async (options: {
	context: BackendCommandContext;
	hasChange: boolean;
	input: AccountEditOptions;
	prompter?: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	providedRevision?: number;
	selector?: string;
}): Promise<{
	expectedRevision: number;
	input: Record<string, unknown>;
}> => {
	const current = options.selector
		? await getAccount(options.context, options.selector)
		: await selectAccount({
				context: options.context,
				include: () => true,
				message: "Choose an account to edit",
				prompter: requirePrompter(options.prompter),
			});
	let resolvedName = options.input.name;
	let resolvedAccountTypeId = options.input.accountTypeId;
	if (!options.hasChange && options.prompter) {
		const fields = await options.prompter.multiselect({
			message: "What would you like to change?",
			options: [
				{ label: "Name", value: "name" },
				{ label: "Account type", value: "accountType" },
			],
			required: true,
		});
		if (fields.includes("name")) {
			resolvedName = await options.prompter.text({
				initialValue: current.name,
				message: "New account name",
				validate: (value) =>
					value.trim().length > 0 ? undefined : "Account name is required",
			});
		}
		if (fields.includes("accountType")) {
			resolvedAccountTypeId = (
				await selectAccountType({
					context: options.context,
					message: "Choose a new account type",
					prompter: options.prompter,
				})
			).id;
		}
	}
	const name = validateMutationText(resolvedName, "--name");
	if (
		!(name !== undefined || resolvedAccountTypeId || options.input.accountType)
	) {
		throw new CliError(
			"INVALID_INPUT",
			"Provide an account name or type change"
		);
	}
	const expectedRevision = options.providedRevision ?? current.revision;
	const input: Record<string, unknown> = {
		accountId: current.id,
		expectedRevision,
	};
	if (name !== undefined) {
		input.name = name;
	}
	if (resolvedAccountTypeId || options.input.accountType) {
		input.accountTypeId =
			resolvedAccountTypeId ??
			(await resolveAccountTypeId(options.context, options.input));
	}
	return { expectedRevision, input };
};

const executeAccountEdit = async (options: {
	context: BackendCommandContext;
	dryRun: boolean;
	expectedRevision: number;
	idempotencyKey?: string;
	input: Record<string, unknown>;
	prompter?: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	runtime: CliRuntime;
}): Promise<void> => {
	try {
		if (options.dryRun || options.prompter) {
			const preview = await mutationParsed({
				args: options.input,
				context: options.context,
				name: "accounts.previewUpdate",
				schema: accountUpdatePreviewSchema,
			});
			if (options.dryRun) {
				writeMutationSuccess({
					context: options.context,
					data: preview,
					human: renderAccountEditPreview(preview),
					meta: { dryRun: true, expectedRevision: options.expectedRevision },
					runtime: options.runtime,
				});
				return;
			}
			await confirmMutation({
				message: "Save these account changes?",
				preview: renderAccountEditPreview(preview),
				prompter: options.prompter,
				runtime: options.runtime,
			});
		}
		const result = await commitParsed({
			args: { ...options.input, idempotencyKey: options.idempotencyKey },
			context: options.context,
			idempotencyKey: options.idempotencyKey,
			name: "accounts.update",
			schema: accountSchema,
		});
		writeMutationSuccess({
			context: options.context,
			data: result,
			human: renderAccountSuccess(result, "Account updated"),
			meta: {
				dryRun: false,
				expectedRevision: options.expectedRevision,
				idempotencyKey: options.idempotencyKey,
			},
			runtime: options.runtime,
		});
	} catch (error) {
		throwRevisionGuidance(error, {
			expectedRevision: options.expectedRevision,
		});
	}
};

export const runAccountEdit = async (
	selector: string | undefined,
	options: AccountEditOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	assertNamesAllowed([options.accountType], globalOptions.nonInteractive);
	const hasChange = Boolean(
		options.name !== undefined || options.accountTypeId || options.accountType
	);
	const guided =
		globalOptions.interactive || selector === undefined || !hasChange;
	const prompter = guided
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const providedRevision = parseOptionalRevision(options.ifRevision);
	requireRevision({
		nonInteractive: globalOptions.nonInteractive,
		provided: providedRevision,
		what: "account edits",
	});
	const dryRun = options.dryRun === true;
	const idempotencyKey = resolveIdempotencyKey({
		dryRun,
		nonInteractive: globalOptions.nonInteractive,
		provided: options.idempotencyKey,
		runtime,
	});

	await withBackend(command, runtime, async (context) => {
		const resolved = await resolveAccountEditInput({
			context,
			hasChange,
			input: options,
			prompter,
			providedRevision,
			selector,
		});
		await executeAccountEdit({
			context,
			dryRun,
			expectedRevision: resolved.expectedRevision,
			idempotencyKey,
			input: resolved.input,
			prompter,
			runtime,
		});
	});
};

const lifecycleFunctionNames = {
	archive: { commit: "archive", preview: "previewArchive" },
	reactivate: { commit: "reactivate", preview: "previewReactivate" },
	"set-default": { commit: "setDefault", preview: "previewSetDefault" },
} as const;

const lifecycleSuccessMessages: Readonly<Record<AccountLifecycle, string>> = {
	archive: "Account archived",
	reactivate: "Account reactivated",
	"set-default": "Default account changed",
};

const shouldIncludeLifecycleAccount = (
	account: Account,
	lifecycle: AccountLifecycle
): boolean => {
	if (lifecycle === "archive") {
		return !account.isArchived;
	}
	if (lifecycle === "reactivate") {
		return account.isArchived;
	}
	return !(account.isArchived || account.isDefault);
};

const runAccountLifecycleBatch = async (options: {
	context: BackendCommandContext;
	dryRun: boolean;
	idempotencyKey?: string;
	lifecycle: "archive" | "reactivate";
	prompter: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	runtime: CliRuntime;
}): Promise<void> => {
	const accounts = (await listAccounts(options.context)).filter((account) =>
		shouldIncludeLifecycleAccount(account, options.lifecycle)
	);
	if (accounts.length === 0) {
		throw new CliError(
			"RESOURCE_NOT_FOUND",
			`No accounts are available to ${options.lifecycle}`
		);
	}
	const selectedIds = await options.prompter.multiselect({
		message: `Choose accounts to ${options.lifecycle}`,
		options: accounts.map((account) => ({
			hint: `${account.accountType.name} · ${formatMoney(account.currentBalance, account.currency)}`,
			label: account.name,
			value: account.id,
		})),
		required: true,
	});
	const selectedAccounts = selectedIds.map((id) => {
		const account = accounts.find((candidate) => candidate.id === id);
		if (!account) {
			throw new CliError("INTERNAL_ERROR", "Selected account was not found");
		}
		return account;
	});
	const input = {
		accounts: selectedAccounts.map((account) => ({
			accountId: account.id,
			expectedRevision: account.revision,
		})),
	};
	const preview = await mutationParsed({
		args: input,
		context: options.context,
		name:
			options.lifecycle === "archive"
				? "accounts.previewArchiveBatch"
				: "accounts.previewReactivateBatch",
		schema: accountUpdatePreviewArraySchema,
	});
	const humanPreview = renderAccountLifecycleBatchPreview(
		preview,
		options.lifecycle
	);
	if (options.dryRun) {
		writeMutationSuccess({
			context: options.context,
			data: preview,
			human: humanPreview,
			meta: { dryRun: true, lifecycle: options.lifecycle },
			runtime: options.runtime,
		});
		return;
	}
	await confirmMutation({
		message: `${options.lifecycle === "archive" ? "Archive" : "Reactivate"} ${selectedAccounts.length === 1 ? "this account" : `these ${selectedAccounts.length} accounts`}?`,
		preview: humanPreview,
		prompter: options.prompter,
		runtime: options.runtime,
	});
	const result = await commitParsed({
		args: { ...input, idempotencyKey: options.idempotencyKey },
		context: options.context,
		idempotencyKey: options.idempotencyKey,
		name:
			options.lifecycle === "archive"
				? "accounts.archiveBatch"
				: "accounts.reactivateBatch",
		schema: accountSchema.array(),
	});
	writeMutationSuccess({
		context: options.context,
		data: result,
		human: renderAccountLifecycleBatchSuccess(result, options.lifecycle),
		meta: {
			dryRun: false,
			idempotencyKey: options.idempotencyKey,
			lifecycle: options.lifecycle,
		},
		runtime: options.runtime,
	});
};

const previewAccountLifecycle = async (options: {
	context: BackendCommandContext;
	dryRun: boolean;
	expectedRevision: number;
	input: { accountId: string; expectedRevision: number };
	lifecycle: AccountLifecycle;
	previewName: "previewArchive" | "previewReactivate" | "previewSetDefault";
	prompter?: NonNullable<Awaited<ReturnType<typeof getPrompter>>>;
	runtime: CliRuntime;
}): Promise<boolean> => {
	if (!(options.dryRun || options.prompter)) {
		return false;
	}
	if (options.lifecycle === "set-default") {
		const preview = await mutationParsed({
			args: options.input,
			context: options.context,
			name: `accounts.${options.previewName}`,
			schema: accountSchema,
		});
		const previousDefault = (await listAccounts(options.context)).find(
			(account) => account.isDefault
		);
		const humanPreview = renderSetDefaultPreview(preview, previousDefault);
		if (options.dryRun) {
			writeMutationSuccess({
				context: options.context,
				data: preview,
				human: humanPreview,
				meta: {
					dryRun: true,
					expectedRevision: options.expectedRevision,
					lifecycle: options.lifecycle,
				},
				runtime: options.runtime,
			});
			return true;
		}
		await confirmMutation({
			message: "Make this the default account?",
			preview: humanPreview,
			prompter: options.prompter,
			runtime: options.runtime,
		});
		return false;
	}
	const preview = await mutationParsed({
		args: options.input,
		context: options.context,
		name: `accounts.${options.previewName}`,
		schema: accountUpdatePreviewSchema,
	});
	const humanPreview = renderAccountLifecyclePreview(
		preview,
		options.lifecycle
	);
	if (options.dryRun) {
		writeMutationSuccess({
			context: options.context,
			data: preview,
			human: humanPreview,
			meta: {
				dryRun: true,
				expectedRevision: options.expectedRevision,
				lifecycle: options.lifecycle,
			},
			runtime: options.runtime,
		});
		return true;
	}
	await confirmMutation({
		message:
			options.lifecycle === "archive"
				? "Archive this account?"
				: "Reactivate this account?",
		preview: humanPreview,
		prompter: options.prompter,
		runtime: options.runtime,
	});
	return false;
};

export const runAccountLifecycle = async (
	lifecycle: AccountLifecycle,
	selector: string | undefined,
	options: AccountLifecycleOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const prompter =
		globalOptions.interactive || selector === undefined
			? await getPrompter(globalOptions, runtime, true)
			: undefined;
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
		if (lifecycle !== "set-default" && selector === undefined && prompter) {
			try {
				await runAccountLifecycleBatch({
					context,
					dryRun,
					idempotencyKey,
					lifecycle,
					prompter,
					runtime,
				});
				return;
			} catch (error) {
				throwRevisionGuidance(error, { lifecycle });
			}
		}
		const lifecycleSelectionMessages: Readonly<
			Record<AccountLifecycle, string>
		> = {
			archive: "Choose an account to archive",
			reactivate: "Choose an account to reactivate",
			"set-default": "Choose an account to make default",
		};
		const current = selector
			? await getAccount(context, selector)
			: await selectAccount({
					context,
					include: (account) =>
						shouldIncludeLifecycleAccount(account, lifecycle),
					message: lifecycleSelectionMessages[lifecycle],
					prompter: requirePrompter(prompter),
				});
		const expectedRevision = providedRevision ?? current.revision;
		const input = { accountId: current.id, expectedRevision };
		const names = lifecycleFunctionNames[lifecycle];
		try {
			const previewOnly = await previewAccountLifecycle({
				context,
				dryRun,
				expectedRevision,
				input,
				lifecycle,
				previewName: names.preview,
				prompter,
				runtime,
			});
			if (previewOnly) {
				return;
			}
			const result = await commitParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: `accounts.${names.commit}`,
				schema: accountSchema,
			});
			writeMutationSuccess({
				context,
				data: result,
				human: renderAccountSuccess(
					result,
					lifecycleSuccessMessages[lifecycle]
				),
				meta: { dryRun: false, expectedRevision, idempotencyKey, lifecycle },
				runtime,
			});
		} catch (error) {
			throwRevisionGuidance(error, { expectedRevision, lifecycle });
		}
	});
};

export const runBalanceAdjustment = async (
	selector: string | undefined,
	options: BalanceAdjustmentOptions,
	command: Command,
	runtime: CliRuntime
): Promise<void> => {
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const guided =
		globalOptions.interactive ||
		selector === undefined ||
		options.balance === undefined;
	const prompter = guided
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
	const providedRevision = parseOptionalRevision(options.ifRevision);
	requireRevision({
		nonInteractive: globalOptions.nonInteractive,
		provided: providedRevision,
		what: "balance adjustments",
	});
	const defaultDate = resolveCommandDate({
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
		const current = selector
			? await getAccount(context, selector)
			: await selectAccount({
					context,
					include: (account) => !account.isArchived,
					message: "Choose an account to reconcile",
					prompter: requirePrompter(prompter),
				});
		const balanceInput = await promptRequiredText({
			current: options.balance,
			globalOptions,
			message: `Desired absolute balance (${current.currency}; current ${formatMoney(current.currentBalance, current.currency)})`,
			parse: parseBalance,
			runtime,
		});
		const explicitDate = prompter
			? await promptDate({
					current: options.date,
					defaultDate: defaultDate.date,
					message: "Adjustment date",
					prompter,
				})
			: options.date;
		const noteInput = prompter
			? await promptOptionalText({
					current: options.note,
					message: "Adjustment note",
					prompter,
				})
			: options.note;
		const newBalance = parseBalance(balanceInput);
		const note = validateMutationText(noteInput, "--note");
		const date = resolveCommandDate({
			explicitDate,
			now: runtime.now,
			timeZone: runtime.timeZone,
		});
		const expectedRevision = providedRevision ?? current.revision;
		const input = {
			accountId: current.id,
			date: date.date,
			expectedRevision,
			newBalance,
			...(note === undefined ? {} : { note }),
		};
		try {
			if (dryRun || prompter) {
				const preview = await mutationParsed({
					args: input,
					context,
					name: "accounts.previewBalanceAdjustment",
					schema: balanceAdjustmentPreviewSchema,
				});
				if (dryRun) {
					writeMutationSuccess({
						context,
						data: preview,
						human: renderBalanceAdjustmentPreview(preview),
						meta: { dryRun: true, expectedRevision, ...date },
						runtime,
					});
					return;
				}
				await confirmMutation({
					message: "Apply this balance adjustment?",
					preview: renderBalanceAdjustmentPreview(preview),
					prompter,
					runtime,
				});
			}
			const result = await commitParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: "accounts.adjustBalance",
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
	const fromSelector = options.fromAccountId ?? options.fromAccount;
	const toSelector = options.toAccountId ?? options.toAccount;
	const guided =
		globalOptions.interactive ||
		options.amount === undefined ||
		fromSelector === undefined ||
		toSelector === undefined;
	const prompter = guided
		? await getPrompter(globalOptions, runtime, true)
		: undefined;
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
	const defaultDate = resolveCommandDate({
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
		let fromAccount: Account;
		let toAccount: Account;
		if (fromSelector && toSelector) {
			({ fromAccount, toAccount } = await resolveTransferAccounts(context, {
				from: fromSelector,
				to: toSelector,
			}));
		} else {
			const accounts = await listAccounts(context);
			fromAccount = fromSelector
				? resolveIdOrExactName({
						kind: "Source account",
						nonInteractive: false,
						resources: accounts,
						selector: fromSelector,
					})
				: await selectAccount({
						accounts,
						context,
						include: (account) => !account.isArchived,
						message: "Choose the source account",
						prompter: requirePrompter(prompter),
					});
			toAccount = toSelector
				? resolveIdOrExactName({
						kind: "Destination account",
						nonInteractive: false,
						resources: accounts,
						selector: toSelector,
					})
				: await selectAccount({
						accounts,
						context,
						include: (account) =>
							!account.isArchived &&
							account.id !== fromAccount.id &&
							account.currency === fromAccount.currency,
						message: "Choose the destination account",
						prompter: requirePrompter(prompter),
					});
		}
		const amountInput = await promptRequiredText({
			current: options.amount,
			globalOptions,
			message: `Transfer amount (${fromAccount.currency}; available ${formatMoney(fromAccount.currentBalance, fromAccount.currency)})`,
			parse: parseAmount,
			runtime,
		});
		const explicitDate = prompter
			? await promptDate({
					current: options.date,
					defaultDate: defaultDate.date,
					message: "Transfer date",
					prompter,
				})
			: options.date;
		const noteInput = prompter
			? await promptOptionalText({
					current: options.note,
					message: "Transfer note",
					prompter,
				})
			: options.note;
		const amount = parseAmount(amountInput);
		const note = validateMutationText(noteInput, "--note");
		const date = resolveCommandDate({
			explicitDate,
			now: runtime.now,
			timeZone: runtime.timeZone,
		});
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
			if (dryRun || prompter) {
				const preview = await mutationParsed({
					args: input,
					context,
					name: "accounts.previewTransfer",
					schema: transferPreviewSchema,
				});
				if (dryRun) {
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
				await confirmMutation({
					message: "Transfer these funds?",
					preview: renderTransferPreview(preview),
					prompter,
					runtime,
				});
			}
			const result = await commitParsed({
				args: { ...input, idempotencyKey },
				context,
				idempotencyKey,
				name: "accounts.transfer",
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
