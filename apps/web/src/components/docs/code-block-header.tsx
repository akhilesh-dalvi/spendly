import { SquareTerminalIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockHeader,
	CodeBlockTitle,
} from "@/components/ui/code-block";

export function DocsCodeBlockHeader({
	value,
	title = "Terminal",
	children,
}: {
	value: string;
	title?: string;
	children?: ReactNode;
}) {
	return (
		<CodeBlockHeader>
			<CodeBlockTitle>
				<SquareTerminalIcon aria-hidden="true" />
				<span className={children ? "sr-only" : undefined}>{title}</span>
			</CodeBlockTitle>
			{children}
			<CodeBlockActions>
				<CodeBlockCopyButton key={value} value={value} />
			</CodeBlockActions>
		</CodeBlockHeader>
	);
}
