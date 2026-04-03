"use client";

import { useAuth } from "@clerk/nextjs";
import { env } from "@spendly/env/web";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";
import { UserSync } from "./user-sync";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			disableTransitionOnChange
			enableSystem
		>
			<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
				<UserSync />
				{children}
			</ConvexProviderWithClerk>
			<Toaster richColors />
		</ThemeProvider>
	);
}
