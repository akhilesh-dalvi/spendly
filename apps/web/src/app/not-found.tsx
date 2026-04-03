"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
			<h1 className="font-bold text-4xl text-foreground tracking-tight sm:text-5xl">
				404 - Page Not Found
			</h1>
			<p className="mt-4 text-lg text-muted-foreground">
				The page you're looking for doesn't exist or has been moved.
			</p>
			<div className="mt-6">
				<Button asChild>
					<Link href="/dashboard">Go to Dashboard</Link>
				</Button>
			</div>
		</div>
	);
}
