"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AccountTypesError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
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
