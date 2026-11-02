import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export interface ProcessOptions {
	args: readonly string[];
	command: string;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	maxOutputBytes?: number;
	timeoutMs?: number;
}

export interface ProcessResult {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stderr: string;
	stdout: string;
}

export interface RunningProcess {
	result: Promise<ProcessResult>;
	stop: () => Promise<void>;
	waitForOutput: (pattern: RegExp, timeoutMs?: number) => Promise<string>;
}

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_TIMEOUT_MS = 10_000;
const MAX_TIMER_MS = 2 ** 31 - 1;
const isPositiveInteger = (value: number, maximum: number): boolean =>
	Number.isSafeInteger(value) && value > 0 && value <= maximum;
const STATEFUL_FLAGS = /[gy]/gu;

const spawnChild = (options: ProcessOptions) =>
	spawn(options.command, options.args, {
		cwd: options.cwd,
		detached: process.platform !== "win32",
		env: options.env,
		shell: false,
		stdio: ["ignore", "pipe", "pipe"],
	});

const failedProcess = (error: Error): RunningProcess => {
	const result = Promise.reject<ProcessResult>(error);
	result.catch(() => undefined);
	return {
		result,
		stop: () => Promise.resolve(),
		waitForOutput: () => Promise.reject(error),
	};
};

export const startProcess = (options: ProcessOptions): RunningProcess => {
	const timeoutMs = options.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
	const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	if (
		!(
			isPositiveInteger(timeoutMs, MAX_TIMER_MS) &&
			isPositiveInteger(maxOutputBytes, Number.MAX_SAFE_INTEGER)
		)
	) {
		return failedProcess(new Error("Invalid subprocess limits"));
	}
	let child: ReturnType<typeof spawnChild>;
	try {
		child = spawnChild(options);
	} catch {
		return failedProcess(new Error("Unable to start subprocess"));
	}
	let resolveResult: (value: ProcessResult) => void = () => undefined;
	let rejectResult: (error: Error) => void = () => undefined;
	const result = new Promise<ProcessResult>((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	// Callers may be awaiting output before they await the final result.
	result.catch(() => undefined);
	let resolveClosed: () => void = () => undefined;
	const closed = new Promise<void>((resolve) => {
		resolveClosed = resolve;
	});
	let stdout = "";
	let stderr = "";
	const stdoutDecoder = new StringDecoder("utf8");
	const stderrDecoder = new StringDecoder("utf8");
	let finished = false;
	let failure: Error | undefined;
	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};
	const killOwnedProcesses = (): void => {
		if (process.platform !== "win32" && child.pid !== undefined) {
			try {
				// A detached POSIX child owns a process group, including pnpm/Next
				// descendants. Never signal the harness's own process group.
				process.kill(-child.pid, "SIGKILL");
			} catch {
				// An already-exited group is harmless; still attempt direct cleanup.
				child.kill("SIGKILL");
			}
		} else {
			child.kill("SIGKILL");
		}
	};
	const terminate = (): void => {
		killOwnedProcesses();
		// Descendants may inherit the pipes; they must not postpone child reaping.
		child.stdout.destroy();
		child.stderr.destroy();
	};
	let outputBytes = 0;
	const acceptChunk = (chunk: Buffer): boolean => {
		if (failure) {
			return false;
		}
		outputBytes += chunk.length;
		if (outputBytes > maxOutputBytes) {
			failure = new Error("Subprocess output limit exceeded");
			terminate();
			return false;
		}
		return true;
	};
	child.stdout.on("data", (chunk: Buffer) => {
		if (acceptChunk(chunk)) {
			stdout += stdoutDecoder.write(chunk);
			notify();
		}
	});
	child.stderr.on("data", (chunk: Buffer) => {
		if (acceptChunk(chunk)) {
			stderr += stderrDecoder.write(chunk);
			notify();
		}
	});
	const deadline = setTimeout(() => {
		failure ??= new Error("Subprocess timed out");
		terminate();
	}, timeoutMs);
	child.on("error", () => {
		failure = new Error("Unable to start subprocess");
	});
	child.on("close", (exitCode, signal) => {
		killOwnedProcesses();
		finished = true;
		clearTimeout(deadline);
		stdout += stdoutDecoder.end();
		stderr += stderrDecoder.end();
		if (failure) {
			rejectResult(failure);
		} else {
			resolveResult({ exitCode, signal, stderr, stdout });
		}
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
		waitForOutput(pattern, waitTimeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
			if (!isPositiveInteger(waitTimeoutMs, MAX_TIMER_MS)) {
				return Promise.reject(new Error("Invalid subprocess wait timeout"));
			}
			const search = new RegExp(
				pattern.source,
				pattern.flags.replace(STATEFUL_FLAGS, "")
			);
			return new Promise((resolve, reject) => {
				const cleanup = (): void => {
					clearTimeout(timer);
					listeners.delete(check);
				};
				const check = (): void => {
					const match = search.exec(stdout) ?? search.exec(stderr);
					if (match) {
						cleanup();
						resolve(match[0]);
					} else if (finished) {
						cleanup();
						reject(
							failure ?? new Error("Subprocess exited before expected output")
						);
					}
				};
				const timer = setTimeout(() => {
					cleanup();
					reject(new Error("Timed out waiting for subprocess output"));
				}, waitTimeoutMs);
				listeners.add(check);
				check();
			});
		},
	};
};

export const runProcess = async (
	options: ProcessOptions
): Promise<ProcessResult> => await startProcess(options).result;
