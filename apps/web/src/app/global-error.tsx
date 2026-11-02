"use client";

import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/report-error";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const goToDashboard = useCallback(
		() => window.location.assign("/dashboard"),
		[]
	);
	useEffect(() => {
		reportError(error, { feature: "app", operation: "render" });
	}, [error]);

	return (
		<html lang="en">
			<body>
				<div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
					<h1 className="font-bold text-4xl text-foreground tracking-tight sm:text-5xl">
						Oops! Something went wrong.
					</h1>
					<p className="mt-4 text-lg text-muted-foreground">
						We're sorry for the inconvenience. Please try again or go back to
						the dashboard.
					</p>
					<div className="mt-6 flex space-x-4">
						<Button onClick={reset}>Try again</Button>
						<Button onClick={goToDashboard} variant="outline">
							Go to Dashboard
						</Button>
					</div>
				</div>
			</body>
		</html>
	);
}
