import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { terminalFixture } from "./terminal-fixture";

const fixture = () => {
	const home = join(tmpdir(), "spendly-e2e-offline-fixture");
	const credentialFile = join(home, "credentials", "session.json");
	return {
		cliEnvironment: {
			HOME: home,
			SPENDLY_CLERK_ISSUER: "https://offline.accounts.dev",
			SPENDLY_CLERK_OAUTH_CLIENT_ID: "offline-client",
			SPENDLY_CONVEX_URL: "https://offline.convex.cloud",
			SPENDLY_E2E_CREDENTIAL_FILE: credentialFile,
		},
		config: {
			clerkIssuer: "https://offline.accounts.dev",
			convexUrl: "https://offline.convex.cloud",
			oauthClientId: "offline-client",
		},
		credentialFile,
	};
};

describe("explicit terminal fixture isolation (offline; no processes/files opened)", () => {
	it("accepts only an explicitly exposed disposable credential environment", () => {
		const user = fixture();
		expect(terminalFixture(user).credentialFile === user.credentialFile).toBe(
			true
		);
	});

	it("fails closed while the authentication fixture has not exposed its fields", () => {
		expect(() => terminalFixture({})).toThrow(
			"must expose credentialFile and cliEnvironment; details withheld"
		);
	});

	it("rejects a developer home without ever opening its credential store", () => {
		const user = fixture();
		user.cliEnvironment.HOME = homedir();
		user.credentialFile = join(
			homedir(),
			".config",
			"spendly",
			"credentials.json"
		);
		user.cliEnvironment.SPENDLY_E2E_CREDENTIAL_FILE = user.credentialFile;
		expect(() => terminalFixture(user)).toThrow(
			"explicit disposable credential environment"
		);
	});

	it.each([
		"SPENDLY_E2E_CREDENTIAL_FILE",
		"SPENDLY_CLERK_ISSUER",
		"SPENDLY_CLERK_OAUTH_CLIENT_ID",
		"SPENDLY_CONVEX_URL",
	] as const)(
		"rejects mismatched %s instead of falling back to ambient credentials/config",
		(field) => {
			const user = fixture();
			user.cliEnvironment[field] = "unexpected";
			expect(() => terminalFixture(user)).toThrow(
				"explicit disposable credential environment"
			);
		}
	);
});
