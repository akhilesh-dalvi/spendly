import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runProcess, startProcess } from "./process.js";

const READY_PATTERN = /ready/u;
const EURO_PATTERN = /€/u;
const SECRET_PATTERN = /secret/u;
const PID_PATTERN = /\d+/u;
const URL_PATTERN = /https:\/\/[^\s]+/u;
const MISSING_PATTERN = /missing-private-token/u;
const GLOBAL_READY_PATTERN = /ready/gu;

describe("isolated subprocesses", () => {
	it("uses the supplied cwd and exact environment without adding inherited values", async () => {
		const cwd = await realpath(tmpdir());
		const result = await runProcess({
			args: [
				"-e",
				"process.stdout.write(JSON.stringify({ cwd: process.cwd(), marker: process.env.PROCESS_TEST_MARKER, path: process.env.PATH ?? null }));",
			],
			command: process.execPath,
			cwd,
			env: { PROCESS_TEST_MARKER: "isolated" },
		});

		expect(JSON.parse(result.stdout)).toEqual({
			cwd,
			marker: "isolated",
			path: null,
		});
		expect(result.exitCode).toBe(0);
	});

	it("handles asynchronous spawn errors while waiting without unhandled result rejections", async () => {
		const child = startProcess({
			args: ["private-token"],
			command: "/missing-spendly-command/private-command",
		});
		await expect(child.waitForOutput(MISSING_PATTERN)).rejects.toThrow(
			"Unable to start subprocess"
		);
		await expect(child.result).rejects.toMatchObject({
			message: "Unable to start subprocess",
		});
		await expect(child.result).rejects.not.toHaveProperty("cause");
		await child.stop();
	});

	it("rejects pending output waits on a process limit before the result is awaited", async () => {
		const child = startProcess({
			args: ["-e", "setInterval(() => {}, 1000);"],
			command: process.execPath,
			timeoutMs: 100,
		});
		await expect(child.waitForOutput(MISSING_PATTERN)).rejects.toThrow(
			"Subprocess timed out"
		);
		await child.stop();
		await expect(child.result).rejects.toThrow("Subprocess timed out");
	});

	it("bounds output waits independently without terminating the running child", async () => {
		const child = startProcess({
			args: [
				"-e",
				"process.stdout.write('ready'); setInterval(() => {}, 1000);",
			],
			command: process.execPath,
		});
		try {
			await child.waitForOutput(READY_PATTERN);
			await expect(child.waitForOutput(MISSING_PATTERN, 20)).rejects.toThrow(
				"Timed out waiting for subprocess output"
			);
			expect(await child.waitForOutput(READY_PATTERN)).toBe("ready");
		} finally {
			await child.stop();
		}
	});

	it("replays retained matches after exit without mutating stateful regexes", async () => {
		const child = startProcess({
			args: [
				"-e",
				"process.stdout.write('rea'); setTimeout(() => process.stdout.write('dy'), 30);",
			],
			command: process.execPath,
		});
		await child.result;
		GLOBAL_READY_PATTERN.lastIndex = 99;
		const matches = await Promise.all([
			child.waitForOutput(GLOBAL_READY_PATTERN),
			child.waitForOutput(GLOBAL_READY_PATTERN),
		]);
		expect(matches).toEqual(["ready", "ready"]);
		expect(GLOBAL_READY_PATTERN.lastIndex).toBe(99);
		await expect(child.waitForOutput(MISSING_PATTERN)).rejects.toThrow(
			"Subprocess exited before expected output"
		);
	});
	it("keeps the deadline bounded when an exited child leaves inherited output pipes open", async () => {
		const child = startProcess({
			args: [
				"-e",
				"const { spawn } = require('node:child_process'); const descendant = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000);'], { stdio: 'inherit' }); process.stdout.write(String(descendant.pid)); descendant.unref();",
			],
			command: process.execPath,
			timeoutMs: 150,
		});
		let descendantPid: number | undefined;
		try {
			descendantPid = Number(await child.waitForOutput(PID_PATTERN));
			await expect(
				Promise.race([
					child.result,
					new Promise((resolve) => setTimeout(resolve, 400)),
				])
			).rejects.toThrow("Subprocess timed out");
			await expect
				.poll(
					() => {
						try {
							process.kill(descendantPid ?? 0, 0);
							return true;
						} catch {
							return false;
						}
					},
					{ timeout: 500 }
				)
				.toBe(false);
		} finally {
			if (descendantPid !== undefined) {
				try {
					process.kill(descendantPid, "SIGKILL");
				} catch {
					// The process group may already have been reaped.
				}
			}
			await child.stop();
		}
	});
	it("rejects invalid output-wait timeouts even when matching output is retained", async () => {
		const child = startProcess({
			args: ["-e", "process.stdout.write('ready');"],
			command: process.execPath,
		});
		await child.result;
		await expect(
			child.waitForOutput(READY_PATTERN, Number.NaN)
		).rejects.toThrow("Invalid subprocess wait timeout");
	});
	it("preserves UTF-8 characters split across output chunks", async () => {
		const child = startProcess({
			args: [
				"-e",
				"process.stdout.write(Buffer.from([0xe2])); setTimeout(() => process.stdout.write(Buffer.from([0x82, 0xac])), 30);",
			],
			command: process.execPath,
		});
		try {
			expect((await child.result).stdout).toBe("€");
			expect(await child.waitForOutput(EURO_PATTERN)).toBe("€");
		} finally {
			await child.stop();
		}
	});
	it.each([
		{ timeoutMs: 0 },
		{ timeoutMs: -1 },
		{ timeoutMs: Number.NaN },
		{ timeoutMs: Number.POSITIVE_INFINITY },
		{ timeoutMs: 2 ** 31 },
		{ maxOutputBytes: 0 },
		{ maxOutputBytes: -1 },
		{ maxOutputBytes: Number.NaN },
		{ maxOutputBytes: Number.POSITIVE_INFINITY },
		{ maxOutputBytes: 1.5 },
	])(
		"rejects invalid bounds before executing the child: %j",
		async (limits) => {
			await expect(
				runProcess({
					args: ["-e", "process.stdout.write('should not execute');"],
					command: process.execPath,
					...limits,
				})
			).rejects.toThrow("Invalid subprocess limits");
		}
	);
	it("sanitizes synchronous spawn failures without exposing arguments or environment", async () => {
		const child = startProcess({
			args: ["secret-token\u0000"],
			command: process.execPath,
			env: { PRIVATE_TOKEN: "private-environment" },
		});
		await expect(child.result).rejects.toThrow("Unable to start subprocess");
		await expect(child.waitForOutput(SECRET_PATTERN)).rejects.toThrow(
			"Unable to start subprocess"
		);
		await child.stop();
	});
	it("bounds combined output bytes, not characters, and reaps an overflowing child", async () => {
		const child = startProcess({
			args: [
				"-e",
				"process.stdout.write(String(process.pid)); setTimeout(() => { process.stdout.write('é'.repeat(20)); process.stderr.write('é'.repeat(20)); }, 50); setInterval(() => {}, 1000);",
			],
			command: process.execPath,
			maxOutputBytes: 70,
		});
		try {
			const pid = Number(await child.waitForOutput(PID_PATTERN));
			await expect(
				Promise.race([
					child.result,
					new Promise((resolve) => setTimeout(resolve, 400)),
				])
			).rejects.toThrow("Subprocess output limit exceeded");
			expect(() => process.kill(pid, 0)).toThrow();
		} finally {
			await child.stop();
		}
	});
	it("times out, kills even a signal-resistant child, and rejects only after reaping it", async () => {
		const child = startProcess({
			args: [
				"-e",
				"process.on('SIGTERM', () => {}); process.stdout.write(String(process.pid)); setInterval(() => {}, 1000);",
			],
			command: process.execPath,
			timeoutMs: 150,
		});
		try {
			const pid = Number(await child.waitForOutput(PID_PATTERN));
			await expect(
				Promise.race([
					child.result,
					new Promise((resolve) => setTimeout(resolve, 400)),
				])
			).rejects.toThrow("Subprocess timed out");
			expect(() => process.kill(pid, 0)).toThrow();
		} finally {
			await child.stop();
		}
	});
	it("captures authorization URLs on stderr while running and reaps an explicitly stopped child", async () => {
		const child = startProcess({
			args: [
				"-e",
				"process.stderr.write('Open this URL: https://issuer.example/oauth?state=private\\n'); setInterval(() => {}, 1000);",
			],
			command: process.execPath,
		});

		try {
			expect(await child.waitForOutput(URL_PATTERN)).toBe(
				"https://issuer.example/oauth?state=private"
			);
		} finally {
			await child.stop();
		}
		expect(await child.result).toMatchObject({
			exitCode: null,
			signal: "SIGKILL",
		});
		await child.stop();
	});
	it("returns separate output and nonzero exits without interpreting shell arguments", async () => {
		const result = await runProcess({
			args: [
				"-e",
				"process.stdout.write(process.argv[1]); process.stderr.write('diagnostic'); process.exitCode = 7;",
				"literal; $(echo unsafe)",
			],
			command: process.execPath,
		});

		expect(result).toEqual({
			exitCode: 7,
			signal: null,
			stderr: "diagnostic",
			stdout: "literal; $(echo unsafe)",
		});
	});
});
