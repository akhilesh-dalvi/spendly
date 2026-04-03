"use client";

import {
	Arrow as TooltipArrowPrimitive,
	Content as TooltipContentPrimitive,
	Portal as TooltipPortalPrimitive,
	Provider as TooltipProviderPrimitive,
	Root as TooltipRoot,
	Trigger as TooltipTriggerPrimitive,
} from "@radix-ui/react-tooltip";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({
	delayDuration = 0,
	...props
}: ComponentPropsWithoutRef<typeof TooltipProviderPrimitive>) {
	return (
		<TooltipProviderPrimitive
			data-slot="tooltip-provider"
			delayDuration={delayDuration}
			{...props}
		/>
	);
}

function Tooltip({ ...props }: ComponentPropsWithoutRef<typeof TooltipRoot>) {
	return (
		<TooltipProvider>
			<TooltipRoot data-slot="tooltip" {...props} />
		</TooltipProvider>
	);
}

function TooltipTrigger({
	...props
}: ComponentPropsWithoutRef<typeof TooltipTriggerPrimitive>) {
	return <TooltipTriggerPrimitive data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	sideOffset = 0,
	children,
	...props
}: ComponentPropsWithoutRef<typeof TooltipContentPrimitive>) {
	return (
		<TooltipPortalPrimitive>
			<TooltipContentPrimitive
				className={cn(
					"fade-in-0 zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in text-balance rounded-md bg-foreground px-3 py-1.5 text-background text-xs data-[state=closed]:animate-out",
					className
				)}
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				{...props}
			>
				{children}
				<TooltipArrowPrimitive className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
			</TooltipContentPrimitive>
		</TooltipPortalPrimitive>
	);
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
