// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChartContainer, ChartTooltipContent } from "./chart";

// Mock layout measurements missing in jsdom; keep chart rendering real.
vi.mock("recharts", async (importOriginal) => ({
	...(await importOriginal<typeof import("recharts")>()),
	ResponsiveContainer: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));
const config = {
	food: { label: "Food", color: "#123456" },
	rent: { label: "Rent", theme: { light: "#abcdef", dark: "#654321" } },
};
const food = {
	dataKey: "food",
	name: "food",
	value: 1250,
	color: "#123456",
	payload: { fill: "#abcdef" },
};
const rent = {
	dataKey: "rent",
	name: "rent",
	value: 2000,
	color: "#654321",
	payload: {},
};
function Tooltip(props: ComponentProps<typeof ChartTooltipContent>) {
	return (
		<ChartContainer config={config} id="budget">
			<ChartTooltipContent {...props} />
		</ChartContainer>
	);
}
function SeriesIcon() {
	return (
		<svg aria-label="Rent series icon" role="img">
			<title>Rent series icon</title>
		</svg>
	);
}

describe("chart container and tooltip", () => {
	it("scopes theme CSS variables to its chart id and forwards container attributes", () => {
		const { container } = render(
			<ChartContainer
				aria-label="Budget chart"
				className="budget-chart"
				config={config}
				id="budget"
			>
				<div>Series</div>
			</ChartContainer>
		);
		const chart = screen.getByLabelText("Budget chart");
		expect(chart).toHaveAttribute("data-chart", "chart-budget");
		expect(chart).toHaveClass("budget-chart");
		expect(chart).toHaveAttribute("data-slot", "chart");
		expect(container.querySelector("style")?.textContent).toContain(
			"[data-chart=chart-budget]"
		);
		expect(container.querySelector("style")?.textContent).toContain(
			"--color-food: #123456;"
		);
		expect(container.querySelector("style")?.textContent).toContain(
			"--color-rent: #abcdef;"
		);
		expect(container.querySelector("style")?.textContent).toContain(
			".dark [data-chart=chart-budget]"
		);
		expect(container.querySelector("style")?.textContent).toContain(
			"--color-rent: #654321;"
		);
	});

	it("generates distinct ids and emits no style for label-only configs", () => {
		const { container } = render(
			<>
				<ChartContainer config={{ food: { label: "Food" } }}>
					<div>One</div>
				</ChartContainer>
				<ChartContainer config={{}}>
					<div>Two</div>
				</ChartContainer>
			</>
		);
		const charts = container.querySelectorAll("[data-chart]");
		expect(charts[0].getAttribute("data-chart")).not.toBe(
			charts[1].getAttribute("data-chart")
		);
		expect(container.querySelector("style")).toBeNull();
	});

	it.each([
		{ active: false, payload: [food] },
		{ active: true, payload: [] },
		{ active: true },
	])("renders no content for inactive or absent payload: %j", (props) => {
		render(<Tooltip {...props} />);
		expect(screen.queryByText("Food")).not.toBeInTheDocument();
		expect(screen.queryByText("1,250")).not.toBeInTheDocument();
	});

	it("renders configured labels, formatted numbers, filters hidden series and resolves indicator colors", () => {
		const { container } = render(
			<Tooltip
				active
				label="Monthly spending"
				payload={[
					food,
					rent,
					{
						...food,
						dataKey: "hidden",
						type: "none",
						name: "Hidden",
						value: 9000,
					},
				]}
			/>
		);
		expect(screen.getByText("Monthly spending")).toBeVisible();
		expect(screen.getByText("Food")).toBeVisible();
		expect(screen.getByText("Rent")).toBeVisible();
		expect(screen.getByText((1250).toLocaleString())).toBeVisible();
		expect(screen.getByText((2000).toLocaleString())).toBeVisible();
		expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
		const indicators = container.querySelectorAll<HTMLElement>(
			'[style*="--color-bg"]'
		);
		expect(indicators[0].style.getPropertyValue("--color-bg")).toBe("#abcdef");
		expect(indicators[1].style.getPropertyValue("--color-bg")).toBe("#654321");
	});

	it("supports nested line/dashed labels, explicit color and hidden labels/indicators", () => {
		const { container, rerender } = render(
			<Tooltip
				active
				color="#ff0000"
				indicator="line"
				label="food"
				payload={[food]}
			/>
		);
		expect(screen.getAllByText("Food")).toHaveLength(2);
		expect(
			container
				.querySelector<HTMLElement>('[style*="--color-bg"]')
				?.style.getPropertyValue("--color-bg")
		).toBe("#ff0000");
		rerender(<Tooltip active hideLabel indicator="dashed" payload={[food]} />);
		expect(screen.getAllByText("Food")).toHaveLength(1);
		expect(container.querySelector(".border-dashed")).toBeInTheDocument();
		rerender(<Tooltip active hideIndicator hideLabel payload={[food]} />);
		expect(container.querySelector('[style*="--color-bg"]')).toBeNull();
		expect(screen.getByText("Food")).toBeVisible();
	});

	it("resolves labels from a direct payload key and series icons from nested payload metadata", () => {
		const item = {
			...food,
			labelCategory: "food",
			payload: { seriesCategory: "rent" },
		};
		render(
			<ChartContainer
				config={{
					food: config.food,
					rent: { ...config.rent, icon: SeriesIcon },
				}}
			>
				<ChartTooltipContent
					active
					labelKey="labelCategory"
					nameKey="seriesCategory"
					payload={[item]}
				/>
			</ChartContainer>
		);
		expect(screen.getByText("Food")).toBeVisible();
		expect(screen.getByText("Rent")).toBeVisible();
		expect(screen.getByRole("img", { name: "Rent series icon" })).toBeVisible();
	});

	it("supports custom label and value formatters, including a zero value", () => {
		const labelFormatter = vi.fn((label: ReactNode) => `Budget: ${label}`);
		const formatter = vi.fn(
			(value: number | string | (number | string)[], name: number | string) => (
				<span>
					{name}: {value} units
				</span>
			)
		);
		render(
			<Tooltip
				active
				formatter={formatter}
				label="food"
				labelClassName="custom-label"
				labelFormatter={labelFormatter}
				payload={[{ ...food, value: 0 }]}
			/>
		);
		expect(screen.getByText("Budget: Food")).toHaveClass("custom-label");
		expect(screen.getByText("food: 0 units")).toBeVisible();
		expect(labelFormatter).toHaveBeenCalledWith("Food", [
			expect.objectContaining({ value: 0 }),
		]);
		expect(formatter).toHaveBeenCalledWith(
			0,
			"food",
			expect.objectContaining({ value: 0 }),
			0,
			food.payload
		);
	});

	it("falls back to unconfigured names and omits an unavailable label", () => {
		render(
			<ChartContainer config={{}}>
				<ChartTooltipContent
					active
					payload={[{ name: "Other", value: 7, payload: {} }]}
				/>
			</ChartContainer>
		);
		expect(screen.getAllByText("Other")).toHaveLength(1);
		expect(screen.getByText("7")).toBeVisible();
	});

	it("rejects tooltips outside the chart context", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		expect(() =>
			render(<ChartTooltipContent active payload={[food]} />)
		).toThrow("useChart must be used within a <ChartContainer />");
		vi.restoreAllMocks();
	});
});
