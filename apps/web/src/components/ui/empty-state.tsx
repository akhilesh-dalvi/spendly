"use client";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
	action?: React.ReactNode;
	className?: string;
	description?: string;
	icon?: React.ReactNode;
	title: string;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center",
				className
			)}
		>
			{Boolean(icon) && (
				<div className="mb-4 text-muted-foreground">{icon}</div>
			)}
			<h3 className="mb-2 font-semibold text-lg">{title}</h3>
			{Boolean(description) && (
				<p className="mb-4 max-w-sm text-muted-foreground text-sm">
					{description}
				</p>
			)}
			{Boolean(action) && <div>{action}</div>}
		</div>
	);
}
