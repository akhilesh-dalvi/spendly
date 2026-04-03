import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: ComponentPropsWithoutRef<"div">) {
	return (
		<div
			className={cn("animate-pulse rounded-md bg-accent", className)}
			data-slot="skeleton"
			{...props}
		/>
	);
}

export { Skeleton };
