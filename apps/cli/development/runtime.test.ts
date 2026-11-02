import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCredentialNamespace,
	FileCredentialStore,
} from "../src/auth/credential-store.js";
import type { StoredSession } from "../src/auth/types.js";
import { runCli } from "../src/cli.js";
import { CLI_EXIT_CODE } from "../src/errors.js";
import { createDevelopmentRuntime } from "./runtime.js";

const temporaryDirectories: string[] = [];
const environment: NodeJS.ProcessEnv = {
	SPENDLY_CLERK_ISSUER: "https://issuer.example/",
	SPENDLY_CLERK_OAUTH_CLIENT_ID: "development-client",
	SPENDLY_CONVEX_URL: "https://backend.example",
};
const session: StoredSession = {
	clientId: "development-client",
	issuer: "https://issuer.example",
	loginAt: 1,
	schemaVersion: 1,
	subject: "test-user",
	tokens: {
		expiresAt: 2,
		idToken: "private-id",
		refreshToken: "private-refresh",
	},
};

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		await rm(directory, { force: true, recursive: true });
	}
});

describe("development credential-file runtime", () => {
	it("keeps normal credential selection unchanged when no explicit E2E file is supplied", () => {
		const runtime = createDevelopmentRuntime(environment);
		expect(runtime.credentialStore).toBeUndefined();
		expect(runtime.developmentTools).toBe(true);
	});

	it("keeps help lazy even with unconfigured auth and an invalid E2E path", async () => {
		const runtime = createDevelopmentRuntime({
			SPENDLY_E2E_CREDENTIAL_FILE: "relative-private-path",
		});
		let stdout = "";
		runtime.stdout = {
			write: (value) => {
				stdout += value;
			},
		};
		runtime.stderr = { write: () => undefined };

		expect(await runCli(["--help"], runtime)).toBe(CLI_EXIT_CODE.success);
		expect(stdout).toContain("Usage: spendly");
		expect(stdout).not.toContain("relative-private-path");
	});
	it.each([
		"read",
		"write",
		"delete",
	] as const)("sanitizes file storage %s errors without leaking paths or tokens", async (operation) => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-e2e-private-"));
		temporaryDirectories.push(directory);
		const blockingFile = join(directory, "secret-token");
		await writeFile(blockingFile, "private-refresh");
		const runtime = createDevelopmentRuntime({
			...environment,
			SPENDLY_E2E_CREDENTIAL_FILE: join(blockingFile, "credentials.json"),
		});
		const store = runtime.credentialStore;
		if (!store) {
			throw new Error("Expected a development credential store");
		}

		await expect(
			operation === "write" ? store.write(session) : store[operation]()
		).rejects.toMatchObject({
			code: "CREDENTIALS_INVALID",
			message: "Unable to access development credential storage",
		});
	});

	it.each([
		"",
		"secret-token/credentials.json",
	])("rejects non-absolute credential paths without disclosing them: %j", async (path) => {
		const runtime = createDevelopmentRuntime({
			...environment,
			SPENDLY_E2E_CREDENTIAL_FILE: path,
		});
		let stdout = "";
		runtime.stdout = {
			write: (value) => {
				stdout += value;
			},
		};
		runtime.stderr = { write: () => undefined };

		expect(await runCli(["auth", "status", "--json"], runtime)).toBe(
			CLI_EXIT_CODE.invalidInput
		);
		expect(JSON.parse(stdout)).toMatchObject({
			error: {
				code: "CONFIGURATION_ERROR",
				message: "Development credential file must use an absolute path",
			},
		});
		expect(stdout).not.toContain("secret-token");
	});

	it("forces the explicit file with the development issuer/client namespace", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-e2e-credentials-"));
		temporaryDirectories.push(directory);
		const path = join(directory, "private", "credentials.json");
		const fileStore = new FileCredentialStore(
			createCredentialNamespace("https://issuer.example", "development-client"),
			path
		);
		await fileStore.write(session);
		const runtime = createDevelopmentRuntime({
			...environment,
			SPENDLY_E2E_CREDENTIAL_FILE: path,
		});

		expect(runtime.developmentTools).toBe(true);
		expect(await runtime.credentialStore?.read()).toEqual(session);
		const updatedSession = { ...session, subject: "another-test-user" };
		await runtime.credentialStore?.write(updatedSession);
		expect(await fileStore.read()).toEqual(updatedSession);
		expect(
			await new FileCredentialStore(
				createCredentialNamespace("https://issuer.example", "other-client"),
				path
			).read()
		).toBeNull();
		await runtime.credentialStore?.delete();
		expect(await fileStore.read()).toBeNull();
	});
});
