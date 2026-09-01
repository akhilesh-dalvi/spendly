import { createServer, type Server } from "node:http";
import { CliError } from "../errors.js";

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const CALLBACK_RESPONSE_HEADERS = {
	"cache-control": "no-store",
	"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
	"content-type": "text/plain; charset=utf-8",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
} as const;

export interface CallbackResult {
	code: string;
}

export interface CallbackServer {
	close: () => Promise<void>;
	redirectUri: string;
	waitForCallback: Promise<CallbackResult>;
}

const closeServer = async (server: Server): Promise<void> => {
	if (!server.listening) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
};

export const startCallbackServer = async (options: {
	expectedState: string;
	timeoutMs?: number;
}): Promise<CallbackServer> => {
	let resolveCallback: (result: CallbackResult) => void = () => undefined;
	let rejectCallback: (error: Error) => void = () => undefined;
	const waitForCallback = new Promise<CallbackResult>((resolve, reject) => {
		resolveCallback = resolve;
		rejectCallback = reject;
	});

	let settled = false;
	const finish = (result: CallbackResult | Error): void => {
		if (settled) {
			return;
		}
		settled = true;
		clearTimeout(timeout);
		if (result instanceof Error) {
			rejectCallback(result);
		} else {
			resolveCallback(result);
		}
	};

	const server = createServer((request, response) => {
		const requestUrl = new URL(request.url ?? "/", `http://${CALLBACK_HOST}`);
		if (request.method !== "GET" || requestUrl.pathname !== CALLBACK_PATH) {
			response.writeHead(404, CALLBACK_RESPONSE_HEADERS);
			response.end("Not found");
			return;
		}

		const states = requestUrl.searchParams.getAll("state");
		const codes = requestUrl.searchParams.getAll("code");
		const state = states[0];
		const code = codes[0];
		const oauthError = requestUrl.searchParams.get("error");
		if (states.length !== 1 || state !== options.expectedState) {
			response.writeHead(400, CALLBACK_RESPONSE_HEADERS);
			response.end("Invalid Spendly authorization callback.", () => {
				finish(
					new CliError(
						"INVALID_AUTH_CALLBACK",
						"Authorization callback validation failed"
					)
				);
				server.close();
			});
			return;
		}
		if (oauthError) {
			response.writeHead(400, CALLBACK_RESPONSE_HEADERS);
			response.end("Spendly authorization was denied.", () => {
				finish(
					new CliError("AUTHENTICATION_REQUIRED", "Authorization was denied")
				);
				server.close();
			});
			return;
		}
		if (codes.length !== 1 || !code) {
			response.writeHead(400, CALLBACK_RESPONSE_HEADERS);
			response.end("Invalid Spendly authorization callback.", () => {
				finish(
					new CliError(
						"INVALID_AUTH_CALLBACK",
						"Authorization callback validation failed"
					)
				);
				server.close();
			});
			return;
		}

		response.writeHead(200, {
			...CALLBACK_RESPONSE_HEADERS,
			"content-type": "text/html; charset=utf-8",
		});
		response.end(
			"<!doctype html><title>Spendly authorized</title><p>Spendly CLI is authorized. You can close this tab.</p>",
			() => {
				finish({ code });
				server.close();
			}
		);
	});

	const timeout = setTimeout(() => {
		finish(
			new CliError(
				"AUTHENTICATION_REQUIRED",
				"Authorization timed out after five minutes"
			)
		);
		server.close();
	}, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	timeout.unref();

	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, CALLBACK_HOST, resolve);
		});
	} catch (error) {
		clearTimeout(timeout);
		await closeServer(server);
		throw new CliError("INTERNAL_ERROR", "Unable to start callback server", {
			cause: error,
		});
	}
	const address = server.address();
	if (!address || typeof address === "string") {
		await closeServer(server);
		throw new CliError(
			"INTERNAL_ERROR",
			"Unable to determine the authorization callback port"
		);
	}

	return {
		close: () => closeServer(server),
		redirectUri: `http://${CALLBACK_HOST}:${address.port}${CALLBACK_PATH}`,
		waitForCallback,
	};
};
