import { createHash } from "node:crypto";
import { chmod, lstat } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type Browser, type BrowserContext, chromium } from "@playwright/test";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { z } from "zod";
import { CLI_EXIT_CODE } from "../../../apps/cli/src/errors";
import { configureClerk } from "../src/authentication";
import { api } from "../src/backend-api";
import { type E2EEnvironment, loadEnvironment } from "../src/environment";
import { openCredentialProbe } from "../src/terminal-credentials";
import { terminalFixture } from "../src/terminal-fixture";
import { createUser, type E2EUser, seedUser } from "../src/users";

const statusSchema = z.object({
	schemaVersion: z.literal(1),
	data: z.object({
		authenticated: z.literal(true),
		backendUserId: z.string().min(1),
		identitySubject: z.string().min(1),
		subjectMatchesBackendUser: z.literal(true),
	}),
});
const failureSchema = z.object({
	schemaVersion: z.literal(1),
	error: z.object({ code: z.string() }),
});

const parseOutput = <Output>(
	schema: z.ZodType<Output>,
	stdout: string
): Output => {
	try {
		const result = schema.safeParse(JSON.parse(stdout));
		if (result.success) {
			return result.data;
		}
	} catch {
		// Never attach JSON/schema diagnostics: the subprocess owns credentials.
	}
	throw new Error(
		"Credential lifecycle CLI contract mismatch; output withheld"
	);
};

const identity = async (user: E2EUser) => {
	const result = await user.runCli(["auth", "status"]);
	if (result.exitCode !== 0 || result.signal !== null || result.stderr !== "") {
		throw new Error("Credential lifecycle status failed; output withheld");
	}
	return parseOutput(statusSchema, result.stdout).data;
};

const logout = async (user: E2EUser) => {
	const result = await user.runCli(["auth", "logout"]);
	if (result.exitCode !== 0 || result.signal !== null || result.stderr !== "") {
		throw new Error("Credential lifecycle logout failed; output withheld");
	}
	return parseOutput(
		z.object({
			data: z.object({
				authenticated: z.literal(false),
				localCredentialsRemoved: z.literal(true),
				remoteRevocation: z.enum(["confirmed", "not-confirmed", "not-needed"]),
			}),
		}),
		result.stdout
	).data;
};

const failureCode = async (user: E2EUser) => {
	const result = await user.runCli(["auth", "status"]);
	if (
		result.exitCode !== CLI_EXIT_CODE.authentication ||
		result.signal !== null ||
		result.stderr !== ""
	) {
		throw new Error(
			"Credential lifecycle expected a clean authentication failure; output withheld"
		);
	}
	return parseOutput(failureSchema, result.stdout).error.code;
};

