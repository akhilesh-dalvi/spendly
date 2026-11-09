import { spawn } from "node:child_process";

const [environment, command, ...args] = process.argv.slice(2);

if (!(["dev", "e2e"].includes(environment) && command)) {
	process.stderr.write(
		"Usage: node scripts/with-secrets.mjs <dev|e2e> <command> [arguments]\n"
	);
	process.exitCode = 2;
} else if (
	process.env.CI === "true" &&
	process.env.SPENDLY_SECRETS_ENV !== environment
) {
	process.stderr.write(
		"CI secret injection is missing or targets another environment.\n"
	);
	process.exitCode = 1;
} else {
	const injected = process.env.CI === "true";
	const child = spawn(
		injected ? command : "infisical",
		injected
			? args
			: [
					"secrets-manager",
					"run",
					`--env=${environment}`,
					"--",
					command,
					...args,
				],
		{ shell: false, stdio: "inherit" }
	);
	const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
	const forward = (signal) => child.kill(signal);
	for (const signal of signals) {
		process.on(signal, forward);
	}
	const detach = () => {
		for (const signal of signals) {
			process.removeListener(signal, forward);
		}
	};
	child.on("error", () => {
		detach();
		process.stderr.write(
			injected
				? "Unable to start the requested command; details withheld.\n"
				: "Unable to start Infisical CLI. Install it and run infisical login.\n"
		);
		process.exitCode = 1;
	});
	child.on("exit", (code, signal) => {
		detach();
		if (signal) {
			process.kill(process.pid, signal);
		} else {
			process.exitCode = code ?? 1;
		}
	});
}
