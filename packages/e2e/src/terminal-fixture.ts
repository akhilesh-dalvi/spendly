import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { startTerminal } from "./terminal";
import type { E2EUser } from "./users";

const CLI_ENTRY = fileURLToPath(
	new URL(
		"../../../apps/cli/development-dist/development/index.js",
		import.meta.url
	)
);
const DISPOSABLE_HOME = /^spendly-e2e-/u;
const fixtureSchema = z.object({
	cliEnvironment: z.record(z.string(), z.string().optional()),
	config: z.object({
		clerkIssuer: z.string(),
		convexUrl: z.string(),
		oauthClientId: z.string(),
	}),
	credentialFile: z.string(),
});

/** Fail closed until the auth fixture explicitly exposes its isolated paths/env. */
export const terminalFixture = (user: unknown) => {
	const fixture = fixtureSchema.safeParse(user);
	if (!fixture.success) {
		throw new Error(
			"CLI E2E fixture must expose credentialFile and cliEnvironment; details withheld"
		);
	}
	const { credentialFile, cliEnvironment, config } = fixture.data;
	const home = cliEnvironment.HOME;
	if (
		!(home && isAbsolute(home) && DISPOSABLE_HOME.test(basename(home))) ||
		resolve(dirname(home)) !== resolve(tmpdir()) ||
		credentialFile !== join(home, "credentials", "session.json") ||
		cliEnvironment.SPENDLY_E2E_CREDENTIAL_FILE !== credentialFile ||
		cliEnvironment.SPENDLY_CLERK_ISSUER !== config.clerkIssuer ||
		cliEnvironment.SPENDLY_CLERK_OAUTH_CLIENT_ID !== config.oauthClientId ||
		cliEnvironment.SPENDLY_CONVEX_URL !== config.convexUrl
	) {
		throw new Error(
			"CLI E2E requires an explicit disposable credential environment; details withheld"
		);
	}
	return { cliEnvironment, credentialFile };
};

export const startInteractiveCli = (user: E2EUser, args: readonly string[]) => {
	const fixture = terminalFixture(user);
	return startTerminal({
		args: [CLI_ENTRY, ...args, "--interactive", "--no-color"],
		command: process.execPath,
		env: { ...fixture.cliEnvironment, TERM: "xterm-256color" },
		timeoutMs: 45_000,
	});
};
