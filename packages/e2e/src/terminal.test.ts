import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { type RunningTerminal, startTerminal, terminalKeys } from "./terminal";

const patterns = {
	tty: /TTY:true,true,true/u,
	literalArgument: /ARG:literal; \$\(echo never-interpolate\) ' " spaces/u,
	ready: /READY/u,
	received: /RECEIVED/u,
	first: /FIRST/u,
	second: /SECOND café/u,
	privateReady: /ready/u,
	deadline: /^Terminal process timed out$/u,
	outputLimit: /^Terminal output limit exceeded$/u,
	never: /NEVER/u,
	missing: /missing/u,
	waitDeadline: /^Timed out waiting for terminal output; output withheld$/u,
};

const terminals: RunningTerminal[] = [];
const directories: string[] = [];
const terminal = (
	script: string,
	options: { timeoutMs?: number; maxOutputBytes?: number; args?: string[] } = {}
) => {
	const child = startTerminal({
		command: process.execPath,
		args: ["-e", script, ...(options.args ?? [])],
		env: { PATH: process.env.PATH ?? "", TERM: "xterm-256color" },
		timeoutMs: options.timeoutMs ?? 5000,
		maxOutputBytes: options.maxOutputBytes,
	});
	terminals.push(child);
	return child;
};

afterEach(async () => {
	await Promise.all(
		terminals.splice(0).map(async (child) => await child.stop())
	);
	await Promise.all(
		directories
			.splice(0)
			.map(
				async (directory) =>
					await rm(directory, { recursive: true, force: true })
			)
	);
});

describe("real POSIX terminal controller (offline)", () => {
	it("gives stdin/stdout/stderr a TTY, passes literal arguments and returns no transcript", async () => {
		const child = terminal(
			"process.stdout.write('TTY:' + [process.stdin.isTTY, process.stdout.isTTY, process.stderr.isTTY].join(',')); process.stdout.write('ARG:' + process.argv[1]);",
			{ args: ["literal; $(echo never-interpolate) ' \" spaces"] }
		);
		await child.waitForOutput(patterns.tty);
		await child.waitForOutput(patterns.literalArgument);
		expect(await child.result).toEqual({ exitCode: 0, signal: null });
	});

	it("delivers arrow navigation, Enter and Ctrl+C as genuine raw terminal input", async () => {
		const child = terminal(`
			process.stdin.setRawMode(true);
			process.stdout.write('READY');
			let input = '';
			process.stdin.on('data', chunk => {
				input += chunk.toString();
				if (input === '\\x1b[B\\r\\x03') {
					process.stdout.write('RECEIVED');
					process.exit(0);
				}
			});
		`);
		await child.waitForOutput(patterns.ready);
		child.write(terminalKeys.down);
		child.write(terminalKeys.enter);
		child.write(terminalKeys.ctrlC);
		await child.waitForOutput(patterns.received);
		expect(await child.result).toEqual({ exitCode: 0, signal: null });
	});

	it("handles ANSI/split Unicode and two prompts in one chunk without stale matches", async () => {
		const child = terminal(
			"process.stdout.write('\\x1b[32mFIRST\\x1b[0m SECOND ca'); const bytes = Buffer.from('fé'); process.stdout.write(bytes.subarray(0, 2)); setTimeout(() => process.stdout.write(bytes.subarray(2)), 25);"
		);
		await child.waitForOutput(/FIRST/gu);
		await child.waitForOutput(patterns.second);
		await expect(child.waitForOutput(patterns.first)).rejects.toThrow(
			"exited before expected output"
		);
		expect((await child.result).exitCode).toBe(0);
	});

	it("does not confuse PTY exit status with bridge success", async () => {
		const child = terminal("process.exit(7)");
		expect(await child.result).toEqual({ exitCode: 7, signal: null });
	});

	it("reports signals from the terminal child", async () => {
		const child = terminal("process.kill(process.pid, 'SIGTERM')");
		expect(await child.result).toEqual({ exitCode: null, signal: 15 });
	});

	it("times out and reaps a hung child without exposing its output", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-terminal-test-"));
		directories.push(directory);
		const marker = join(directory, "pid");
		const child = terminal(
			"require('node:fs').writeFileSync(process.argv[1], String(process.pid)); process.stdout.write('PRIVATE ready'); setInterval(() => {}, 1000);",
			{ args: [marker], timeoutMs: 1500 }
		);
		await child.waitForOutput(patterns.privateReady);
		const pid = Number(await readFile(marker, "utf8"));
		await expect(child.result).rejects.toThrow(patterns.deadline);
		await child.stop();
		expect(() => process.kill(pid, 0)).toThrow();
	});

	it("bounds output and reaps the producer", async () => {
		const child = terminal(
			"setInterval(() => process.stdout.write('sensitive'.repeat(1000)), 1);",
			{ maxOutputBytes: 1024 }
		);
		await expect(child.result).rejects.toThrow(patterns.outputLimit);
		await child.stop();
	});

	it("cancels pending waits and reaps on explicit stop", async () => {
		const child = terminal(
			"process.stdout.write('READY'); setInterval(() => {}, 1000);"
		);
		await child.waitForOutput(patterns.ready);
		const wait = child.waitForOutput(patterns.never);
		const assertion = expect(wait).rejects.toThrow(
			"exited before expected output"
		);
		await child.stop();
		await assertion;
		expect(await child.result).toEqual({ exitCode: null, signal: 9 });
		await child.stop();
	});

	it("kills descendants in the owned PTY group before returning from stop", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-terminal-test-"));
		directories.push(directory);
		const marker = join(directory, "should-not-be-written");
		const child = terminal(
			`
			require('node:child_process').spawn(process.execPath, ['-e',
				"setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'late write'), 400)", process.argv[1]],
				{ stdio: 'inherit' });
			process.stdout.write('READY');
			setInterval(() => {}, 1000);
		`,
			{ args: [marker] }
		);
		await child.waitForOutput(patterns.ready);
		await child.stop();
		await delay(700);
		expect(existsSync(marker)).toBe(false);
		expect(await child.result).toEqual({ exitCode: null, signal: 9 });
	});

	it("keeps process and output details out of wait errors", async () => {
		const child = terminal(
			"process.stdout.write('SECRET'); setInterval(() => {}, 1000);"
		);
		await expect(child.waitForOutput(patterns.missing, 100)).rejects.toThrow(
			patterns.waitDeadline
		);
	});

	it("rejects invalid deadlines before starting a process", () => {
		expect(() => terminal("", { timeoutMs: 0 })).toThrow(
			"Invalid terminal limits"
		);
	});
});
