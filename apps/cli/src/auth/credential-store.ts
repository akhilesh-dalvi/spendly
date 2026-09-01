import { createHash, randomUUID } from "node:crypto";
import {
	chmod,
	lstat,
	mkdir,
	open,
	readFile,
	rename,
	unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Entry } from "@napi-rs/keyring";
import { z } from "zod";
import { CliError } from "../errors.js";
import { type StoredSession, storedSessionSchema } from "./types.js";

const KEYCHAIN_SERVICE = "spendly-cli";
const OWNER_DIRECTORY_MODE = 0o700;
const OWNER_FILE_MODE = 0o600;
const PERMISSION_BITS_MASK = 0o777;
const MISSING_ENTRY_PATTERN = /no entry|not found|no matching|does not exist/iu;

const fileCredentialDocumentSchema = z.record(z.string(), storedSessionSchema);
type FileCredentialDocument = z.infer<typeof fileCredentialDocumentSchema>;

export interface CredentialStore {
	delete(): Promise<void>;
	read(): Promise<StoredSession | null>;
	write(session: StoredSession): Promise<void>;
}

export const createCredentialNamespace = (
	issuer: string,
	clientId: string
): string =>
	createHash("sha256").update(`${issuer}\0${clientId}`).digest("hex");

const isFileSystemError = (
	error: unknown,
	code: string
): error is NodeJS.ErrnoException =>
	error instanceof Error && "code" in error && error.code === code;

const isMissingEntryError = (error: unknown): boolean =>
	error instanceof Error && MISSING_ENTRY_PATTERN.test(error.message);

const invalidCredentialsError = (location: string): CliError =>
	new CliError(
		"CREDENTIALS_INVALID",
		`Stored Spendly credentials are invalid or unsafe: ${location}`
	);

const assertOwnerOnly = (options: {
	expectedMode: number;
	isExpectedType: boolean;
	location: string;
	mode: number;
	uid: number;
}): void => {
	const currentUserId = process.getuid?.();
	if (
		!options.isExpectedType ||
		options.mode % (PERMISSION_BITS_MASK + 1) !== options.expectedMode ||
		(currentUserId !== undefined && options.uid !== currentUserId)
	) {
		throw invalidCredentialsError(options.location);
	}
};

const parseStoredSession = (value: string, location: string): StoredSession => {
	let document: unknown;
	try {
		document = JSON.parse(value);
	} catch {
		throw invalidCredentialsError(location);
	}
	const result = storedSessionSchema.safeParse(document);
	if (!result.success) {
		throw invalidCredentialsError(location);
	}
	return result.data;
};

export class KeychainCredentialStore implements CredentialStore {
	readonly #entry: Entry;

	constructor(namespace: string) {
		this.#entry = new Entry(KEYCHAIN_SERVICE, namespace);
	}

	delete(): Promise<void> {
		try {
			this.#entry.deletePassword();
		} catch (error) {
			if (!isMissingEntryError(error)) {
				throw new CliError(
					"KEYCHAIN_UNAVAILABLE",
					"Unable to remove credentials from the operating-system keychain",
					{ cause: error }
				);
			}
		}
		return Promise.resolve();
	}

	read(): Promise<StoredSession | null> {
		try {
			const value = this.#entry.getPassword();
			if (value === null) {
				return Promise.resolve(null);
			}
			try {
				return Promise.resolve(
					parseStoredSession(value, "operating-system keychain")
				);
			} catch (error) {
				this.#entry.deletePassword();
				throw error;
			}
		} catch (error) {
			if (error instanceof CliError) {
				throw error;
			}
			if (isMissingEntryError(error)) {
				return Promise.resolve(null);
			}
			throw new CliError(
				"KEYCHAIN_UNAVAILABLE",
				"Unable to read the operating-system keychain",
				{ cause: error }
			);
		}
	}

	write(session: StoredSession): Promise<void> {
		const validatedSession = storedSessionSchema.parse(session);
		try {
			this.#entry.setPassword(JSON.stringify(validatedSession));
		} catch (error) {
			throw new CliError(
				"KEYCHAIN_UNAVAILABLE",
				"Unable to write to the operating-system keychain",
				{ cause: error }
			);
		}
		return Promise.resolve();
	}
}

export class FileCredentialStore implements CredentialStore {
	readonly #namespace: string;
	readonly path: string;

	constructor(
		namespace: string,
		path = join(homedir(), ".config", "spendly", "credentials.json")
	) {
		this.#namespace = namespace;
		this.path = path;
	}

	async #readDocument(): Promise<FileCredentialDocument> {
		let fileStats: Awaited<ReturnType<typeof lstat>>;
		try {
			fileStats = await lstat(this.path);
		} catch (error) {
			if (isFileSystemError(error, "ENOENT")) {
				return {};
			}
			throw error;
		}

		const directory = dirname(this.path);
		const directoryStats = await lstat(directory);
		assertOwnerOnly({
			expectedMode: OWNER_DIRECTORY_MODE,
			isExpectedType: directoryStats.isDirectory(),
			location: directory,
			mode: directoryStats.mode,
			uid: directoryStats.uid,
		});
		assertOwnerOnly({
			expectedMode: OWNER_FILE_MODE,
			isExpectedType: fileStats.isFile(),
			location: this.path,
			mode: fileStats.mode,
			uid: fileStats.uid,
		});

