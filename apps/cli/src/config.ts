import { z } from "zod";

const isHttpsUrl = (value: string): boolean =>
	new URL(value).protocol === "https:";
const isHttpsOrLoopbackHttpUrl = (value: string): boolean => {
	const url = new URL(value);
	return (
		url.protocol === "https:" ||
		(url.protocol === "http:" &&
			(url.hostname === "localhost" || url.hostname === "127.0.0.1"))
	);
};

export const httpsUrlSchema = z.url().refine(isHttpsUrl, {
	message: "URL must use HTTPS",
});

const commonRuntimeConfigSchema = z.object({
	convexUrl: httpsUrlSchema,
	environment: z.enum(["development", "production"]),
	issuer: httpsUrlSchema,
	webUrl: z.url().refine(isHttpsOrLoopbackHttpUrl, {
		message: "Web URL must use HTTPS or loopback HTTP",
	}),
});

export const runtimeConfigSchema = z.discriminatedUnion("authReady", [
	commonRuntimeConfigSchema.extend({
		authReady: z.literal(true),
		clientId: z.string().min(1),
	}),
	commonRuntimeConfigSchema.extend({
		authReady: z.literal(false),
		clientId: z.null(),
	}),
]);

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type AuthReadyRuntimeConfig = Extract<
	RuntimeConfig,
	{ authReady: true }
>;

// Public production endpoints are intentionally compiled into the npm package.
// An approved production Clerk OAuth client ID is not available in the checkout;
// until it is supplied, auth commands fail locally before making a request.
export const PRODUCTION_CONFIG = runtimeConfigSchema.parse({
	authReady: false,
	clientId: null,
	convexUrl: "https://successful-donkey-782.convex.cloud",
	environment: "production",
	issuer: "https://clerk.spendly.akhileshdalvi.com",
	webUrl: "https://spendly.akhileshdalvi.com",
});
