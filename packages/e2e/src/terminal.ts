import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { z } from "zod";

export interface TerminalOptions {
	args: readonly string[];
	command: string;
	cwd?: string;
	env: NodeJS.ProcessEnv;
	maxOutputBytes?: number;
	timeoutMs?: number;
}

interface TerminalResult {
	exitCode: number | null;
	/** POSIX signal number, unlike child_process's string signal names. */
	signal: number | null;
}

export interface RunningTerminal {
	result: Promise<TerminalResult>;
	stop: () => Promise<void>;
	/** Waits consume output so an old prompt cannot satisfy the next step. */
	waitForOutput: (pattern: RegExp, timeoutMs?: number) => Promise<void>;
	write: (input: string) => void;
}

export const terminalKeys = {
	ctrlC: "\x03",
	down: "\x1b[B",
	enter: "\r",
	escape: "\x1b",
	left: "\x1b[D",
	right: "\x1b[C",
	space: " ",
	up: "\x1b[A",
} as const;

const BRIDGE = fileURLToPath(new URL("./terminal-bridge.py", import.meta.url));
const STATEFUL_FLAGS = /[gy]/gu;
const MAX_TIMER_MS = 2 ** 31 - 1;
const metadataSchema = z.union([
	z.object({ pid: z.number().int().positive() }).strict(),
	z.object({ exitCode: z.number().int() }).strict(),
	z
		.object({
			error: z
				.object({
					errno: z.number().int().nonnegative().nullable(),
					stage: z.enum([
						"allocation",
						"window-size",
						"selector",
						"select",
						"read",
						"write",
						"terminate",
						"reap",
						"close",
					]),
				})
				.strict(),
		})
		.strict(),
]);
const positiveInteger = (value: number, maximum: number): boolean =>
	Number.isSafeInteger(value) && value > 0 && value <= maximum;

const bridgeFailureMessage = (stage: string, number: number | null): string => {
	const code = number === null ? "" : ` (errno ${number})`;
	return `Terminal bridge failed at ${stage}${code}; details withheld`;
};

