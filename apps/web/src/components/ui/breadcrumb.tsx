import { Slot } from "@radix-ui/react-slot";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

function Breadcrumb({ ...props }: ComponentPropsWithoutRef<"nav">) {
	return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({
	className,
	...props
}: ComponentPropsWithoutRef<"ol">) {
	return (
		<ol
			className={cn(
				"flex flex-wrap items-center gap-1.5 break-words text-muted-foreground text-sm sm:gap-2.5",
				className
			)}
			data-slot="breadcrumb-list"
			{...props}
		/>
	);
}

function BreadcrumbItem({
	className,
	...props
}: ComponentPropsWithoutRef<"li">) {
	return (
		<li
			className={cn("inline-flex items-center gap-1.5", className)}
			data-slot="breadcrumb-item"
			{...props}
		/>
	);
}

function BreadcrumbLink({
	asChild,
	className,
	...props
}: ComponentPropsWithoutRef<"a"> & {
	asChild?: boolean;
}) {
	const Comp = asChild ? Slot : "a";

	return (
		<Comp
			className={cn("transition-colors hover:text-foreground", className)}
			data-slot="breadcrumb-link"
			{...props}
		/>
	);
}

function BreadcrumbPage({
	className,
	...props
}: ComponentPropsWithoutRef<"span">) {
	return (
		<span
			aria-current="page"
			aria-disabled="true"
			className={cn("font-normal text-foreground", className)}
			data-slot="breadcrumb-page"
			{...props}
		/>
	);
}

function BreadcrumbSeparator({
	children,
	className,
	...props
}: ComponentPropsWithoutRef<"li">) {
	return (
		<li
			aria-hidden="true"
			className={cn("[&>svg]:size-3.5", className)}
			data-slot="breadcrumb-separator"
			role="presentation"
			{...props}
		>
			{children ?? <ChevronRight />}
		</li>
	);
}

function BreadcrumbEllipsis({
	className,
	...props
}: ComponentPropsWithoutRef<"span">) {
	return (
		<span
			aria-hidden="true"
			className={cn("flex size-9 items-center justify-center", className)}
			data-slot="breadcrumb-ellipsis"
			role="presentation"
			{...props}
		>
			<MoreHorizontal className="size-4" />
			<span className="sr-only">More</span>
		</span>
	);
}

export {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
	BreadcrumbEllipsis,
};
