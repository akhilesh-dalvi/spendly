import { isAbsolute } from "node:path";
import {
	type CredentialStore,
	createCredentialNamespace,
	FileCredentialStore,
} from "../src/auth/credential-store.js";
import { CliError } from "../src/errors.js";
import { type CliRuntime, createProcessRuntime } from "../src/runtime.js";
import { loadDevelopmentConfig } from "./config.js";

const accessCredentials = async <T>(
	operation: () => Promise<T>
): Promise<T> => {
	try {
		return await operation();
	} catch {
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw new CliError(
			"CREDENTIALS_INVALID",
			"Unable to access development credential storage"
		);
	}
};

const protectFileErrors = (store: FileCredentialStore): CredentialStore => ({
	delete: () => accessCredentials(() => store.delete()),
	read: () => accessCredentials(() => store.read()),
	write: (session) => accessCredentials(() => store.write(session)),
});

export const createDevelopmentRuntime = (
	environment: NodeJS.ProcessEnv = process.env
): CliRuntime => {
	const runtime = createProcessRuntime(
		() => loadDevelopmentConfig(environment),
		environment,
		{ developmentTools: true }
	);
	const path = environment.SPENDLY_E2E_CREDENTIAL_FILE;
	if (path === undefined) {
		return runtime;
	}

	let store: CredentialStore | undefined;
	return {
		...runtime,
		get credentialStore() {
			if (!store) {
				if (!isAbsolute(path)) {
					throw new CliError(
						"CONFIGURATION_ERROR",
						"Development credential file must use an absolute path"
					);
				}
				const config = runtime.getConfig();
				if (config.authReady) {
					store = protectFileErrors(
						new FileCredentialStore(
							createCredentialNamespace(config.issuer, config.clientId),
							path
						)
					);
				}
			}
			return store;
		},
	};
};
