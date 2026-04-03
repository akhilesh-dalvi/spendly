import { MarketingHeader } from "@/components/marketing-header";

export default function MarketingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col">
			<MarketingHeader />
			<div className="pt-16">{children}</div>
		</div>
	);
}
