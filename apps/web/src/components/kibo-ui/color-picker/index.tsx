"use client";

import Color from "color";
import { PipetteIcon } from "lucide-react";
import { Slider } from "radix-ui";
import {
	type ComponentProps,
	createContext,
	type HTMLAttributes,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ColorPickerContextValue {
	hue: number;
	saturation: number;
	lightness: number;
	alpha: number;
	mode: string;
	setHue: (hue: number) => void;
	setSaturation: (saturation: number) => void;
	setLightness: (lightness: number) => void;
	setAlpha: (alpha: number) => void;
	setMode: (mode: string) => void;
}

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(
	undefined
);

export const useColorPicker = () => {
	const context = useContext(ColorPickerContext);

	if (!context) {
		throw new Error("useColorPicker must be used within a ColorPickerProvider");
	}

	return context;
};

export type ColorPickerProps = Omit<
	HTMLAttributes<HTMLDivElement>,
	"onChange" | "value" | "defaultValue"
> & {
	value?: string | Parameters<typeof Color>[0];
	defaultValue?: string | Parameters<typeof Color>[0];
	onChange?: (value: [number, number, number, number]) => void;
};

export const ColorPicker = ({
	value,
	defaultValue = "#000000",
	onChange,
	className,
	...props
}: ColorPickerProps) => {
	const initialColor = useMemo(
		() => Color(value || defaultValue),
		[value, defaultValue]
	);

	const [hue, setHue] = useState(initialColor.hue() || 0);
	const [saturation, setSaturation] = useState(initialColor.saturationl() || 0);
	const [lightness, setLightness] = useState(initialColor.lightness() || 0);
	const [alpha, setAlpha] = useState(initialColor.alpha() * 100);
	const [mode, setMode] = useState("hex");

	// Ref to track if an update was internal or external to prevent loops
	const skipNextSyncRef = useRef(false);

	// External value -> Internal state
	useEffect(() => {
		if (value) {
			const color = Color(value);
			const hsl = color.hsl().object();
			const newAlpha = color.alpha() * 100;

			// Convert internal state to hex for comparison
			const internalHex = Color.hsl(hue, saturation, lightness)
				.alpha(alpha / 100)
				.hex()
				.toLowerCase();
			const externalHex = color.hex().toLowerCase();

			if (internalHex !== externalHex) {
				skipNextSyncRef.current = true;
				setHue(hsl.h || 0);
				setSaturation(hsl.s || 0);
				setLightness(hsl.l || 0);
				setAlpha(newAlpha);
			}
		}
	}, [value, alpha, hue, lightness, saturation]); // Only depend on external value changes

	// Internal state -> Parent (onChange)
	useEffect(() => {
		if (skipNextSyncRef.current) {
			skipNextSyncRef.current = false;
			return;
		}

		if (onChange) {
			const color = Color.hsl(hue, saturation, lightness).alpha(alpha / 100);
			const rgba = color.rgb().array();
			const rgbaArray: [number, number, number, number] = [
				rgba[0],
				rgba[1],
				rgba[2],
				alpha / 100,
			];

			// Only notify if different from external value to break the loop
			const internalHex = color.hex().toLowerCase();
			const externalHex = value ? Color(value).hex().toLowerCase() : null;

			if (internalHex !== externalHex) {
				onChange(rgbaArray);
			}
		}
	}, [hue, saturation, lightness, alpha, onChange, value]);

	const contextValue = useMemo(
		() => ({
			hue,
			saturation,
			lightness,
			alpha,
			mode,
			setHue,
			setSaturation,
			setLightness,
			setAlpha,
			setMode,
		}),
		[hue, saturation, lightness, alpha, mode]
	);

	return (
		<ColorPickerContext.Provider value={contextValue}>
			<div
				className={cn("flex size-full flex-col gap-4", className)}
				{...props}
			/>
		</ColorPickerContext.Provider>
	);
};

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>;

export const ColorPickerSelection = memo(
	({ className, ...props }: ColorPickerSelectionProps) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const [isDragging, setIsDragging] = useState(false);
		const [positionX, setPositionX] = useState(0);
		const [positionY, setPositionY] = useState(0);
		const { hue, setSaturation, setLightness } = useColorPicker();

		const backgroundGradient = useMemo(() => {
			return `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
            linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
            hsl(${hue}, 100%, 50%)`;
		}, [hue]);

		const handlePointerMove = useCallback(
			(event: PointerEvent) => {
				if (!(isDragging && containerRef.current)) {
					return;
				}
				const rect = containerRef.current.getBoundingClientRect();
				const x = Math.max(
					0,
					Math.min(1, (event.clientX - rect.left) / rect.width)
				);
				const y = Math.max(
					0,
					Math.min(1, (event.clientY - rect.top) / rect.height)
				);
				setPositionX(x);
				setPositionY(y);
				setSaturation(x * 100);
				const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x);
				const lightness = topLightness * (1 - y);

				setLightness(lightness);
			},
			[isDragging, setSaturation, setLightness]
		);

		useEffect(() => {
			const handlePointerUp = () => setIsDragging(false);

			if (isDragging) {
				window.addEventListener("pointermove", handlePointerMove);
				window.addEventListener("pointerup", handlePointerUp);
			}

			return () => {
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerup", handlePointerUp);
			};
		}, [isDragging, handlePointerMove]);

		return (
			<div
				className={cn("relative size-full cursor-crosshair rounded", className)}
				onPointerDown={(e) => {
					e.preventDefault();
					setIsDragging(true);
					handlePointerMove(e.nativeEvent);
				}}
				ref={containerRef}
				style={{
					background: backgroundGradient,
				}}
				{...props}
			>
				<div
					className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
					style={{
						left: `${positionX * 100}%`,
						top: `${positionY * 100}%`,
						boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
					}}
				/>
			</div>
		);
	}
);

