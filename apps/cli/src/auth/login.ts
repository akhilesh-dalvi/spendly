import type { AuthReadyRuntimeConfig } from "../config.js";
import { openSystemBrowser } from "./browser.js";
import { startCallbackServer } from "./callback-server.js";
import type { CredentialStore } from "./credential-store.js";
import {
	buildAuthorizationUrl,
	discoverOAuth,
	exchangeAuthorizationCode,
	verifyIdToken,
} from "./oauth.js";
import { createOAuthNonce, createPkcePair } from "./pkce.js";
import type { StoredSession } from "./types.js";

export const login = async (options: {
	config: AuthReadyRuntimeConfig;
	fetchImplementation?: typeof fetch;
	now?: number;
	openBrowser?: (url: string) => Promise<boolean>;
	printAuthorizationUrl: (url: string, browserOpened: boolean) => void;
	store: CredentialStore;
}): Promise<StoredSession> => {
	const discovery = await discoverOAuth(
		options.config.issuer,
		options.fetchImplementation
	);
	const pkce = createPkcePair();
	const state = createOAuthNonce();
	const nonce = createOAuthNonce();
	const callback = await startCallbackServer({ expectedState: state });

	try {
		const authorizationUrl = buildAuthorizationUrl({
			challenge: pkce.challenge,
			clientId: options.config.clientId,
			discovery,
			nonce,
			redirectUri: callback.redirectUri,
			state,
		});
		const browserOpened = await (options.openBrowser ?? openSystemBrowser)(
			authorizationUrl.toString()
		);
		options.printAuthorizationUrl(authorizationUrl.toString(), browserOpened);
		const { code } = await callback.waitForCallback;
		const loginAt = options.now ?? Date.now();
		const tokens = await exchangeAuthorizationCode({
			clientId: options.config.clientId,
			code,
			discovery,
			fetchImplementation: options.fetchImplementation,
			now: loginAt,
			redirectUri: callback.redirectUri,
			verifier: pkce.verifier,
		});
		const identity = await verifyIdToken({
			clientId: options.config.clientId,
			discovery,
			fetchImplementation: options.fetchImplementation,
			idToken: tokens.idToken,
			nonce,
			now: loginAt,
		});
		const session: StoredSession = {
			clientId: options.config.clientId,
			issuer: options.config.issuer,
			loginAt,
			schemaVersion: 1,
			subject: identity.subject,
			tokens: { ...tokens, expiresAt: identity.expiresAt },
		};
		await options.store.write(session);
		return session;
	} finally {
		await callback.close();
	}
};
