const SENSITIVE_KEYS = new Set([
	"access_token",
	"accesstoken",
	"authorization",
	"authorization_code",
	"authorizationcode",
	"client_secret",
	"clientsecret",
	"code_verifier",
	"codeverifier",
	"cookie",
	"id_token",
	"idtoken",
	"pkce_verifier",
	"pkceverifier",
	"refresh_token",
	"refreshtoken",
	"set-cookie",
	"setcookie",
	"token",
]);

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const BEARER_PATTERN = /Bearer\s+[^\s"']+/giu;
const SENSITIVE_ASSIGNMENT_PATTERN =
	/((?:access_token|authorization_code|client_secret|code|code_verifier|id_token|pkce_verifier|refresh_token|token)=)[^&\s"']+/giu;

export const redactText = (value: string): string =>
	value
		.replace(BEARER_PATTERN, "Bearer [REDACTED]")
		.replace(JWT_PATTERN, "[REDACTED]")
		.replace(SENSITIVE_ASSIGNMENT_PATTERN, "$1[REDACTED]");

export const redactValue = (value: unknown): unknown => {
	if (typeof value === "string") {
		return redactText(value);
	}

	if (Array.isArray(value)) {
		return value.map(redactValue);
	}

	if (value && typeof value === "object") {
		const redacted: Record<string, unknown> = {};
		for (const [key, childValue] of Object.entries(value)) {
			redacted[key] = SENSITIVE_KEYS.has(key.toLowerCase())
				? "[REDACTED]"
				: redactValue(childValue);
		}
		return redacted;
	}

	return value;
};
