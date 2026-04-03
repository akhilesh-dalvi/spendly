"use client";

import {
	Action as AlertDialogActionPrimitive,
	Cancel as AlertDialogCancelPrimitive,
	Content as AlertDialogContentPrimitive,
	Description as AlertDialogDescriptionPrimitive,
	Overlay as AlertDialogOverlayPrimitive,
	Portal as AlertDialogPortalPrimitive,
	Root as AlertDialogRoot,
	Title as AlertDialogTitlePrimitive,
	Trigger as AlertDialogTriggerPrimitive,
} from "@radix-ui/react-alert-dialog";
import type { ComponentPropsWithoutRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function AlertDialog({
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogRoot>) {
	return <AlertDialogRoot data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogTriggerPrimitive>) {
	return (
		<AlertDialogTriggerPrimitive data-slot="alert-dialog-trigger" {...props} />
	);
}

function AlertDialogPortal({
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogPortalPrimitive>) {
	return (
		<AlertDialogPortalPrimitive data-slot="alert-dialog-portal" {...props} />
	);
}

function AlertDialogOverlay({
	className,
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogOverlayPrimitive>) {
	return (
		<AlertDialogOverlayPrimitive
			className={cn(
				"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 pointer-events-auto fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in",
				className
			)}
			data-slot="alert-dialog-overlay"
			{...props}
		/>
	);
}

function AlertDialogContent({
	className,
	size = "default",
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogContentPrimitive> & {
	size?: "default" | "sm";
}) {
	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<AlertDialogContentPrimitive
				className={cn(
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=open]:animate-in data-[size=default]:sm:max-w-lg",
					className
				)}
				data-size={size}
				data-slot="alert-dialog-content"
				{...props}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({
	className,
	...props
}: ComponentPropsWithoutRef<"div">) {
	return (
		<div
			className={cn(
				"grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
				className
			)}
			data-slot="alert-dialog-header"
			{...props}
		/>
	);
}

function AlertDialogFooter({
	className,
	...props
}: ComponentPropsWithoutRef<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
				className
			)}
			data-slot="alert-dialog-footer"
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogTitlePrimitive>) {
	return (
		<AlertDialogTitlePrimitive
			className={cn(
				"font-semibold text-lg sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
				className
			)}
			data-slot="alert-dialog-title"
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogDescriptionPrimitive>) {
	return (
		<AlertDialogDescriptionPrimitive
			className={cn("text-muted-foreground text-sm", className)}
			data-slot="alert-dialog-description"
			{...props}
		/>
	);
}

function AlertDialogMedia({
	className,
	...props
}: ComponentPropsWithoutRef<"div">) {
	return (
		<div
			className={cn(
				"mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
				className
			)}
			data-slot="alert-dialog-media"
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	variant = "default",
	size = "default",
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogActionPrimitive> &
	Pick<ComponentPropsWithoutRef<typeof Button>, "variant" | "size">) {
	return (
		<Button asChild size={size} variant={variant}>
			<AlertDialogActionPrimitive
				className={cn(className)}
				data-slot="alert-dialog-action"
				{...props}
			/>
		</Button>
	);
}

function AlertDialogCancel({
	className,
	variant = "outline",
	size = "default",
	...props
}: ComponentPropsWithoutRef<typeof AlertDialogCancelPrimitive> &
	Pick<ComponentPropsWithoutRef<typeof Button>, "variant" | "size">) {
	return (
		<Button asChild size={size} variant={variant}>
			<AlertDialogCancelPrimitive
				className={cn(className)}
				data-slot="alert-dialog-cancel"
				{...props}
			/>
		</Button>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
