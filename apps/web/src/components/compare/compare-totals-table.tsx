import { format, parseISO } from "date-fns";
import type { CompareCycleRow } from "@/components/compare/types";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface CompareTotalsTableProps {
	rows: CompareCycleRow[];
	formatCurrency: (amount: number) => string;
}

export function CompareTotalsTable({
	rows,
	formatCurrency,
}: CompareTotalsTableProps) {
	return (
		<div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="sticky left-0 z-20 bg-card">
								Cycle
							</TableHead>
							<TableHead>Date Range</TableHead>
							<TableHead className="text-right">Total Spent</TableHead>
							<TableHead className="text-right">Total Planned</TableHead>
							<TableHead className="text-right">Difference</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => {
							const hasPlanned = row.totalPlanned > 0;
							const difference = row.totalPlanned - row.totalSpent;
							return (
								<TableRow className="odd:bg-card/20" key={row.cycleId}>
									<TableCell className="sticky left-0 z-10 bg-card font-medium">
										{row.cycleName}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{format(parseISO(row.startDate), "MMM d, yyyy")} -{" "}
										{format(parseISO(row.endDate), "MMM d, yyyy")}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatCurrency(row.totalSpent)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{hasPlanned ? formatCurrency(row.totalPlanned) : "—"}
									</TableCell>
									<TableCell
										className={cn(
											"text-right tabular-nums",
											hasPlanned && difference < 0 && "text-destructive"
										)}
									>
										{hasPlanned ? formatCurrency(difference) : "—"}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
