"use client";

import {
	Fallback as AvatarFallbackPrimitive,
	Image as AvatarImagePrimitive,
	Root as AvatarRoot,
} from "@radix-ui/react-avatar";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

function Avatar({
	className,
	size = "default",
	...props
}: ComponentPropsWithoutRef<typeof AvatarRoot> & {
	size?: "default" | "sm" | "lg";
}) {
	return (
		<AvatarRoot
			className={cn(
				"group/avatar relative flex size-8 shrink-0 select-none overflow-hidden rounded-full data-[size=lg]:size-10 data-[size=sm]:size-6",
				className
			)}
			data-size={size}
			data-slot="avatar"
			{...props}
		/>
	);
}

function AvatarImage({
	className,
	...props
}: ComponentPropsWithoutRef<typeof AvatarImagePrimitive>) {
	return (
		<AvatarImagePrimitive
			className={cn("aspect-square size-full", className)}
			data-slot="avatar-image"
			{...props}
		/>
	);
}

function AvatarFallback({
	className,
	...props
}: ComponentPropsWithoutRef<typeof AvatarFallbackPrimitive>) {
	return (
		<AvatarFallbackPrimitive
			className={cn(
				"flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm group-data-[size=sm]/avatar:text-xs",
				className
			)}
			data-slot="avatar-fallback"
			{...props}
		/>
	);
}

export { Avatar, AvatarFallback, AvatarImage };
