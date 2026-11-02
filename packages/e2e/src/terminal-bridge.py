"""Private POSIX PTY bridge. Arguments are exec'd directly, never through a shell."""

import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios


def report(value):
    # Only lifecycle metadata crosses stderr; terminal output stays on stdout.
    sys.stderr.write(json.dumps(value) + "\n")
    sys.stderr.flush()


def stop(_signum, _frame):
    raise InterruptedError()


def main():
    child = None
    master = None
    status = None
    failure = None
    stage = "allocation"

    def remember_failure(failed_stage, error):
        nonlocal failure
        if failure is None:
            number = getattr(error, "errno", None)
            failure = {
                "stage": failed_stage,
                "errno": number if type(number) is int else None,
            }

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        child, master = pty.fork()
        if child == 0:
            try:
                os.execvpe(sys.argv[1], sys.argv[1:], os.environ)
            except BaseException:
                os._exit(127)

        report({"pid": child})
        stage = "window-size"
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
        stage = "selector"
        with selectors.DefaultSelector() as selector:
            selector.register(master, selectors.EVENT_READ)
            selector.register(sys.stdin.fileno(), selectors.EVENT_READ)
            running = True
            while running:
                stage = "select"
                for key, _events in selector.select(0.1):
                    stage = "read"
                    try:
                        data = os.read(key.fd, 65536)
                    except OSError as error:
                        if key.fd == master and error.errno == errno.EIO:
                            running = False
                            break
                        raise
                    if not data:
                        running = False
                        break
                    stage = "write"
                    destination = sys.stdout.fileno() if key.fd == master else master
                    while data:
                        written = os.write(destination, data)
                        data = data[written:]
                # Drain the PTY to EOF before reaping a naturally exited child.
                # A descendant retaining the terminal is bounded by the TS deadline.
    except (InterruptedError, BrokenPipeError):
        pass
    except Exception as error:
        # Never emit tracebacks: exceptions may contain argv, env or transcripts.
        remember_failure(stage, error)
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        if child is not None and child > 0:
            # PTY children lead their own session/group, not the bridge's group.
            # Reap before reporting completion, even after a setup/selector error.
            try:
                waited, status = os.waitpid(child, os.WNOHANG)
                if waited == 0:
                    status = None
            except Exception as error:
                remember_failure("reap", error)
            try:
                os.killpg(child, signal.SIGKILL)
            except Exception as error:
                if not isinstance(error, ProcessLookupError):
                    remember_failure("terminate", error)
                # forkpty can return before the child finishes creating its group.
                # ESRCH does not prove the owned child exited. Signal its unreaped
                # PID before waiting, but never a PID already reaped above.
                if status is None:
                    try:
                        os.kill(child, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    except Exception as child_error:
                        remember_failure("terminate", child_error)
            if status is None:
                try:
                    _waited, status = os.waitpid(child, 0)
                except Exception as error:
                    remember_failure("reap", error)
        if master is not None:
            try:
                os.close(master)
            except Exception as error:
                remember_failure("close", error)

    if failure is not None:
        result = {"error": failure}
    elif status is None:
        result = {"error": {"stage": "reap", "errno": None}}
    else:
        result = {"exitCode": os.waitstatus_to_exitcode(status)}
    try:
        report(result)
    except BrokenPipeError:
        # The controller is gone; owned children have already been reaped.
        pass


if __name__ == "__main__":
    main()