describe("genuine OAuth CLI credential lifecycle", () => {
	let config: E2EEnvironment;
	let browser: Browser;
	let context: BrowserContext | undefined;
	let user: E2EUser | undefined;

	const fixture = () => {
		if (!user) {
			throw new Error("Credential lifecycle user unavailable");
		}
		return user;
	};

	beforeAll(async () => {
		if (process.platform === "win32") {
			throw new Error(
				"Credential mode assertions require POSIX; Windows ACL coverage is not implemented"
			);
		}
		config = loadEnvironment();
		await configureClerk(config);
		browser = await chromium.launch();
	});

	beforeEach(async () => {
		user = undefined;
		context = await browser.newContext({ timezoneId: "UTC" });
		user = await createUser(await context.newPage(), config);
		await seedUser(user);
		await user.loginCli();
	});

	afterEach(async () => {
		try {
			await user?.dispose();
		} finally {
			user = undefined;
			await context?.close();
			context = undefined;
		}
	});

	afterAll(async () => {
		await browser?.close();
	});

	it("stores owner-only genuine credentials, refreshes from expired local metadata and persists the same verified identity", async () => {
		const user = fixture();
		const { credentialFile, cliEnvironment } = terminalFixture(user);
		const backend = await user.query(api.users.get, {});
		const initial = await identity(user);
		expect(initial.identitySubject === backend.clerkId).toBe(true);
		expect(initial.backendUserId === backend._id).toBe(true);
		const probe = await openCredentialProbe(credentialFile);
		const expectedNamespace = createHash("sha256")
			.update(`${config.clerkIssuer}\0${config.oauthClientId}`)
			.digest("hex");
		expect(probe.summary).toMatchObject({
			namespace: expectedNamespace,
			namespaceCount: 1,
			issuer: config.clerkIssuer,
			clientId: config.oauthClientId,
			hasRefreshToken: true,
		});
		expect(probe.summary.subject === backend.clerkId).toBe(true);
		for (const [path, mode] of [
			[credentialFile, 0o600],
			[dirname(credentialFile), 0o700],
			[cliEnvironment.HOME, 0o700],
		] as const) {
			if (!path) {
				throw new Error("Disposable credential home unavailable");
			}
			const stats = await lstat(path);
			expect(stats.mode % 0o1_0000).toBe(mode);
			expect(stats.isSymbolicLink()).toBe(false);
			expect(stats.uid).toBe(process.getuid?.());
		}

		await probe.expireForRefresh();
		const aged = await probe.inspect();
		expect(aged.summary?.expiresAt).toBe(0);
		expect(aged.tokensChanged).toBe(false);
		// OAuth ID tokens use second-resolution issuance times. Cross that boundary,
		// not real expiry, so a newly persisted token set is observable as well.
		await delay(1100);
		const refreshStarted = Date.now();
		expect(await identity(user)).toEqual(initial);
		const refreshed = await probe.inspect();
		expect(refreshed.present).toBe(true);
		expect(refreshed.summary?.expiresAt).toBeGreaterThan(refreshStarted);
		expect(refreshed.summary?.loginAt).toBe(probe.summary.loginAt);
		expect(refreshed.summary?.subject === backend.clerkId).toBe(true);
		expect(refreshed.summary?.hasRefreshToken).toBe(true);
		expect(refreshed.tokensChanged).toBe(true);
		// Verify a separate authenticated subprocess can use the persisted refresh.
		expect(await identity(user)).toEqual(initial);
		const accounts = await user.runCli(["accounts", "list"]);
		expect(accounts.exitCode).toBe(0);
		expect(accounts.signal).toBeNull();

		expect((await logout(user)).remoteRevocation).not.toBe("not-needed");
		expect((await probe.inspect()).present).toBe(false);
		expect(await failureCode(user)).toBe("AUTHENTICATION_REQUIRED");
		expect((await logout(user)).remoteRevocation).toBe("not-needed");
	});

	it("isolates credential homes and logout between two genuine OAuth users", async () => {
		const first = fixture();
		const firstPath = terminalFixture(first).credentialFile;
		const otherContext = await browser.newContext({ timezoneId: "UTC" });
		let other: E2EUser | undefined;
		try {
			other = await createUser(await otherContext.newPage(), config);
			await seedUser(other);
			await other.loginCli();
			const secondPath = terminalFixture(other).credentialFile;
			expect(firstPath === secondPath).toBe(false);
			expect(dirname(firstPath) === dirname(secondPath)).toBe(false);
			const firstProbe = await openCredentialProbe(firstPath);
			const secondProbe = await openCredentialProbe(secondPath);
			expect(firstProbe.summary.subject === secondProbe.summary.subject).toBe(
				false
			);
			const secondIdentity = await identity(other);
			await logout(first);
			expect((await firstProbe.inspect()).present).toBe(false);
			expect((await secondProbe.inspect()).unchanged).toBe(true);
			expect(await identity(other)).toEqual(secondIdentity);
			expect(await failureCode(first)).toBe("AUTHENTICATION_REQUIRED");
		} finally {
			try {
				await other?.dispose();
			} finally {
				await otherContext.close();
			}
		}
	});

	it("removes a genuine session when its local authorization age exceeds 30 days", async () => {
		const user = fixture();
		const probe = await openCredentialProbe(
			terminalFixture(user).credentialFile
		);
		await probe.expireAuthorization();
		expect((await probe.inspect()).tokensChanged).toBe(false);
		expect(await failureCode(user)).toBe("AUTHORIZATION_EXPIRED");
		expect((await probe.inspect()).present).toBe(false);
		expect(await failureCode(user)).toBe("AUTHENTICATION_REQUIRED");
		// CLI expiration/revocation does not remove the independent Web identity.
		expect(
			(await user.query(api.users.get, {})).clerkId === probe.summary.subject
		).toBe(true);
	});

	it.each([
		"file",
		"directory",
	] as const)("rejects and removes credentials with unsafe %s permissions", async (target) => {
		const user = fixture();
		const { credentialFile } = terminalFixture(user);
		const probe = await openCredentialProbe(credentialFile);
		const directory = dirname(credentialFile);
		try {
			await chmod(
				target === "file" ? credentialFile : directory,
				target === "file" ? 0o644 : 0o755
			);
			expect(await failureCode(user)).toBe("CREDENTIALS_INVALID");
			await chmod(directory, 0o700);
			expect((await probe.inspect()).present).toBe(false);
			expect(await failureCode(user)).toBe("AUTHENTICATION_REQUIRED");
		} finally {
			await chmod(directory, 0o700);
		}
	});
});
