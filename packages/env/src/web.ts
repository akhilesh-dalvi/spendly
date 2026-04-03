import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	client: {
		NEXT_PUBLIC_CONVEX_URL: z.url(),
		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
		NEXT_PUBLIC_SITE_URL: z.url().optional(),
	},
	runtimeEnv: {
		NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
			process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
	},
	emptyStringAsUndefined: true,
});
