"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";
import { reportError } from "@/lib/report-error";

export function UserSync() {
	const { isLoaded, user } = useUser();
	const createUser = useMutation(api.users.create);
	const syncRef = useRef(false);
	const identifiedUserIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isLoaded) return;

		if (!user) {
			if (identifiedUserIdRef.current) {
				posthog.reset();
				identifiedUserIdRef.current = null;
			}
			return;
		}

		if (identifiedUserIdRef.current === user.id) return;

		if (identifiedUserIdRef.current) {
			posthog.reset();
		}

		posthog.identify(user.id, {
			email: user.primaryEmailAddress?.emailAddress,
			name: user.fullName || undefined,
		});
		identifiedUserIdRef.current = user.id;
	}, [isLoaded, user]);

	useEffect(() => {
		if (user && !syncRef.current) {
			syncRef.current = true;
			const email = user.emailAddresses[0]?.emailAddress;
			if (email) {
				createUser({
					email,
					name: user.fullName || undefined,
				}).catch((err) => {
					reportError(err, { feature: "auth", operation: "sync" });
					syncRef.current = false;
				});
			}
		}
	}, [user, createUser]);

	return null;
}
