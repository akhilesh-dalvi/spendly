import type { SpawnOptions } from "node:child_process";
import { constants } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { type RunningTerminal, startTerminal } from "./terminal";

const fault = vi.hoisted(() => ({
	metadata: "",
	missingGroup: false,
	stage: "allocation",
}));

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
import errno, fcntl, os, pty, runpy, sys, termios
stage, missing_group, bridge = sys.argv[1:4]
sys.argv = sys.argv[3:]
if missing_group == "true":
    def missing_process_group(*args):
        raise ProcessLookupError(errno.ESRCH, "Owned process group is not ready")
    os.killpg = missing_process_group
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
				[
					"-I",
					"-u",
					"-c",
					wrapper,
					fault.stage,
					String(fault.missingGroup),
					...args.slice(2),
				],
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
	{ missingGroup: false, stage: "allocation" },
	{ missingGroup: false, stage: "window-size" },
	{ missingGroup: true, stage: "window-size" },
])(
	"reports a safe $stage error and reaps the child (missing process group: $missingGroup)",
	async ({ stage, missingGroup }) => {
		fault.stage = stage;
		fault.missingGroup = missingGroup;
		terminal = startTerminal({
			args: [
				"-e",
				"process.stdout.write('PRIVATE transcript'); setInterval(() => {}, 1000);",
			],
			command: process.execPath,
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
			error: { errno: constants.errno.EIO, stage },
		});
		const allocation = messages.find((message) => "pid" in message);
		if (stage === "allocation") {
			expect(allocation).toBeUndefined();
		} else {
			expect(allocation?.pid).toEqual(expect.any(Number));
			expect(() => process.kill(allocation.pid, 0)).toThrow();
		}
	}
);