ColorPickerSelection.displayName = "ColorPickerSelection";

export type ColorPickerHueProps = ComponentProps<typeof Slider.Root>;

export const ColorPickerHue = ({
	className,
	...props
}: ColorPickerHueProps) => {
	const { hue, setHue } = useColorPicker();

	return (
		<Slider.Root
			className={cn("relative flex h-4 w-full touch-none", className)}
			max={360}
			onValueChange={([hue]) => setHue(hue)}
			step={1}
			value={[hue]}
			{...props}
		>
			<Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
				<Slider.Range className="absolute h-full" />
			</Slider.Track>
			<Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
		</Slider.Root>
	);
};

export type ColorPickerAlphaProps = ComponentProps<typeof Slider.Root>;

export const ColorPickerAlpha = ({
	className,
	...props
}: ColorPickerAlphaProps) => {
	const { alpha, setAlpha } = useColorPicker();

	return (
		<Slider.Root
			className={cn("relative flex h-4 w-full touch-none", className)}
			max={100}
			onValueChange={([alpha]) => setAlpha(alpha)}
			step={1}
			value={[alpha]}
			{...props}
		>
			<Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')] bg-center bg-repeat-x dark:bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR4nGP8+vWrCAMewM3N/QafPBM+SWLAqAGDwQBGQgoIpZOB98KoAVQwAADxzQcSVIRCfQAAAABJRU5ErkJggg==')]">
				<div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent to-black/50 dark:to-white/50" />
				<Slider.Range className="absolute h-full rounded-full bg-transparent" />
			</Slider.Track>
			<Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
		</Slider.Root>
	);
};

export type ColorPickerEyeDropperProps = ComponentProps<typeof Button>;

export const ColorPickerEyeDropper = ({
	className,
	...props
}: ColorPickerEyeDropperProps) => {
	const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker();

	const handleEyeDropper = async () => {
		try {
			// @ts-expect-error - EyeDropper API is experimental
			const eyeDropper = new EyeDropper();
			const result = await eyeDropper.open();
			const color = Color(result.sRGBHex);
			const [h, s, l] = color.hsl().array();

			setHue(h);
			setSaturation(s);
			setLightness(l);
			setAlpha(100);
		} catch (error) {
			console.error("EyeDropper failed:", error);
		}
	};

	return (
		<Button
			className={cn("shrink-0 text-muted-foreground", className)}
			onClick={handleEyeDropper}
			size="icon"
			type="button"
			variant="outline"
			{...props}
		>
			<PipetteIcon size={16} />
		</Button>
	);
};

