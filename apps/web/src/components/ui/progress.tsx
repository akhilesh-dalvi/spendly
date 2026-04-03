"use client";

import {
	Indicator as ProgressIndicatorPrimitive,
	Root as ProgressRoot,
} from "@radix-ui/react-progress";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

function Progress({
	className,
	value,
	...props
}: ComponentPropsWithoutRef<typeof ProgressRoot>) {
	return (
		<ProgressRoot
			className={cn(
				"relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
				className
			)}
			data-slot="progress"
			{...props}
		>
			<ProgressIndicatorPrimitive
				className="h-full w-full flex-1 bg-primary transition-all"
				data-slot="progress-indicator"
				style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			/>
		</ProgressRoot>
	);
}

export { Progress };
