import { MarketingHeader } from "@/components/marketing-header";

export default function MarketingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col">
			<a
				className="sr-only fixed top-4 left-4 z-50 rounded-md bg-background px-4 py-2 font-medium text-foreground shadow-lg outline-none focus:not-sr-only focus:ring-2 focus:ring-ring"
				href="#main-content"
			>
				Skip to content
			</a>
			<MarketingHeader />
			<div className="pt-16">{children}</div>
		</div>
	);
}
