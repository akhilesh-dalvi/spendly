import { createHash, randomBytes } from "node:crypto";

export interface PkcePair {
	challenge: string;
	verifier: string;
}

export const createPkcePair = (): PkcePair => {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { challenge, verifier };
};

export const createOAuthNonce = (): string =>
	randomBytes(32).toString("base64url");
