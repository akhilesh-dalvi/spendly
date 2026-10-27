import {
	chmod,
	mkdir,
	mkdtemp,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliError } from "../errors.js";
import { writeDebugError } from "../output/debug.js";
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
	for await (const directory of temporaryDirectories.splice(0)) {
		await rm(directory, { force: true, recursive: true });
	}
});

const createFileStore = async (): Promise<FileCredentialStore> => {
	const directory = await mkdtemp(join(tmpdir(), "spendly-credential-test-"));
	temporaryDirectories.push(directory);
	return new FileCredentialStore(
		"namespace",
		join(directory, "private", "credentials.json")
	);
};

describe("credential storage", () => {
	it("preserves other namespaces when deleting one account", async () => {
		const first = await createFileStore();
		const second = new FileCredentialStore("other", first.path);
		await first.write(createSession());
		await second.write({ ...createSession(), subject: "other-user" });
		await first.delete();
		await expect(first.read()).resolves.toBeNull();
		await expect(second.read()).resolves.toMatchObject({
			subject: "other-user",
		});
		await first.delete();
		await expect(second.read()).resolves.toMatchObject({
			subject: "other-user",
		});
	});

	it("treats missing files as logged out and deletion as idempotent", async () => {
		const fileStore = await createFileStore();
		await expect(fileStore.read()).resolves.toBeNull();
		await expect(fileStore.delete()).resolves.toBeUndefined();
	});

	it.each(["{broken", "[]"])(
		"rejects invalid JSON credential document %s",
		async (content) => {
			const fileStore = await createFileStore();
			await fileStore.write(createSession());
			await writeFile(fileStore.path, content);
			await expect(fileStore.read()).rejects.toMatchObject({
				code: "CREDENTIALS_INVALID",
			});
			await fileStore.delete();
			await expect(fileStore.read()).resolves.toBeNull();
		}
	);

	it("rejects insecure parent directories and symbolic-link credential files", async () => {
		const fileStore = await createFileStore();
		await fileStore.write(createSession());
		const directory = join(fileStore.path, "..");
		await chmod(directory, 0o755);
		await expect(fileStore.read()).rejects.toMatchObject({
			code: "CREDENTIALS_INVALID",
		});
		await chmod(directory, 0o700);
		const linked = new FileCredentialStore(
			"namespace",
			join(directory, "linked.json")
		);
		await symlink(fileStore.path, linked.path);
		await expect(linked.read()).rejects.toMatchObject({
			code: "CREDENTIALS_INVALID",
		});
	});

	it.each([true, false])(
		"prefers keychain credentials with fallback allowed=%s",
		async (allowFileStorage) => {
			const fileStore = await createFileStore();
			const read = vi.spyOn(fileStore, "read");
			const memory = createMemoryStore();
			await memory.store.write(createSession());
			const store = new ExplicitFallbackCredentialStore({
				allowFileStorage,
				fileStore,
				keychainStore: memory.store,
			});
			await expect(store.read()).resolves.toEqual(createSession());
			expect(read).not.toHaveBeenCalled();
		}
	);

	it("does not read plaintext without explicit opt-in", async () => {
		const fileStore = await createFileStore();
		await fileStore.write(createSession());
		const store = new ExplicitFallbackCredentialStore({
			allowFileStorage: false,
			fileStore,
			keychainStore: createMemoryStore().store,
		});
		await expect(store.read()).resolves.toBeNull();
		const unavailable = new ExplicitFallbackCredentialStore({
			allowFileStorage: false,
			fileStore,
			keychainStore: failingStore,
		});
		await expect(unavailable.read()).rejects.toThrow("keychain unavailable");
	});

	it("does not warn for an empty opted-in fallback", async () => {
		const warn = vi.fn();
		const store = new ExplicitFallbackCredentialStore({
			allowFileStorage: true,
			fileStore: await createFileStore(),
			keychainStore: createMemoryStore().store,
			warn,
		});
		await expect(store.read()).resolves.toBeNull();
		expect(warn).not.toHaveBeenCalled();
	});

	it.each(["keychain", "file", "both"])(
		"attempts both deletions and propagates %s failure",
		async (failure) => {
			const fileStore = await createFileStore();
			const fileError = new Error("file failure");
			const keychainError = new Error("keychain failure");
			const removeFile = vi
				.spyOn(fileStore, "delete")
				.mockImplementation(() =>
					failure === "keychain" ? Promise.resolve() : Promise.reject(fileError)
				);
			const removeKeychain = vi.fn(() =>
				failure === "file" ? Promise.resolve() : Promise.reject(keychainError)
			);
			const store = new ExplicitFallbackCredentialStore({
				allowFileStorage: false,
				fileStore,
				keychainStore: { ...createMemoryStore().store, delete: removeKeychain },
			});
			await expect(store.delete()).rejects.toBe(
				failure === "file" ? fileError : keychainError
			);
			expect(removeFile).toHaveBeenCalledOnce();
			expect(removeKeychain).toHaveBeenCalledOnce();
		}
	);

	it("rolls back a keychain write if stale plaintext cannot be removed", async () => {
		const fileStore = await createFileStore();
		const memory = createMemoryStore();
		vi.spyOn(fileStore, "delete").mockRejectedValue(
			new Error("cannot remove stale file")
		);
		const store = new ExplicitFallbackCredentialStore({
			allowFileStorage: false,
			fileStore,
			keychainStore: memory.store,
		});
		await expect(store.write(createSession())).rejects.toThrow(
			"cannot remove stale file"
		);
		expect(memory.read()).toBeNull();
	});
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

	it("keeps malformed credential snippets out of debug diagnostics", async () => {
		const store = await createFileStore();
		await store.write(createSession());
		await writeFile(store.path, "private-credential-value", { mode: 0o600 });
		const failure: unknown = await store
			.read()
			.catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(CliError);
		if (!(failure instanceof CliError)) {
			throw new Error("Expected a CLI error");
		}
		expect(failure.cause).toMatchObject({ cause: expect.any(SyntaxError) });
		const write = vi.fn();
		writeDebugError(failure, { write });
		expect(write).toHaveBeenCalledOnce();
		expect(write.mock.calls[0]?.[0]).not.toContain("private-credential-value");
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
