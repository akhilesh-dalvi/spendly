import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCredentialStore } from "./credential-store.js";
import type { StoredSession } from "./types.js";

const native = vi.hoisted(() => ({
	home: "",
	getPassword: vi.fn(),
	setPassword: vi.fn(),
	deletePassword: vi.fn(),
}));
vi.mock("@napi-rs/keyring", () => ({
	Entry: class {
		getPassword = native.getPassword;
		setPassword = native.setPassword;
		deletePassword = native.deletePassword;
	},
}));
vi.mock("node:os", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:os")>()),
	homedir: () => native.home,
}));

const session: StoredSession = {
	clientId: "client",
	issuer: "https://issuer.example",
	subject: "user",
	loginAt: 1,
	schemaVersion: 1,
	tokens: { idToken: "id", refreshToken: "refresh", expiresAt: 2 },
};
const store = () =>
	createCredentialStore({
		allowFileStorage: false,
		clientId: "client",
		issuer: session.issuer,
		warn: vi.fn(),
	});

beforeEach(async () => {
	vi.resetAllMocks();
	native.home = await mkdtemp(join(tmpdir(), "spendly-keychain-test-"));
});
afterEach(async () => {
	await rm(native.home, { recursive: true, force: true });
});

describe("OS keychain credential adapter", () => {
	it("round-trips validated credentials through the native boundary", async () => {
		const credentials = store();
		await credentials.write(session);
		expect(native.setPassword).toHaveBeenCalledOnce();
		expect(JSON.parse(native.setPassword.mock.calls[0]?.[0] as string)).toEqual(
			session
		);
		native.getPassword.mockReturnValue(JSON.stringify(session));
		await expect(credentials.read()).resolves.toEqual(session);
		await credentials.delete();
		expect(native.deletePassword).toHaveBeenCalledOnce();
	});

	it.each([
		null,
		new Error("No matching entry found"),
	])("treats missing native entries as logged out %#", async (value) => {
		if (value instanceof Error) {
			native.getPassword.mockImplementation(() => {
				throw value;
			});
		} else {
			native.getPassword.mockReturnValue(value);
		}
		await expect(store().read()).resolves.toBeNull();
	});

	it.each([
		"{broken",
		JSON.stringify({ schemaVersion: 9 }),
	])("deletes invalid keychain credentials %#", async (value) => {
		native.getPassword.mockReturnValue(value);
		await expect(store().read()).rejects.toMatchObject({
			code: "CREDENTIALS_INVALID",
		});
		expect(native.deletePassword).toHaveBeenCalledOnce();
	});

	it.each([
		"read",
		"write",
		"delete",
	] as const)("reports a locked keychain during %s", async (operation) => {
		const failure = new Error("Keychain locked");
		const fail = () => {
			throw failure;
		};
		native.getPassword.mockImplementation(fail);
		native.setPassword.mockImplementation(fail);
		native.deletePassword.mockImplementation(fail);
		const credentials = store();
		await expect(
			operation === "write"
				? credentials.write(session)
				: credentials[operation]()
		).rejects.toMatchObject({ code: "KEYCHAIN_UNAVAILABLE", cause: failure });
	});

	it("allows repeated native deletion when credentials are absent", async () => {
		native.deletePassword.mockImplementation(() => {
			throw new Error("No entry exists");
		});
		await expect(store().delete()).resolves.toBeUndefined();
	});
});
