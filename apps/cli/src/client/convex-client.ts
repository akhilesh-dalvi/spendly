import type { Command } from "commander";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { createCredentialStore } from "../auth/credential-store.js";
import { getActiveSession } from "../auth/session.js";
import type { AuthReadyRuntimeConfig } from "../config.js";
import {
	createSpendlyOperations,
	type SpendlyOperations,
} from "../core/operations.js";
import { CliError, type CliErrorCode } from "../errors.js";
import { resolveGlobalOptions } from "../options.js";
import type { BackendMutation, BackendQuery, CliRuntime } from "../runtime.js";

const MAXIMUM_READ_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [100, 250] as const;

const backendErrorSchema = z.object({
	code: z.string().min(1),
	details: z.record(z.string(), z.unknown()),
	message: z.string(),
	retryable: z.boolean(),
});

const BACKEND_ERROR_CODES = new Set<CliErrorCode>([
	"ACCOUNT_ARCHIVED",
	"ACCOUNT_REVISION_CONFLICT",
	"ACCOUNT_SETUP_REQUIRED",
	"AUTHENTICATION_REQUIRED",
	"CATEGORY_CYCLE_MISMATCH",
	"DELETION_CONFIRMATION_EXPIRED",
	"DELETION_CONFIRMATION_INVALID",
	"EXPENSE_REVISION_CONFLICT",
	"IDEMPOTENCY_CONFLICT",
	"INTERNAL_ERROR",
	"INVALID_INPUT",
	"RESOURCE_LIMIT_EXCEEDED",
	"RESOURCE_NOT_FOUND",
	"TRANSFER_CURRENCY_MISMATCH",
	"TRANSFER_SAME_ACCOUNT",
]);

const isCliErrorCode = (value: string): value is CliErrorCode =>
	BACKEND_ERROR_CODES.has(value as CliErrorCode);

const parseBackendError = (error: unknown): CliError | null => {
	if (!(error instanceof ConvexError)) {
		return null;
	}
	const parsed = backendErrorSchema.safeParse(error.data);
	if (!(parsed.success && isCliErrorCode(parsed.data.code))) {
		return new CliError("INTERNAL_ERROR", "The backend request failed", {
			cause: error,
		});
	}
	return new CliError(parsed.data.code, parsed.data.message, {
		cause: error,
		details: parsed.data.details,
		retryable: parsed.data.retryable,
	});
};

const hasNetworkErrorCode = (error: unknown): boolean => {
	if (!(error && typeof error === "object" && "code" in error)) {
		return false;
	}
	return ["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ETIMEDOUT"].includes(
		String(error.code)
	);
};

const isNetworkError = (error: unknown): boolean => {
	if (error instanceof TypeError || hasNetworkErrorCode(error)) {
		return true;
	}
	if (!(error instanceof Error)) {
		return false;
	}
	return (
		error.message.toLocaleLowerCase().includes("fetch failed") ||
		(error.cause !== undefined && isNetworkError(error.cause))
	);
};

export const toBackendCliError = (error: unknown): CliError => {
	if (error instanceof CliError) {
		return error;
	}
	const backendError = parseBackendError(error);
	if (backendError) {
		return backendError;
	}
	if (
		error instanceof Error &&
		error.message.includes("ArgumentValidationError")
	) {
		return new CliError(
			"INVALID_INPUT",
			"The backend request input is invalid",
			{
				cause: error,
			}
		);
	}
	if (isNetworkError(error)) {
		return new CliError(
			"NETWORK_ERROR",
			"Unable to reach the Spendly backend",
			{ cause: error, retryable: true }
		);
	}
	return new CliError("INTERNAL_ERROR", "The backend request failed", {
		cause: error,
	});
};

const defaultSleep = async (milliseconds: number): Promise<void> =>
	await new Promise((resolve) => setTimeout(resolve, milliseconds));

