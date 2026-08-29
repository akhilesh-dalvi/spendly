interface DataSummaryItem {
	description: string;
	label: string;
	value: number | string;
}

interface DataSummaryStripProps {
	ariaLabel: string;
	items: readonly DataSummaryItem[];
}

export function DataSummaryStrip({ ariaLabel, items }: DataSummaryStripProps) {
	return (
		<section
			aria-label={ariaLabel}
			className="overflow-hidden rounded-2xl border bg-card/50 shadow-sm"
		>
			<div className="grid divide-y divide-border/40 md:grid-cols-3 md:divide-x md:divide-y-0">
				{items.map((item) => (
					<div
						className="flex flex-col justify-between bg-card/5 p-6 transition-colors hover:bg-card/10"
						key={item.label}
					>
						<div>
							<p className="font-bold text-[10px] text-muted-foreground/80 uppercase tracking-widest">
								{item.label}
							</p>
							<p className="mt-2 font-medium text-3xl tabular-nums tracking-tight">
								{item.value}
							</p>
						</div>

						<div className="mt-4 flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className="size-1.5 shrink-0 rounded-full bg-primary"
							/>
							<p className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider">
								{item.description}
							</p>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
