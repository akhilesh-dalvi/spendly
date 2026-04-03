"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

export function UserSync() {
	const { user } = useUser();
	const createUser = useMutation(api.users.create);
	const syncRef = useRef(false);

	useEffect(() => {
		if (user && !syncRef.current) {
			syncRef.current = true;
			const email = user.emailAddresses[0]?.emailAddress;
			if (email) {
				createUser({
					email,
					name: user.fullName || undefined,
				}).catch((err) => {
					console.error("Failed to sync user to Convex:", err);
					syncRef.current = false;
				});
			}
		}
	}, [user, createUser]);

	return null;
}
