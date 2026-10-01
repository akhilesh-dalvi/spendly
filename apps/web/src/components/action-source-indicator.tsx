"use client";

import { Bot, SquareTerminal } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export type ActionSource = "web" | "cli" | "cli_agent";

interface ActionSourceIndicatorProps {
	action: "added" | "changed" | "recorded" | "updated";
	source?: ActionSource;
}

const ACTION_LABELS = {
	added: "Added",
	changed: "Last changed",
	recorded: "Recorded",
	updated: "Last edited",
} as const;

const SOURCE_COLORS = {
	cli: "var(--action-source-cli, #3b82f6)",
	cli_agent: "var(--action-source-agent, #8b5cf6)",
} as const;

export function ActionSourceIndicator({
	action,
	source,
}: ActionSourceIndicatorProps) {
	if (source === undefined || source === "web") {
		return null;
	}

	const isAgent = source === "cli_agent";
	const label = isAgent
		? `${ACTION_LABELS[action]} by an AI agent via Spendly CLI`
		: `${ACTION_LABELS[action]} via Spendly CLI`;
	const Icon = isAgent ? Bot : SquareTerminal;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: The focusable informational icon isolates its tooltip from containing row actions. */}
				<span
					aria-label={label}
					className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring"
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							event.stopPropagation();
						}
					}}
					role="img"
					style={{ color: SOURCE_COLORS[source] }}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: The informational tooltip must be reachable by sighted keyboard users.
					tabIndex={0}
				>
					<Icon aria-hidden="true" className="size-3.5" />
				</span>
			</TooltipTrigger>
			<TooltipContent sideOffset={4}>{label}</TooltipContent>
		</Tooltip>
	);
}
