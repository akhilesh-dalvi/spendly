import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/logo";

export const cliDocsLayoutOptions: BaseLayoutProps = {
	nav: {
		title: (
			<span className="flex items-center gap-2">
				<Logo className="text-base" />
				<span className="rounded-full border border-fd-border bg-fd-muted px-2 py-0.5 font-medium text-fd-muted-foreground text-xs">
					CLI Docs
				</span>
			</span>
		),
		url: "/docs/cli",
	},
	links: [
		{
			text: "Spendly",
			url: "/",
			active: "none",
		},
		{
			type: "button",
			text: "Open app",
			url: "/dashboard",
			active: "none",
		},
	],
	githubUrl: "https://github.com/akhilesh-dalvi/spendly",
};
