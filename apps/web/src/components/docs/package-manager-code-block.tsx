"use client";

import {
	type ComponentProps,
	type ReactNode,
	useSyncExternalStore,
} from "react";
import { DocsCodeBlockHeader } from "@/components/docs/code-block-header";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	isPackageManager,
	PACKAGE_MANAGERS,
	type PackageManager,
	type PackageManagerCommands,
} from "@/lib/docs/package-manager";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "spendly-docs-package-manager";
const CHANGE_EVENT = "spendly-docs-package-manager-change";
let memoryPreference: PackageManager = "npm";
let volatilePreference: PackageManager | undefined;

function subscribe(onChange: () => void) {
	function onStorage(event: StorageEvent) {
		if (event.key === STORAGE_KEY || event.key === null) {
			volatilePreference = undefined;
			onChange();
		}
	}
	window.addEventListener("storage", onStorage);
	window.addEventListener(CHANGE_EVENT, onChange);
	return () => {
		window.removeEventListener("storage", onStorage);
		window.removeEventListener(CHANGE_EVENT, onChange);
	};
}

function preference(): PackageManager {
	if (volatilePreference) {
		return volatilePreference;
	}
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return isPackageManager(stored) ? stored : "npm";
	} catch {
		return memoryPreference;
	}
}

function serverPreference(): PackageManager {
	return "npm";
}

function changePreference(value: string) {
	if (!isPackageManager(value)) {
		return;
	}
	memoryPreference = value;
	try {
		window.localStorage.setItem(STORAGE_KEY, value);
		volatilePreference = undefined;
	} catch {
		// Reads may succeed even when writes fail (for example, a full quota).
		volatilePreference = value;
	}
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function PackageManagerCodeBlock({
	commands,
	highlightedCommands,
	className,
	title,
	...props
}: Omit<ComponentProps<"pre">, "children"> & {
	commands: PackageManagerCommands;
	highlightedCommands: Record<PackageManager, ReactNode>;
}) {
	const manager = useSyncExternalStore(subscribe, preference, serverPreference);

	return (
		<Tabs
			className="not-prose my-4 gap-0"
			onValueChange={changePreference}
			value={manager}
		>
			<CodeBlock className={cn("shiki", className)}>
				<DocsCodeBlockHeader title={title} value={commands[manager]}>
					<TabsList aria-label="Package manager" variant="code">
						{PACKAGE_MANAGERS.map((value) => (
							<TabsTrigger key={value} value={value}>
								{value}
							</TabsTrigger>
						))}
					</TabsList>
				</DocsCodeBlockHeader>
				{PACKAGE_MANAGERS.map((value) => (
					<TabsContent key={value} value={value}>
						<CodeBlockContent {...props}>
							{highlightedCommands[value]}
						</CodeBlockContent>
					</TabsContent>
				))}
			</CodeBlock>
			{manager === "yarn" && commands.yarn.includes("npx ") && (
				<p className="mt-2 text-muted-foreground text-xs">
					One-off tools use npx (included with Node.js) so these commands also
					work with Yarn Classic.
				</p>
			)}
			{manager === "yarn" && commands.yarn.includes("yarn global ") && (
				<p className="mt-2 text-muted-foreground text-xs">
					Global commands require Yarn Classic. With modern Yarn, use another
					tab for global installation or removal.
				</p>
			)}
		</Tabs>
	);
}
