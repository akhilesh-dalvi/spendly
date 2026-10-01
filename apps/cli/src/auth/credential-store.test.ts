import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CredentialStore,
	createCredentialNamespace,
	ExplicitFallbackCredentialStore,
	FileCredentialStore,
} from "./credential-store.js";
import type { StoredSession } from "./types.js";

const temporaryDirectories: string[] = [];
const permissionBits = (mode: number): number => mode % 0o1000;

const createSession = (): StoredSession => ({
	clientId: "client",
	issuer: "https://issuer.example",
	loginAt: 1,
	schemaVersion: 1,
	subject: "user_123",
	tokens: {
		expiresAt: 2,
		idToken: "id",
		refreshToken: "refresh",
	},
});

const failingStore: CredentialStore = {
	delete: () => Promise.reject(new Error("keychain unavailable")),
	read: () => Promise.reject(new Error("keychain unavailable")),
	write: () => Promise.reject(new Error("keychain unavailable")),
};

const createMemoryStore = (): {
	read: () => StoredSession | null;
	store: CredentialStore;
} => {
	let session: StoredSession | null = null;
	return {
		read: () => session,
		store: {
			delete: () => {
				session = null;
				return Promise.resolve();
			},
			read: () => Promise.resolve(session),
			write: (value) => {
				session = value;
				return Promise.resolve();
			},
		},
	};
};

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		await rm(directory, { force: true, recursive: true });
	}
});

describe("credential storage", () => {
	it("namespaces credentials by issuer and client ID", () => {
		expect(createCredentialNamespace("https://one.example", "client")).toBe(
			createCredentialNamespace("https://one.example", "client")
		);
		expect(createCredentialNamespace("https://one.example", "client")).not.toBe(
			createCredentialNamespace("https://two.example", "client")
		);
		expect(createCredentialNamespace("https://one.example", "client")).not.toBe(
			createCredentialNamespace("https://one.example", "other-client")
		);
	});

	it("rejects fallback credentials with unsafe file permissions", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-credential-test-"));
		temporaryDirectories.push(directory);
		const fileStore = new FileCredentialStore(
			"namespace",
			join(directory, "private", "credentials.json")
		);
		await fileStore.write(createSession());
		await chmod(fileStore.path, 0o644);

		await expect(fileStore.read()).rejects.toMatchObject({
			code: "CREDENTIALS_INVALID",
		});
	});

	it("rejects and securely deletes malformed fallback credentials", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-credential-test-"));
		temporaryDirectories.push(directory);
		const privateDirectory = join(directory, "private");
		const credentialPath = join(privateDirectory, "credentials.json");
		await mkdir(privateDirectory, { mode: 0o700 });
		await writeFile(credentialPath, '{"namespace":{"refreshToken":"raw"}}', {
			mode: 0o600,
		});
		const fileStore = new FileCredentialStore("namespace", credentialPath);

		await expect(fileStore.read()).rejects.toMatchObject({
			code: "CREDENTIALS_INVALID",
		});
		await fileStore.delete();
		await expect(stat(credentialPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("removes fallback credentials on logout without requiring fallback opt-in", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-credential-test-"));
		temporaryDirectories.push(directory);
		const fileStore = new FileCredentialStore(
			"namespace",
			join(directory, "private", "credentials.json")
		);
		await fileStore.write(createSession());
		const store = new ExplicitFallbackCredentialStore({
			allowFileStorage: false,
			fileStore,
			keychainStore: {
				...failingStore,
				delete: () => Promise.resolve(),
			},
		});

		await store.delete();
		await expect(stat(fileStore.path)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("removes a stale fallback after a successful keychain write", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-credential-test-"));
		temporaryDirectories.push(directory);
		const fileStore = new FileCredentialStore(
			"namespace",
			join(directory, "private", "credentials.json")
		);
		await fileStore.write(createSession());
		const memoryStore = createMemoryStore();
		const store = new ExplicitFallbackCredentialStore({
			allowFileStorage: false,
			fileStore,
			keychainStore: memoryStore.store,
		});

		await store.write(createSession());
		expect(memoryStore.read()).toEqual(createSession());
		await expect(stat(fileStore.path)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("does not silently fall back when file storage was not allowed", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-credential-test-"));
		temporaryDirectories.push(directory);
		const fileStore = new FileCredentialStore(
			"namespace",
			join(directory, "credentials.json")
		);
		const store = new ExplicitFallbackCredentialStore({
			allowFileStorage: false,
			fileStore,
			keychainStore: failingStore,
		});
		await expect(store.write(createSession())).rejects.toThrow(
			"keychain unavailable"
		);
		await expect(stat(fileStore.path)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("uses only owner permissions for an explicitly allowed file", async () => {
		const directory = await mkdtemp(join(tmpdir(), "spendly-credential-test-"));
		temporaryDirectories.push(directory);
		const warnings: string[] = [];
		const fileStore = new FileCredentialStore(
			"namespace",
			join(directory, "private", "credentials.json")
		);
		const store = new ExplicitFallbackCredentialStore({
			allowFileStorage: true,
			fileStore,
			keychainStore: {
				...failingStore,
				delete: () => Promise.resolve(),
			},
			warn: (message) => warnings.push(message),
		});
		const session = createSession();
		await store.write(session);
		expect(permissionBits((await stat(fileStore.path)).mode)).toBe(0o600);
		expect(permissionBits((await stat(join(directory, "private"))).mode)).toBe(
			0o700
		);
		await expect(store.read()).resolves.toEqual(session);
		expect(warnings.join(" ")).toContain(fileStore.path);
		await store.delete();
		await expect(stat(fileStore.path)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
