"use client";

import { PieChart, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Cell, Pie, PieChart as RechartsPieChart } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";

interface TypeStat {
	typeId: string | null;
	typeName: string;
	totalPlanned: number;
	totalSpent: number;
	typeColor?: string | null;
}

interface CategoryTypeChartProps {
	typeStats: TypeStat[];
}

export function CategoryTypeChart({ typeStats }: CategoryTypeChartProps) {
	const { format } = useCurrency();

	const chartData = useMemo(() => {
		return typeStats
			.filter((stat) => stat.totalSpent > 0)
			.map((stat) => ({
				name: stat.typeName,
				value: stat.totalSpent,
				planned: stat.totalPlanned,
				fill:
					stat.typeColor ||
					(stat.typeId === null
						? "hsl(var(--muted-foreground))"
						: "hsl(var(--primary))"),
				color:
					stat.typeColor ||
					(stat.typeId === null
						? "hsl(var(--muted-foreground))"
						: "hsl(var(--primary))"),
			}));
	}, [typeStats]);

	const totalSpent = useMemo(() => {
		return chartData.reduce((acc, curr) => acc + curr.value, 0);
	}, [chartData]);

	const chartConfig = useMemo(() => {
		const config: Record<string, { color: string; label: string }> = {};
		for (const stat of typeStats) {
			config[stat.typeName] = {
				label: stat.typeName,
				color: stat.typeColor || "hsl(var(--primary))",
			};
		}
		return config;
	}, [typeStats]);

	if (chartData.length === 0) {
		return (
			<EmptyState
				action={
					<Button asChild size="sm" variant="outline">
						<Link href="/expenses/new">
							<Plus className="mr-2 h-4 w-4" />
							Add Expense
						</Link>
					</Button>
				}
				className="min-h-[320px]"
				description="Add expenses to see a breakdown by category type."
				icon={<PieChart className="h-10 w-10" />}
				title="No spending data"
			/>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center p-4">
			<ChartContainer
				className="mx-auto aspect-square max-h-[250px] w-full"
				config={chartConfig}
			>
				<RechartsPieChart>
					<ChartTooltip
						content={<ChartTooltipContent hideLabel />}
						cursor={false}
					/>
					<Pie
						data={chartData}
						dataKey="value"
						innerRadius={60}
						nameKey="name"
						strokeWidth={5}
					>
						{chartData.map((entry) => (
							<Cell fill={entry.color} key={entry.name} />
						))}
					</Pie>
				</RechartsPieChart>
			</ChartContainer>
			<div className="mt-4 grid w-full grid-cols-2 gap-4 px-4">
				{chartData.map((item) => {
					const percentage =
						totalSpent > 0 ? (item.value / totalSpent) * 100 : 0;
					return (
						<div className="flex items-center gap-2" key={item.name}>
							<div
								className="h-3 w-3 rounded-full"
								style={{ backgroundColor: item.color }}
							/>
							<div className="flex flex-col">
								<div className="flex items-center gap-1.5">
									<span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
										{item.name}
									</span>
									<span className="font-bold text-[10px] text-muted-foreground/50">
										{percentage.toFixed(0)}%
									</span>
								</div>
								<span className="font-bold text-sm tabular-nums">
									{format(item.value)}
									{item.planned > 0 && (
										<>
											<span className="mx-1 font-normal text-muted-foreground/40">
												/
											</span>
											<span className="60 font-medium text-muted-foreground/ text-xs">
												{format(item.planned)}
											</span>
										</>
									)}
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
