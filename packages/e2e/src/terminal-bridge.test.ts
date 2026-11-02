import type { SpawnOptions } from "node:child_process";
import { constants } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { type RunningTerminal, startTerminal } from "./terminal";

const fault = vi.hoisted(() => ({ stage: "allocation", metadata: "" }));

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: (
			command: string,
			args: readonly string[],
			options: SpawnOptions
		) => {
			if (command !== "python3") {
				return actual.spawn(command, args, options);
			}
			// Inject an OS failure into the real bridge, not a fake metadata stream.
			// The wrapper is in memory; no production test-injection flag is needed.
			const wrapper = `
import errno, fcntl, pty, runpy, sys, termios
stage, bridge = sys.argv[1:3]
sys.argv = sys.argv[2:]
def fail(*args, **kwargs):
    raise OSError(errno.EIO, "PRIVATE exception and credentials must not escape")
if stage == "allocation":
    pty.fork = fail
else:
    original_ioctl = fcntl.ioctl
    def ioctl(fd, request, *args):
        if request == termios.TIOCSWINSZ:
            fail()
        return original_ioctl(fd, request, *args)
    fcntl.ioctl = ioctl
runpy.run_path(bridge, run_name="__main__")
`;
			const child = actual.spawn(
				command,
				["-I", "-u", "-c", wrapper, fault.stage, ...args.slice(2)],
				options
			);
			child.stderr?.on("data", (chunk: Buffer) => {
				fault.metadata += chunk.toString("utf8");
			});
			return child;
		},
	};
});

let terminal: RunningTerminal | undefined;

afterEach(async () => {
	await terminal?.stop();
	terminal = undefined;
	fault.metadata = "";
});

it.each([
	"allocation",
	"window-size",
])("reports a safe %s error and reaps any allocated child", async (stage) => {
	fault.stage = stage;
	terminal = startTerminal({
		command: process.execPath,
		args: [
			"-e",
			"process.stdout.write('PRIVATE transcript'); setInterval(() => {}, 1000);",
		],
		env: { PATH: process.env.PATH ?? "", TERM: "xterm-256color" },
		timeoutMs: 5000,
	});
	await expect(terminal.result).rejects.toThrow(
		`Terminal bridge failed at ${stage} (errno ${constants.errno.EIO}); details withheld`
	);
	await terminal.stop();
	expect(fault.metadata.includes("PRIVATE")).toBe(false);
	expect(fault.metadata.includes("Traceback")).toBe(false);
	const messages = fault.metadata
		.trim()
		.split("\n")
		.map((line: string) => JSON.parse(line));
	expect(messages.at(-1)).toEqual({
		error: { stage, errno: constants.errno.EIO },
	});
	const allocation = messages.find((message) => "pid" in message);
	if (stage === "allocation") {
		expect(allocation).toBeUndefined();
	} else {
		expect(allocation?.pid).toEqual(expect.any(Number));
		expect(() => process.kill(allocation.pid, 0)).toThrow();
	}
});
