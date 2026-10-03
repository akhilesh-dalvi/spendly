import { z } from "zod";
import { httpsUrlSchema } from "../config.js";

const MAX_CREDENTIAL_LENGTH = 20_000;

const oauthTokenSetSchema = z
	.object({
		expiresAt: z.number().int().nonnegative().finite(),
		idToken: z.string().min(1).max(MAX_CREDENTIAL_LENGTH),
		refreshToken: z.string().min(1).max(MAX_CREDENTIAL_LENGTH),
	})
	.strict();

export const storedSessionSchema = z
	.object({
		clientId: z.string().min(1).max(512),
		issuer: httpsUrlSchema,
		loginAt: z.number().int().nonnegative().finite(),
		schemaVersion: z.literal(1),
		subject: z.string().min(1).max(512),
		tokens: oauthTokenSetSchema,
	})
	.strict();

export type OAuthTokenSet = z.infer<typeof oauthTokenSetSchema>;
export type StoredSession = z.infer<typeof storedSessionSchema>;

export interface VerifiedIdentity {
	expiresAt: number;
	subject: string;
}
