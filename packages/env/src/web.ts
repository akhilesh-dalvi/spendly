import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	client: {
		NEXT_PUBLIC_CONVEX_URL: z.url(),
		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
		NEXT_PUBLIC_SITE_URL: z.url().optional(),
		NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
		NEXT_PUBLIC_SENTRY_ENABLED: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
			.enum(["production", "preview", "development", "test"])
			.optional(),
		NEXT_PUBLIC_SENTRY_RELEASE: z.string().min(1).optional(),
	},
	runtimeEnv: {
		NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
			process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
		NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
		NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
	},
	emptyStringAsUndefined: true,
});
