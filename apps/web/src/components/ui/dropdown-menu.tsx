"use client";

import {
	Content,
	Group,
	Item,
	Label,
	Portal,
	Root,
	Separator,
	Trigger,
} from "@radix-ui/react-dropdown-menu";
import type * as React from "react";

import { cn } from "@/lib/utils";

function DropdownMenu({ ...props }: React.ComponentProps<typeof Root>) {
	return <Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
	...props
}: React.ComponentProps<typeof Trigger>) {
	return <Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof Content>) {
	return (
		<Portal>
			<Content
				className={cn(
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in",
					className
				)}
				data-slot="dropdown-menu-content"
				sideOffset={sideOffset}
				{...props}
			/>
		</Portal>
	);
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof Group>) {
	return <Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: React.ComponentProps<typeof Item> & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<Item
			className={cn(
				"data-[variant=destructive]:*:[svg]:!text-destructive relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[disabled]:opacity-50 data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className
			)}
			data-inset={inset}
			data-slot="dropdown-menu-item"
			data-variant={variant}
			{...props}
		/>
	);
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: React.ComponentProps<typeof Label> & {
	inset?: boolean;
}) {
	return (
		<Label
			className={cn(
				"px-2 py-1.5 font-medium text-sm data-[inset]:pl-8",
				className
			)}
			data-inset={inset}
			data-slot="dropdown-menu-label"
			{...props}
		/>
	);
}

function DropdownMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof Separator>) {
	return (
		<Separator
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			data-slot="dropdown-menu-separator"
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
};
