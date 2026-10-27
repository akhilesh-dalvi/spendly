import { type ComponentProps, isValidElement, type ReactNode } from "react";
import { DocsCodeBlockHeader } from "@/components/docs/code-block-header";
import { PackageManagerCodeBlock } from "@/components/docs/package-manager-code-block";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { highlightCommands } from "@/lib/docs/highlight-commands";
import { packageManagerCommands } from "@/lib/docs/package-manager";
import { cn } from "@/lib/utils";

function codeText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map(codeText).join("");
	}
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return codeText(node.props.children);
	}
	return "";
}

export async function DocsCodeBlock({
	children,
	className,
	title,
	...props
}: ComponentProps<"pre">) {
	// Fumadocs already highlights fences on the server. Keep those tokens rather
	// than shipping another syntax highlighter to the browser.
	const content =
		isValidElement<{ children?: ReactNode }>(children) &&
		children.type === "code"
			? children.props.children
			: children;

	const text = codeText(content);
	const commands = packageManagerCommands(text);
	if (commands) {
		return (
			<PackageManagerCodeBlock
				className={className}
				commands={commands}
				highlightedCommands={await highlightCommands(commands)}
				title={title}
				{...props}
			/>
		);
	}

	return (
		<CodeBlock className={cn("shiki not-prose my-4", className)}>
			<DocsCodeBlockHeader title={title} value={text} />
			<CodeBlockContent {...props}>{content}</CodeBlockContent>
		</CodeBlock>
	);
}
