import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { CliError } from "./errors.js";

export interface ConvexIdentityProof {
	authenticated: boolean;
	backendUserId: string | null;
	currency: string | null;
	identitySubject: string;
	subjectMatchesBackendUser: boolean;
}

const identityProofQuery = makeFunctionReference<
	"query",
	Record<string, never>,
	ConvexIdentityProof
>("cli/v1/auth:identity");

export const proveConvexIdentity = async (options: {
	convexUrl: string;
	idToken: string;
}): Promise<ConvexIdentityProof> => {
	const client = new ConvexHttpClient(options.convexUrl);
	client.setAuth(options.idToken);
	try {
		return await client.query(identityProofQuery, {});
	} catch (error) {
		throw CliError.fromCause(
			error,
			"NETWORK_ERROR",
			"Convex rejected the authenticated identity proof",
			{
				retryable: true,
			}
		);
	} finally {
		client.clearAuth();
	}
};
