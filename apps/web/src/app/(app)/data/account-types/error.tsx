"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/report-error";

export default function AccountTypesError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		reportError(error, { feature: "account-types", operation: "render" });
	}, [error]);

	return (
		<div className="flex min-h-80 items-center justify-center py-8">
			<Alert className="max-w-lg" variant="destructive">
				<CircleAlert />
				<AlertTitle>Account types could not be loaded</AlertTitle>
				<AlertDescription className="flex flex-col items-start gap-4">
					<p>
						Your account data has not been changed. Retry the request, or return
						to this screen in a moment.
					</p>
					<Button onClick={reset} size="sm" variant="outline">
						<RotateCcw data-icon="inline-start" />
						Try again
					</Button>
				</AlertDescription>
			</Alert>
		</div>
	);
}