export type ColorPickerOutputProps = ComponentProps<typeof SelectTrigger>;

const formats = ["hex", "rgb", "css", "hsl"];

export const ColorPickerOutput = ({
	className,
	...props
}: ColorPickerOutputProps) => {
	const { mode, setMode } = useColorPicker();

	return (
		<Select onValueChange={setMode} value={mode}>
			<SelectTrigger className="h-8 w-20 shrink-0 text-xs" {...props}>
				<SelectValue placeholder="Mode" />
			</SelectTrigger>
			<SelectContent>
				{formats.map((format) => (
					<SelectItem className="text-xs" key={format} value={format}>
						{format.toUpperCase()}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};

type PercentageInputProps = ComponentProps<typeof Input>;

const PercentageInput = ({ className, ...props }: PercentageInputProps) => {
	return (
		<div className="relative">
			<Input
				readOnly
				type="text"
				{...props}
				className={cn(
					"h-8 w-[3.25rem] rounded-l-none bg-secondary px-2 text-xs shadow-none",
					className
				)}
				value={props.value ?? ""}
			/>
			<span className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground text-xs">
				%
			</span>
		</div>
	);
};

export type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>;

export const ColorPickerFormat = ({
	className,
	...props
}: ColorPickerFormatProps) => {
	const { hue, saturation, lightness, alpha, mode } = useColorPicker();
	const color = Color.hsl(hue, saturation, lightness, alpha / 100);

	if (mode === "hex") {
		const hex = color.hex();

		return (
			<div
				className={cn(
					"relative flex w-full items-center -space-x-px rounded-md shadow-sm",
					className
				)}
				{...props}
			>
				<Input
					className="h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none"
					readOnly
					type="text"
					value={hex ?? ""}
				/>
				<PercentageInput value={Math.round(alpha)} />
			</div>
		);
	}

	if (mode === "rgb") {
		const rgb = color
			.rgb()
			.array()
			.map((value) => Math.round(value));

		return (
			<div
				className={cn(
					"flex items-center -space-x-px rounded-md shadow-sm",
					className
				)}
				{...props}
			>
				{rgb.map((value, index) => (
					<Input
						className={cn(
							"h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none",
							index && "rounded-l-none",
							className
						)}
						key={RGB_CHANNEL_KEYS[index]}
						readOnly
						type="text"
						value={value ?? 0}
					/>
				))}
				<PercentageInput value={Math.round(alpha)} />
			</div>
		);
	}

	if (mode === "css") {
		const rgb = color
			.rgb()
			.array()
			.map((value) => Math.round(value));

		return (
			<div className={cn("w-full rounded-md shadow-sm", className)} {...props}>
				<Input
					className="h-8 w-full bg-secondary px-2 text-xs shadow-none"
					readOnly
					type="text"
					value={`rgba(${rgb.join(", ")}, ${Math.round(alpha)}%)`}
				/>
			</div>
		);
	}

	if (mode === "hsl") {
		const hsl = color
			.hsl()
			.array()
			.map((value) => Math.round(value));

		return (
			<div
				className={cn(
					"flex items-center -space-x-px rounded-md shadow-sm",
					className
				)}
				{...props}
			>
				{hsl.map((value, index) => (
					<Input
						className={cn(
							"h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none",
							index && "rounded-l-none",
							className
						)}
						key={HSL_CHANNEL_KEYS[index]}
						readOnly
						type="text"
						value={value ?? 0}
					/>
				))}
				<PercentageInput value={Math.round(alpha)} />
			</div>
		);
	}

	return null;
};
const RGB_CHANNEL_KEYS = ["red", "green", "blue"] as const;
const HSL_CHANNEL_KEYS = ["hue", "saturation", "lightness"] as const;
