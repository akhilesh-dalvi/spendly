import { format, parseISO } from "date-fns";
import type { CompareCycleRow } from "@/components/compare/types";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface CompareCategoryAccordionProps {
	rows: CompareCycleRow[];
	formatCurrency: (amount: number) => string;
}

export function CompareCategoryAccordion({
	rows,
	formatCurrency,
}: CompareCategoryAccordionProps) {
	return (
		<div className="overflow-hidden rounded-2xl border border-border/70 bg-card/50 px-4 sm:px-6">
			<Accordion className="w-full" type="multiple">
				{rows.map((row) => (
					<AccordionItem key={row.cycleId} value={row.cycleId}>
						<AccordionTrigger className="hover:no-underline">
							<div className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between sm:pr-4">
								<div>
									<p className="font-semibold">{row.cycleName}</p>
									<p className="text-muted-foreground text-xs">
										{format(parseISO(row.startDate), "MMM d, yyyy")} -{" "}
										{format(parseISO(row.endDate), "MMM d, yyyy")}
									</p>
								</div>
								<div className="text-muted-foreground text-xs sm:text-sm">
									{row.categoryBreakdown.length} categories
								</div>
							</div>
						</AccordionTrigger>
						<AccordionContent>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Category</TableHead>
											<TableHead className="text-right">Spent</TableHead>
											<TableHead className="text-right">Planned</TableHead>
											<TableHead className="text-right">Difference</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{row.categoryBreakdown.length === 0 ? (
											<TableRow>
												<TableCell
													className="text-muted-foreground"
													colSpan={4}
												>
													No category breakdown for this cycle.
												</TableCell>
											</TableRow>
										) : (
											row.categoryBreakdown.map((category) => {
												const hasPlan =
													typeof category.planned === "number" &&
													category.planned > 0;
												const difference = hasPlan
													? (category.planned as number) - category.spent
													: null;

												return (
													<TableRow key={category.categoryName}>
														<TableCell className="font-medium">
															{category.categoryName}
														</TableCell>
														<TableCell className="text-right tabular-nums">
															{formatCurrency(category.spent)}
														</TableCell>
														<TableCell className="text-right tabular-nums">
															{hasPlan
																? formatCurrency(category.planned as number)
																: "—"}
														</TableCell>
														<TableCell
															className={cn(
																"text-right tabular-nums",
																typeof difference === "number" &&
																	difference < 0 &&
																	"text-destructive"
															)}
														>
															{typeof difference === "number"
																? formatCurrency(difference)
																: "—"}
														</TableCell>
													</TableRow>
												);
											})
										)}
									</TableBody>
								</Table>
							</div>
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
}