export const queryWithRetry = async <Result>(options: {
	args: Readonly<Record<string, unknown>>;
	functionName: string;
	query: BackendQuery;
	retry: boolean;
	sleep?: (milliseconds: number) => Promise<void>;
}): Promise<Result> => {
	const sleep = options.sleep ?? defaultSleep;
	const attempts = options.retry ? MAXIMUM_READ_ATTEMPTS : 1;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			return await options.query<Result>(options.functionName, options.args);
		} catch (error) {
			const cliError = toBackendCliError(error);
			const isLastAttempt = attempt === attempts - 1;
			if (
				!(
					cliError.code === "NETWORK_ERROR" &&
					cliError.retryable &&
					!isLastAttempt
				)
			) {
				throw cliError;
			}
			await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 250);
		}
	}
	throw new CliError("INTERNAL_ERROR", "The backend request failed");
};

const createConvexQuery = (
	config: AuthReadyRuntimeConfig,
	idToken: string
): {
	dispose: () => void;
	mutation: BackendMutation;
	query: BackendQuery;
} => {
	const client = new ConvexHttpClient(config.convexUrl);
	client.setAuth(idToken);
	return {
		dispose: () => client.clearAuth(),
		mutation: async <Result>(
			functionName: string,
			args: Readonly<Record<string, unknown>>
		): Promise<Result> => {
			const reference = makeFunctionReference<
				"mutation",
				Record<string, unknown>,
				Result
			>(functionName);
			return await client.mutation(reference, { ...args });
		},
		query: async <Result>(
			functionName: string,
			args: Readonly<Record<string, unknown>>
		): Promise<Result> => {
			const reference = makeFunctionReference<
				"query",
				Record<string, unknown>,
				Result
			>(functionName);
			return await client.query(reference, { ...args });
		},
	};
};

export interface BackendCommandContext {
	dispose: () => void;
	globalOptions: ReturnType<typeof resolveGlobalOptions>;
	mutation: <Result>(
		functionName: string,
		args: Readonly<Record<string, unknown>>
	) => Promise<Result>;
	query: <Result>(
		functionName: string,
		args: Readonly<Record<string, unknown>>
	) => Promise<Result>;
	operations: SpendlyOperations;
	warnings: string[];
}

export const createBackendCommandContext = async (
	command: Command,
	runtime: CliRuntime
): Promise<BackendCommandContext> => {
	const config = runtime.getConfig();
	if (!config.authReady) {
		throw new CliError(
			"CONFIGURATION_ERROR",
			"Authentication is not configured in this prerelease build"
		);
	}
	const globalOptions = resolveGlobalOptions(command, runtime.environment);
	const warnings: string[] = [];
	const warn = (message: string): void => {
		if (globalOptions.json) {
			warnings.push(message);
		} else {
			runtime.stderr.write(`${message}\n`);
		}
	};

	const missingInjectedOperation = (): Promise<never> =>
		Promise.reject(
			new CliError(
				"INTERNAL_ERROR",
				"The injected backend operation is unavailable"
			)
		);
	let backend:
		| {
				dispose: () => void;
				mutation: BackendMutation;
				query: BackendQuery;
		  }
		| undefined =
		runtime.backendQuery || runtime.backendMutation
			? {
					dispose: () => undefined,
					mutation: runtime.backendMutation ?? missingInjectedOperation,
					query: runtime.backendQuery ?? missingInjectedOperation,
				}
			: undefined;
	if (!backend) {
		const store = createCredentialStore({
			allowFileStorage: globalOptions.allowFileStorage,
			clientId: config.clientId,
			issuer: config.issuer,
			warn,
		});
		const session = await getActiveSession({ config, store });
		backend = createConvexQuery(config, session.idToken);
	}

	const mutation = async <Result>(
		functionName: string,
		args: Readonly<Record<string, unknown>>
	): Promise<Result> => {
		try {
			return await backend.mutation<Result>(functionName, args);
		} catch (error) {
			throw toBackendCliError(error);
		}
	};
	const query = async <Result>(
		functionName: string,
		args: Readonly<Record<string, unknown>>
	) =>
		await queryWithRetry<Result>({
			args,
			functionName,
			query: backend.query,
			retry: globalOptions.retry,
			sleep: runtime.sleep,
		});
	return {
		dispose: backend.dispose,
		globalOptions,
		mutation,
		operations: createSpendlyOperations({
			commitProvenance: {
				decorate: (args, origin) => ({
					...args,
					...(origin === "cli_agent" ? { agent: true } : {}),
				}),
				origin: globalOptions.agent ? "cli_agent" : "cli",
			},
			mutation,
			query,
		}),
		query,
		warnings,
	};
};
