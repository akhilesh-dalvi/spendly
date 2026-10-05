"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/report-error";

export default function AppError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		reportError(error, { feature: "app", operation: "render" });
	}, [error]);

	return (
		<div className="flex min-h-80 flex-col items-center justify-center gap-4 px-4 text-center">
			<h1 className="font-semibold text-xl">Something went wrong</h1>
			<p className="text-muted-foreground">
				We couldn't load this screen. Please try again.
			</p>
			<Button onClick={reset}>Try again</Button>
		</div>
	);
}
