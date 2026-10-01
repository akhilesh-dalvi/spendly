import type { Command } from "commander";
import type { CliRuntime } from "../runtime.js";

export const registerAuthCommands = (
	program: Command,
	runtime: CliRuntime
): void => {
	const auth = program.command("auth").description("Manage CLI authentication");

	auth
		.command("login")
		.description("Sign in to Spendly in your browser")
		.option(
			"--no-browser",
			"print the authorization URL without opening a browser"
		)
		.action(async (options: { browser: boolean }, command: Command) => {
			const { runAuthLogin } = await import("./auth-actions.js");
			await runAuthLogin(options, command, runtime);
		});

	auth
		.command("status")
		.description("Verify the stored Spendly session")
		.action(async (_options: Record<string, never>, command: Command) => {
			const { runAuthStatus } = await import("./auth-actions.js");
			await runAuthStatus(command, runtime);
		});

	auth
		.command("logout")
		.description("Revoke this CLI session and remove local credentials")
		.action(async (_options: Record<string, never>, command: Command) => {
			const { runAuthLogout } = await import("./auth-actions.js");
			await runAuthLogout(command, runtime);
		});

	if (!runtime.developmentTools) {
		return;
	}

	auth
		.command("keychain-test")
		.description("Run the development credential-store canary")
		.action(async (_options: Record<string, never>, command: Command) => {
			const { runAuthKeychainTest } = await import("./auth-actions.js");
			await runAuthKeychainTest(command, runtime);
		});

	auth
		.command("refresh-test")
		.description("Force a development refresh-token exchange")
		.action(async (_options: Record<string, never>, command: Command) => {
			const { runAuthRefreshTest } = await import("./auth-actions.js");
			await runAuthRefreshTest(command, runtime);
		});
};
