import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openCredentialProbe } from "./terminal-credentials";

const namespace = createHash("sha256").update("offline-only").digest("hex");
// These are offline parser fixtures only: never passed to a CLI or OAuth server.
const session = {
	clientId: "offline-client",
	issuer: "https://offline.invalid",
	loginAt: 1_700_000_000_000,
	schemaVersion: 1,
	subject: "user_offline",
	tokens: {
		expiresAt: 1_800_000_000_000,
		idToken: "offline-id-token",
		refreshToken: "offline-refresh-token",
	},
};
let directory: string;
let path: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "spendly-e2e-probe-"));
	await mkdir(join(directory, "credentials"), { mode: 0o700 });
	path = join(directory, "credentials", "session.json");
	await writeFile(path, JSON.stringify({ [namespace]: session }), {
		mode: 0o600,
	});
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe("secret-withholding credential probes (offline)", () => {
	it("ages only local expiry metadata and never returns token values", async () => {
		const probe = await openCredentialProbe(path);
		expect(probe.summary).toMatchObject({
			namespace,
			subject: "user_offline",
			hasRefreshToken: true,
		});
		expect(JSON.stringify(probe).includes(session.tokens.idToken)).toBe(false);
		expect(JSON.stringify(probe).includes(session.tokens.refreshToken)).toBe(
			false
		);
		await probe.expireForRefresh();
		const persisted = await probe.inspect();
		expect(persisted.summary?.expiresAt).toBe(0);
		expect(persisted.summary?.loginAt).toBe(session.loginAt);
		expect(persisted.tokensChanged).toBe(false);
		expect(persisted.unchanged).toBe(false);
		const expected = {
			[namespace]: { ...session, tokens: { ...session.tokens, expiresAt: 0 } },
		};
		expect(
			(await readFile(path, "utf8")).trim() === JSON.stringify(expected)
		).toBe(true);
	});

	it("observes a persisted replacement without returning its tokens", async () => {
		const probe = await openCredentialProbe(path);
		await writeFile(
			path,
			JSON.stringify({
				[namespace]: {
					...session,
					tokens: {
						...session.tokens,
						idToken: "replacement-offline-id",
						refreshToken: "replacement-offline-refresh",
					},
				},
			})
		);
		const persisted = await probe.inspect();
		expect(persisted.tokensChanged).toBe(true);
		expect(persisted.summary?.subject).toBe(session.subject);
		expect(JSON.stringify(persisted).includes("replacement-offline")).toBe(
			false
		);
	});

	it("ages authorization without touching the token set", async () => {
		const probe = await openCredentialProbe(path);
		await probe.expireAuthorization();
		const result = await probe.inspect();
		expect(result.tokensChanged).toBe(false);
		expect(result.summary?.expiresAt).toBe(session.tokens.expiresAt);
		expect(
			Date.now() - (result.summary?.loginAt ?? Date.now())
		).toBeGreaterThanOrEqual(31 * 24 * 60 * 60 * 1000);
	});

	it("observes removal and refuses to synthesize a replacement session", async () => {
		const probe = await openCredentialProbe(path);
		await rm(path);
		expect(await probe.inspect()).toMatchObject({
			present: false,
			tokensChanged: false,
			summary: null,
		});
		await expect(probe.expireForRefresh()).rejects.toThrow(
			"credential file disappeared; credentials withheld"
		);
	});

	it("rejects readable-by-others files without returning their contents", async () => {
		await chmod(path, 0o644);
		await expect(openCredentialProbe(path)).rejects.toThrow(
			"inspection failed; credentials withheld"
		);
	});

	it("rejects symlinks rather than reading another file", async () => {
		await rm(path);
		const target = join(directory, "target.json");
		await writeFile(target, JSON.stringify({ [namespace]: session }), {
			mode: 0o600,
		});
		await symlink(target, path);
		await expect(openCredentialProbe(path)).rejects.toThrow(
			"inspection failed; credentials withheld"
		);
	});

	it("withholds parser/schema diagnostics and rejects multiple namespaces", async () => {
		await writeFile(path, `{"secret":"${session.tokens.idToken}"`);
		await expect(openCredentialProbe(path)).rejects.toThrow(
			"inspection failed; credentials withheld"
		);
		await writeFile(
			path,
			JSON.stringify({ [namespace]: session, ["a".repeat(64)]: session })
		);
		await expect(openCredentialProbe(path)).rejects.toThrow(
			"inspection failed; credentials withheld"
		);
	});
});
