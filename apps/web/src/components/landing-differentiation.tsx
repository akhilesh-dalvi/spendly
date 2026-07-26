import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ComparisonColumn {
	key: "spendly" | "ynab" | "mint" | "sheet";
	title: string;
	description: string;
	highlighted?: boolean;
}

const comparisonColumns = [
	{
		key: "spendly",
		title: "Spendly",
		description: "Flexible expense tracking without enforcement.",
		highlighted: true,
	},
	{
		key: "ynab",
		title: "YNAB-style",
		description: "Strict planning and active budgeting.",
		highlighted: false,
	},
	{
		key: "mint",
		title: "Mint-style",
		description: "Passive account visibility and broad aggregation.",
		highlighted: false,
	},
	{
		key: "sheet",
		title: "Spreadsheet",
		description: "Total control with manual upkeep.",
		highlighted: false,
	},
] as const satisfies readonly ComparisonColumn[];

const comparisonRows = [
	{
		label: "Flexible custom cycles",
		values: {
			spendly: true,
			ynab: false,
			mint: false,
			sheet: false,
		},
	},
	{
		label: "Optional planning",
		values: {
			spendly: true,
			ynab: false,
			mint: "partial" as const,
			sheet: false,
		},
	},
	{
		label: "Compare multiple cycles",
		values: {
			spendly: true,
			ynab: "partial" as const,
			mint: false,
			sheet: "partial" as const,
		},
	},
	{
		label: "Editable history",
		values: {
			spendly: true,
			ynab: "partial" as const,
			mint: false,
			sheet: "partial" as const,
		},
	},
	{
		label: "Low setup friction",
		values: {
			spendly: true,
			ynab: false,
			mint: "partial" as const,
			sheet: "partial" as const,
		},
	},
	{
		label: "Calm, non-judgmental workflow",
		values: {
			spendly: true,
			ynab: false,
			mint: false,
			sheet: "partial" as const,
		},
	},
] as const;

const notTryingToBe = [
	"A strict zero-based budgeting system",
	"A bank aggregation dashboard",
	"A spreadsheet replacement for every finance workflow",
	"A guilt-driven habit tracker",
] as const;

function ValueCell({ value }: { value: boolean | "partial" }) {
	if (value === true) {
		return (
			<div className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/15">
				<Check aria-label="Supported" className="size-3.5 text-emerald-500" />
			</div>
		);
	}
	if (value === "partial") {
		return <span className="text-muted-foreground text-xs">Partial</span>;
	}
	return (
		<div className="inline-flex size-6 items-center justify-center rounded-full bg-muted">
			<X
				aria-label="Not supported"
				className="size-3 text-muted-foreground/60"
			/>
		</div>
	);
}

export default function LandingDifferentiation() {
	return (
		<section className="border-b bg-muted/20 py-16 md:py-24">
			<div className="mx-auto max-w-6xl px-6">
				<div className="mx-auto max-w-3xl text-center">
					<Badge className="rounded-full px-3 py-1" variant="outline">
						Why Spendly
					</Badge>
					<h2 className="mt-4 text-balance font-semibold text-3xl tracking-tight md:text-5xl">
						Spendly fits best when strict budgeting feels like too much
					</h2>
					<p className="mt-4 text-balance text-muted-foreground md:text-lg">
						If you want flexible expense tracking without enforcement, monthly
						rigidity, or spreadsheet upkeep — that is where Spendly fits best.
					</p>
				</div>

				<div className="mt-10 hidden overflow-hidden rounded-3xl border border-border/70 bg-background lg:block">
					<div className="grid grid-cols-[1.2fr_repeat(4,minmax(0,1fr))] border-b bg-muted/20">
						<div className="p-5" />
						{comparisonColumns.map((column) => (
							<div
								className={`p-5 ${column.highlighted ? "bg-primary/[0.04] ring-1 ring-primary/20 ring-inset" : ""}`}
								key={column.key}
							>
								<div className="flex items-center gap-2">
									<p className="font-semibold">{column.title}</p>
									{column.highlighted ? (
										<Badge
											className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
											variant="outline"
										>
											Our approach
										</Badge>
									) : null}
								</div>
								<p className="mt-2 text-muted-foreground text-sm">
									{column.description}
								</p>
							</div>
						))}
					</div>

					{comparisonRows.map((row, index) => (
						<div
							className="grid grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]"
							key={row.label}
						>
							<div
								className={`border-r p-5 font-medium text-sm ${index !== comparisonRows.length - 1 ? "border-b" : ""}`}
							>
								{row.label}
							</div>
							{comparisonColumns.map((column) => (
								<div
									className={`flex items-center p-5 ${index !== comparisonRows.length - 1 ? "border-b" : ""} ${column.highlighted ? "bg-primary/[0.02]" : ""}`}
									key={`${row.label}-${column.key}`}
								>
									<ValueCell value={row.values[column.key]} />
								</div>
							))}
						</div>
					))}
				</div>

				<div className="mt-10 lg:hidden">
					<Card className="border-primary/30 bg-primary/[0.03] shadow-lg shadow-primary/5">
						<CardHeader>
							<div className="flex items-center gap-2">
								<CardTitle className="text-xl">
									What you get with Spendly
								</CardTitle>
								<Badge
									className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs"
									variant="outline"
								>
									Our approach
								</Badge>
							</div>
							<p className="text-muted-foreground text-sm">
								Flexible expense tracking without enforcement.
							</p>
						</CardHeader>
						<CardContent className="space-y-3">
							{comparisonRows.map((row) => (
								<div
									className="flex items-center justify-between gap-4 rounded-2xl bg-muted/30 px-4 py-3"
									key={row.label}
								>
									<span className="text-sm">{row.label}</span>
									<ValueCell value />
								</div>
							))}
						</CardContent>
					</Card>
				</div>

				<div className="mt-10 rounded-2xl border border-border/70 bg-background p-6">
					<h3 className="font-semibold text-lg">
						What Spendly is not trying to be
					</h3>
					<div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
						{notTryingToBe.map((item) => (
							<div
								className="flex items-start gap-2.5 text-muted-foreground text-sm"
								key={item}
							>
								<X aria-hidden className="mt-0.5 size-3.5 shrink-0" />
								<span>{item}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