/** A real controlling terminal; neither /bin/sh nor developer credentials are used. */
export const startTerminal = (options: TerminalOptions): RunningTerminal => {
	if (process.platform === "win32") {
		throw new Error(
			"PTY E2E requires POSIX and Python 3; Windows is unsupported"
		);
	}
	const timeoutMs = options.timeoutMs ?? 30_000;
	const maximumOutput = options.maxOutputBytes ?? 1024 * 1024;
	if (
		!(
			positiveInteger(timeoutMs, MAX_TIMER_MS) &&
			positiveInteger(maximumOutput, Number.MAX_SAFE_INTEGER)
		)
	) {
		throw new Error("Invalid terminal limits");
	}
	const child = spawn(
		"python3",
		["-I", "-u", BRIDGE, options.command, ...options.args],
		{
			cwd: options.cwd,
			env: options.env,
			shell: false,
			stdio: ["pipe", "pipe", "pipe"],
		}
	);
	let resolveResult: (result: TerminalResult) => void = () => undefined;
	let rejectResult: (error: Error) => void = () => undefined;
	const result = new Promise<TerminalResult>((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	// A caller may first be awaiting a prompt rather than process completion.
	result.catch(() => undefined);
	let resolveClosed: () => void = () => undefined;
	const closed = new Promise<void>((resolve) => {
		resolveClosed = resolve;
	});
	let finished = false;
	let failure: Error | undefined;
	let ownedPid: number | undefined;
	let exitCode: number | undefined;
	let escalation: ReturnType<typeof setTimeout> | undefined;
	let output = "";
	let consumed = 0;
	let bytes = 0;
	let metadata = "";
	const decoder = new StringDecoder("utf8");
	const listeners = new Set<() => void>();
	const notify = () => {
		for (const listener of listeners) {
			listener();
		}
	};
	const killOwned = () => {
		if (ownedPid !== undefined) {
			try {
				process.kill(-ownedPid, "SIGKILL");
			} catch {
				// A group already reaped by the bridge needs no further cleanup.
			}
		}
	};
	const terminate = () => {
		killOwned();
		child.kill("SIGTERM");
		escalation ??= setTimeout(() => {
			killOwned();
			child.kill("SIGKILL");
		}, 1000);
	};
	const fail = (message: string) => {
		failure ??= new Error(message);
		terminate();
		notify();
	};
	const deadline = setTimeout(
		() => fail("Terminal process timed out"),
		timeoutMs
	);
	child.stdin.on("error", () => fail("Terminal input closed unexpectedly"));
	child.stdout.on("data", (chunk: Buffer) => {
		if (failure) {
			return;
		}
		bytes += chunk.length;
		if (bytes > maximumOutput) {
			fail("Terminal output limit exceeded");
			return;
		}
		output += decoder.write(chunk);
		notify();
	});
	child.stderr.on("data", (chunk: Buffer) => {
		metadata += chunk.toString("utf8");
		if (metadata.length > 4096) {
			fail("Terminal bridge failed; details withheld");
			return;
		}
		let newline = metadata.indexOf("\n");
		while (newline !== -1) {
			const line = metadata.slice(0, newline);
			metadata = metadata.slice(newline + 1);
			try {
				const message = metadataSchema.parse(JSON.parse(line));
				if ("pid" in message) {
					ownedPid = message.pid;
					if (failure) {
						killOwned();
					}
				} else if ("error" in message) {
					fail(bridgeFailureMessage(message.error.stage, message.error.errno));
				} else {
					({ exitCode } = message);
				}
			} catch {
				fail("Terminal bridge failed; details withheld");
			}
			newline = metadata.indexOf("\n");
		}
	});
	child.on("error", () =>
		fail("Unable to start terminal; Python 3 is required")
	);
	child.on("close", (code) => {
		finished = true;
		clearTimeout(deadline);
		clearTimeout(escalation);
		child.stdin.destroy();
		output += decoder.end();
		if (failure) {
			rejectResult(failure);
		} else if (code !== 0 || exitCode === undefined) {
			rejectResult(
				new Error("Terminal bridge did not complete; details withheld")
			);
		} else {
			resolveResult({
				exitCode: exitCode < 0 ? null : exitCode,
				signal: exitCode < 0 ? -exitCode : null,
			});
		}
		// The bridge reports exit only after killing the owned group and waitpid.
		resolveClosed();
		notify();
	});
	return {
		result,
		async stop() {
			if (!finished) {
				terminate();
			}
			await closed;
		},
		waitForOutput(pattern, waitMs = 10_000) {
			if (!positiveInteger(waitMs, MAX_TIMER_MS)) {
				return Promise.reject(new Error("Invalid terminal wait timeout"));
			}
			const search = new RegExp(
				pattern.source,
				pattern.flags.replace(STATEFUL_FLAGS, "")
			);
			return new Promise<void>((resolve, reject) => {
				const cleanup = () => {
					clearTimeout(timer);
					listeners.delete(check);
				};
				const check = () => {
					const available = stripVTControlCharacters(output).slice(consumed);
					const match = search.exec(available);
					if (failure) {
						cleanup();
						reject(failure);
					} else if (match) {
						// Leave later prompts in this same chunk available to the next wait.
						consumed += match.index + match[0].length;
						cleanup();
						resolve();
					} else if (finished) {
						cleanup();
						reject(
							new Error(
								"Terminal exited before expected output; output withheld"
							)
						);
					}
				};
				const timer = setTimeout(() => {
					cleanup();
					reject(
						new Error("Timed out waiting for terminal output; output withheld")
					);
				}, waitMs);
				listeners.add(check);
				check();
			});
		},
		write(input) {
			if (finished || failure) {
				throw new Error("Terminal is no longer accepting input");
			}
			child.stdin.write(input);
		},
	};
};
