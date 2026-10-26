"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, CopyIcon } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TRAILING_NEWLINE = /\n$/;

const codeBlockVariants = cva(
	"group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-lg text-sm has-[[data-slot=code-block-content]:focus-visible]:ring-3 has-[[data-slot=code-block-content]:focus-visible]:ring-ring/50 data-[size=sm]:text-xs",
	{
		variants: {
			variant: {
				default:
					"border border-border bg-muted/40 text-foreground has-[[data-slot=code-block-content]:focus-visible]:border-ring",
				destructive: "border border-destructive/30 text-destructive",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
);

function CodeBlock({
	className,
	variant = "default",
	size = "default",
	...props
}: React.ComponentProps<"div"> &
	VariantProps<typeof codeBlockVariants> & { size?: "default" | "sm" }) {
	return (
		<div
			className={cn(codeBlockVariants({ variant }), className)}
			data-size={size}
			data-slot="code-block"
			data-variant={variant}
			{...props}
		/>
	);
}

function CodeBlockHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex h-11 min-w-0 shrink-0 items-center gap-2 border-border border-b px-4 text-muted-foreground *:has-[>[data-slot=code-block-title]]:min-w-0 group-data-[size=sm]/code-block:px-2.5 group-data-[variant=destructive]/code-block:text-destructive",
				className
			)}
			data-slot="code-block-header"
			{...props}
		/>
	);
}

function CodeBlockTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"inline-flex min-w-0 shrink-0 items-center gap-2 truncate font-medium font-sans text-muted-foreground text-xs group-data-[variant=destructive]/code-block:text-destructive [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
				className
			)}
			data-slot="code-block-title"
			{...props}
		/>
	);
}

function CodeBlockActions({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"ms-auto flex shrink-0 items-center gap-1 [[data-slot=code-block]>&]:absolute [[data-slot=code-block]>&]:end-2 [[data-slot=code-block]>&]:top-2 [[data-slot=code-block]>&]:z-10 [[data-slot=code-block]>&]:m-0 [[data-slot=code-block]>&]:opacity-0 [[data-slot=code-block]>&]:pointer-coarse:opacity-100 [[data-slot=code-block]>&]:transition-opacity [[data-slot=code-block]>&]:group-focus-within/code-block:opacity-100 [[data-slot=code-block]>&]:group-hover/code-block:opacity-100 group-data-[size=sm]/code-block:[[data-slot=code-block]>&]:end-1.5 group-data-[size=sm]/code-block:[[data-slot=code-block]>&]:top-1.5 [[data-slot=code-block]>&]:*:[button]:bg-background [[data-slot=code-block]>&]:*:[button]:ring-1 [[data-slot=code-block]>&]:*:[button]:ring-foreground/10",
				className
			)}
			data-slot="code-block-actions"
			{...props}
		/>
	);
}

function CodeBlockCopyButton({
	value,
	variant = "ghost",
	size = "icon-xs",
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button> & { value: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) {
			return;
		}

		const timeout = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timeout);
	}, [copied]);

	return (
		<>
			<Button
				aria-label={copied ? "Copied" : "Copy"}
				className={cn(className)}
				data-copied={copied || undefined}
				data-slot="code-block-copy-button"
				onClick={(event) => {
					onClick?.(event);
					if (event.defaultPrevented || !navigator.clipboard) {
						return;
					}
					navigator.clipboard
						.writeText(value)
						.then(() => setCopied(true))
						.catch(() => {
							// A denied clipboard must not announce a successful copy.
						});
				}}
				size={size}
				type="button"
				variant={variant}
				{...props}
			>
				{copied ? <CheckIcon /> : <CopyIcon />}
			</Button>
			<span aria-live="polite" className="sr-only">
				{copied ? "Copied" : ""}
			</span>
		</>
	);
}

function CodeBlockContent({
	className,
	children,
	style,
	wrap = false,
	lineNumbers = false,
	startLine = 1,
	...props
}: React.ComponentProps<"pre"> & {
	wrap?: boolean;
	lineNumbers?: boolean;
	startLine?: number;
}) {
	return (
		<pre
			className={cn(
				"data-wrap:wrap-break-word min-h-0 min-w-0 overflow-auto p-4 text-start font-mono text-[13px] leading-6 outline-none data-wrap:whitespace-pre-wrap group-data-[size=sm]/code-block:p-2.5 group-data-[size=sm]/code-block:text-xs",
				className
			)}
			data-numbered={lineNumbers || undefined}
			data-slot="code-block-content"
			data-wrap={wrap || undefined}
			dir="ltr"
			style={{ counterReset: `line ${startLine - 1}`, ...style }}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll long code blocks.
			tabIndex={0}
			{...props}
		>
			<code
				className="grid min-h-lh in-data-wrap:min-w-0 min-w-max in-data-numbered:grid-cols-[auto_1fr] content-start"
				data-slot="code-block-code"
			>
				{lineNumbers && typeof children === "string"
					? children
							.replace(TRAILING_NEWLINE, "")
							.split("\n")
							.map((line, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: Lines are stateless and identified by their position in the snippet.
								<CodeBlockLine key={index}>{line}</CodeBlockLine>
							))
					: children}
			</code>
		</pre>
	);
}

const codeBlockLineVariants = cva(
	"relative in-data-numbered:col-span-2 -mx-3 block in-data-numbered:grid min-h-lh in-data-numbered:grid-cols-subgrid in-data-numbered:gap-x-3 px-3 in-data-numbered:[counter-increment:line] before:min-w-6 in-data-numbered:before:select-none before:text-end before:text-muted-foreground in-data-numbered:before:content-[counter(line)] after:absolute after:start-1 after:top-0 after:select-none after:text-muted-foreground group-data-[size=sm]/code-block:-mx-2.5 group-data-[size=sm]/code-block:px-2.5 in-data-numbered:supports-[content:counter(line)_/_'']:before:content-[counter(line)_/_'']",
	{
		variants: {
			variant: {
				default: "",
				added: "bg-muted after:content-['+']",
				removed: "bg-destructive/10 after:text-destructive after:content-['−']",
				highlighted: "bg-muted",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
);

function CodeBlockLine({
	className,
	variant = "default",
	children,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof codeBlockLineVariants>) {
	// An empty line holds a newline so copying a selection keeps blank lines.
	const empty =
		children === undefined ||
		children === null ||
		children === "" ||
		(Array.isArray(children) && children.length === 0);

	return (
		<span
			className={cn(codeBlockLineVariants({ variant }), className)}
			data-slot="code-block-line"
			data-variant={variant}
			{...props}
		>
			<span className="min-w-0" data-slot="code-block-line-content">
				{empty ? "\n" : children}
			</span>
		</span>
	);
}

export {
	CodeBlock,
	CodeBlockHeader,
	CodeBlockTitle,
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockContent,
};
