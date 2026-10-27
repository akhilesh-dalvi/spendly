"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import Color from "color";
import { useMutation } from "convex/react";
import { Check, Pipette, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
	ColorPicker,
	ColorPickerFormat,
	ColorPickerHue,
	ColorPickerOutput,
	ColorPickerSelection,
} from "@/components/kibo-ui/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
	"#3b82f6",
	"#f59e0b",
	"#10b981",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#6366f1",
	"#14b8a6",
	"#f97316",
	"#06b6d4",
];

const SUGGESTED_TYPES = [
	{ color: "#3b82f6", name: "Needs" },
	{ color: "#f59e0b", name: "Wants" },
	{ color: "#10b981", name: "Savings" },
	{ color: "#6366f1", name: "Fixed" },
	{ color: "#ec4899", name: "Variable" },
	{ color: "#ef4444", name: "Debt" },
	{ color: "#8b5cf6", name: "Investments" },
	{ color: "#14b8a6", name: "Business" },
];

interface CategoryTypeFormProps {
	existingTypeNames?: string[];
	onSuccess?: (typeId: string) => void;
}

function PresetColor({
	color,
	selected,
	onSelect,
}: {
	color: string;
	selected: boolean;
	onSelect: (color: string) => void;
}) {
	const select = useCallback(() => onSelect(color), [onSelect, color]);
	return (
		<button
			aria-label={`Use ${color}`}
			aria-pressed={selected}
			className={cn(
				"group relative flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95",
				selected
					? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
					: ""
			)}
			onClick={select}
			style={{ backgroundColor: color }}
			type="button"
		>
			{Boolean(selected) && (
				<Check className="h-3 w-3 text-white drop-shadow-md" />
			)}
		</button>
	);
}

function TypeSuggestion({
	suggestion,
	onSelect,
}: {
	suggestion: { name: string; color: string };
	onSelect: (suggestion: { name: string; color: string }) => void;
}) {
	const select = useCallback(
		() => onSelect(suggestion),
		[onSelect, suggestion]
	);
	return (
		<Button
			className="h-8 gap-1.5 rounded-full border-dashed px-3 text-xs"
			onClick={select}
			type="button"
			variant="outline"
		>
			<div
				className="h-2 w-2 rounded-full"
				style={{ backgroundColor: suggestion.color }}
			/>
			{suggestion.name}
		</Button>
	);
}

export function CategoryTypeForm({
	onSuccess,
	existingTypeNames = [],
}: CategoryTypeFormProps) {
	const createType = useMutation(api.categories.createType);
	const [name, setName] = useState("");
	const [color, setColor] = useState("#3b82f6");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const filteredSuggestions = SUGGESTED_TYPES.filter(
		(t) => !existingTypeNames.includes(t.name)
	);

	const handleColorChange = useCallback(
		(rgba: [number, number, number, number]) => {
			const hex = Color.rgb(rgba[0], rgba[1], rgba[2]).hex();
			setColor(hex);
		},
		[]
	);
	const changeName = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value),
		[]
	);
	const useSuggestion = useCallback(
		(suggestion: { name: string; color: string }) => {
			setName(suggestion.name);
			setColor(suggestion.color);
		},
		[]
	);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (!name) {
				return;
			}

			setIsSubmitting(true);
			try {
				const result = await createType({ color, name });
				toast.success("Category type added");
				if (result?._id) {
					onSuccess?.(result._id);
				}
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to add category type";
				toast.error(message.replace("ConvexError: ", ""));
			} finally {
				setIsSubmitting(false);
			}
		},
		[name, createType, color, onSuccess]
	);

	return (
		<form className="space-y-6" onSubmit={handleSubmit}>
			<div className="space-y-2">
				<Label htmlFor="type-name">Type Name</Label>
				<Input
					autoFocus
					id="type-name"
					onChange={changeName}
					placeholder="e.g. Fixed, Variable, Business"
					value={name}
				/>
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Color Identity</Label>
					<div
						className="h-4 w-4 rounded-full border shadow-xs transition-colors"
						style={{ backgroundColor: color }}
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
						{PRESET_COLORS.map((c) => (
							<PresetColor
								color={c}
								key={c}
								onSelect={setColor}
								selected={color.toLowerCase() === c.toLowerCase()}
							/>
						))}
					</div>

					<div className="mx-1 h-6 w-px bg-border" />

					<Popover>
						<PopoverTrigger asChild>
							<Button
								className="h-8 w-8 rounded-full"
								size="icon"
								type="button"
								variant="outline"
							>
								<Pipette className="h-4 w-4 text-muted-foreground" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-80 p-4">
							<ColorPicker
								className="space-y-3"
								onChange={handleColorChange}
								value={color}
							>
								<div className="flex h-32 gap-3">
									<ColorPickerSelection className="flex-1" />
									<div className="flex flex-col gap-2">
										<div
											className="h-10 w-10 rounded-xl border shadow-inner"
											style={{ backgroundColor: color }}
										/>
										<ColorPickerOutput />
									</div>
								</div>
								<ColorPickerHue />
								<ColorPickerFormat />
							</ColorPicker>
						</PopoverContent>
					</Popover>
				</div>
			</div>

			{filteredSuggestions.length > 0 && (
				<div className="space-y-3">
					<Label className="font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
						Suggestions
					</Label>
					<div className="flex flex-wrap gap-2">
						{filteredSuggestions.map((t) => (
							<TypeSuggestion
								key={t.name}
								onSelect={useSuggestion}
								suggestion={t}
							/>
						))}
					</div>
				</div>
			)}

			<Button
				className="h-11 w-full"
				disabled={isSubmitting || !name}
				type="submit"
			>
				<Plus className="h-4 w-4" />
				{isSubmitting ? "Adding..." : "Add Category Type"}
			</Button>
		</form>
	);
}
