"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface OnboardingShellProps {
	children: ReactNode;
}

const getStepDetails = (
	pathname: string,
	path: "free" | "plan" | null
): { current: number; label: string; total: number } => {
	const total = path === "plan" ? 4 : 3;
	if (pathname.endsWith("/start")) {
		return { current: 1, label: "Choose your setup", total };
	}
	if (pathname.endsWith("/cycle")) {
		return { current: 2, label: "Create your first cycle", total };
	}
	if (pathname.endsWith("/categories")) {
		return { current: 3, label: "Shape your plan", total: 4 };
	}
	return {
		current: path === "plan" ? 4 : 3,
		label: "Add an account",
		total,
	};
};

const getBackHref = (
	pathname: string,
	path: "free" | "plan" | null,
	cycleId?: string
): string | null => {
	if (pathname.endsWith("/start")) {
		return null;
	}
	if (pathname.endsWith("/cycle")) {
		return "/onboarding/start";
	}
	if (pathname.endsWith("/categories")) {
		return `/onboarding/cycle?mode=plan${cycleId ? `&cycleId=${cycleId}` : ""}`;
	}
	if (path === "plan") {
		return `/onboarding/categories${cycleId ? `?cycleId=${cycleId}` : ""}`;
	}
	return `/onboarding/cycle?mode=free${cycleId ? `&cycleId=${cycleId}` : ""}`;
};

export function OnboardingStepControls({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const pathname = usePathname();
	const onboardingState = useQuery(api.users.getOnboardingState);
	const path = onboardingState?.path ?? null;
	const step = getStepDetails(pathname, path);
	const backHref = getBackHref(pathname, path, onboardingState?.cycle?._id);
	const progress = (step.current / step.total) * 100;

	return (
		<div className={cn("space-y-3 border-t pt-4", className)}>
			<div className="flex items-center justify-between gap-3 text-xs">
				<p className="font-medium">{step.label}</p>
				<p className="shrink-0 text-muted-foreground">
					Step {step.current} of {step.total}
				</p>
			</div>
			<div className="flex items-center gap-3">
				<Progress
					aria-label={`Step ${step.current} of ${step.total}`}
					className="h-1.5"
					value={progress}
				/>
			</div>
			<div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
				{backHref ? (
					<Button asChild variant="outline">
						<Link href={backHref as Route}>
							<ArrowLeft /> Back
						</Link>
					</Button>
				) : null}
				<div
					className={cn(
						"grid gap-2 sm:flex",
						backHref
							? "sm:ml-auto sm:justify-end"
							: "justify-items-end sm:ml-auto sm:justify-end"
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}

export function OnboardingShell({ children }: OnboardingShellProps) {
	return (
		<div className="relative min-h-screen overflow-hidden bg-muted/30 px-4 py-5 sm:px-6 sm:py-8">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-32 -left-24 size-80 rounded-full bg-primary/10 blur-3xl"
			/>
			<div className="mx-auto w-full max-w-3xl">
				<main>{children}</main>
			</div>
		</div>
	);
}
