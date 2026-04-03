"use client";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
	icon?: React.ReactNode;
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
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
			{icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
			<h3 className="mb-2 font-semibold text-lg">{title}</h3>
			{description && (
				<p className="mb-4 max-w-sm text-muted-foreground text-sm">
					{description}
				</p>
			)}
			{action && <div>{action}</div>}
		</div>
	);
}
