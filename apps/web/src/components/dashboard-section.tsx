import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardSectionProps {
	title: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	headerClassName?: string;
	contentClassName?: string;
}

export function DashboardSection({
	title,
	action,
	children,
	className,
	headerClassName,
	contentClassName,
}: DashboardSectionProps) {
	return (
		<Card className={cn("border-none bg-transparent shadow-none", className)}>
			<CardHeader
				className={cn(
					"flex flex-row items-center justify-between px-0",
					headerClassName
				)}
			>
				<CardTitle className="font-bold text-xl">{title}</CardTitle>
				{action && <div className="flex items-center gap-2">{action}</div>}
			</CardHeader>
			<CardContent className={cn("px-0", contentClassName)}>
				{children}
			</CardContent>
		</Card>
	);
}