		let document: unknown;
		try {
			document = JSON.parse(await readFile(this.path, "utf8"));
		} catch {
			throw invalidCredentialsError(this.path);
		}
		const result = fileCredentialDocumentSchema.safeParse(document);
		if (!result.success) {
			throw invalidCredentialsError(this.path);
		}
		return result.data;
	}

	async #prepareDirectory(): Promise<void> {
		const directory = dirname(this.path);
		await mkdir(directory, { mode: OWNER_DIRECTORY_MODE, recursive: true });
		const directoryStats = await lstat(directory);
		if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
			throw invalidCredentialsError(directory);
		}
		const currentUserId = process.getuid?.();
		if (currentUserId !== undefined && directoryStats.uid !== currentUserId) {
			throw invalidCredentialsError(directory);
		}
		await chmod(directory, OWNER_DIRECTORY_MODE);
	}

	async #writeDocument(document: FileCredentialDocument): Promise<void> {
		const validatedDocument = fileCredentialDocumentSchema.parse(document);
		await this.#prepareDirectory();
		const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
		let renamed = false;
		try {
			const file = await open(temporaryPath, "wx", OWNER_FILE_MODE);
			try {
				await file.writeFile(`${JSON.stringify(validatedDocument)}\n`, "utf8");
				await file.sync();
			} finally {
				await file.close();
			}
			await chmod(temporaryPath, OWNER_FILE_MODE);
			await rename(temporaryPath, this.path);
			renamed = true;
			await chmod(this.path, OWNER_FILE_MODE);
		} finally {
			if (!renamed) {
				await unlink(temporaryPath).catch((error: unknown) => {
					if (!isFileSystemError(error, "ENOENT")) {
						throw error;
					}
				});
			}
		}
	}

	async delete(): Promise<void> {
		let document: FileCredentialDocument;
		try {
			document = await this.#readDocument();
		} catch (error) {
			if (error instanceof CliError && error.code === "CREDENTIALS_INVALID") {
				await unlink(this.path).catch((unlinkError: unknown) => {
					if (!isFileSystemError(unlinkError, "ENOENT")) {
						throw unlinkError;
					}
				});
				return;
			}
			throw error;
		}

		delete document[this.#namespace];
		if (Object.keys(document).length === 0) {
			await unlink(this.path).catch((error: unknown) => {
				if (!isFileSystemError(error, "ENOENT")) {
					throw error;
				}
			});
			return;
		}
		await this.#writeDocument(document);
	}

	async read(): Promise<StoredSession | null> {
		return (await this.#readDocument())[this.#namespace] ?? null;
	}

	async write(session: StoredSession): Promise<void> {
		const document = await this.#readDocument();
		document[this.#namespace] = storedSessionSchema.parse(session);
		await this.#writeDocument(document);
	}
}

export class ExplicitFallbackCredentialStore implements CredentialStore {
	readonly #allowFileStorage: boolean;
	readonly #fileStore: FileCredentialStore;
	readonly #keychainStore: CredentialStore;
	readonly #warn: (message: string) => void;

	constructor(options: {
		allowFileStorage: boolean;
		fileStore: FileCredentialStore;
		keychainStore: CredentialStore;
		warn?: (message: string) => void;
	}) {
		this.#allowFileStorage = options.allowFileStorage;
		this.#fileStore = options.fileStore;
		this.#keychainStore = options.keychainStore;
		this.#warn = options.warn ?? (() => undefined);
	}

	#warning(): void {
		this.#warn(
			`Warning: using owner-only plaintext credential storage at ${this.#fileStore.path}`
		);
	}

	async delete(): Promise<void> {
		let keychainError: unknown;
		let fileError: unknown;
		try {
			await this.#keychainStore.delete();
		} catch (error) {
			keychainError = error;
		}
		try {
			await this.#fileStore.delete();
		} catch (error) {
			fileError = error;
		}
		if (keychainError) {
			throw keychainError;
		}
		if (fileError) {
			throw fileError;
		}
	}

	async read(): Promise<StoredSession | null> {
		try {
			const session = await this.#keychainStore.read();
			if (session) {
				return session;
			}
		} catch (error) {
			if (!this.#allowFileStorage) {
				throw error;
			}
		}
		if (!this.#allowFileStorage) {
			return null;
		}
		const session = await this.#fileStore.read();
		if (session) {
			this.#warning();
		}
		return session;
	}

	async write(session: StoredSession): Promise<void> {
		try {
			await this.#keychainStore.write(session);
		} catch (error) {
			if (!this.#allowFileStorage) {
				throw error;
			}
			this.#warning();
			await this.#fileStore.write(session);
			return;
		}

		try {
			await this.#fileStore.delete();
		} catch (error) {
			await this.#keychainStore.delete();
			throw error;
		}
	}
}

export const createCredentialStore = (options: {
	allowFileStorage: boolean;
	clientId: string;
	issuer: string;
	warn: (message: string) => void;
}): CredentialStore => {
	const namespace = createCredentialNamespace(options.issuer, options.clientId);
	return new ExplicitFallbackCredentialStore({
		allowFileStorage: options.allowFileStorage,
		fileStore: new FileCredentialStore(namespace),
		keychainStore: new KeychainCredentialStore(namespace),
		warn: options.warn,
	});
};
