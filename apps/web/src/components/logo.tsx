import { cn } from "@/lib/utils";

export const Logo = ({ className }: { className?: string }) => {
	return (
		<span
			className={cn(
				"text-pretty font-bold text-2xl text-foreground leading-tight tracking-tight",
				className
			)}
		>
			Spendly
		</span>
	);
};
