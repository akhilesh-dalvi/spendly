"use client";

import {
	type ChangeEvent,
	type InputHTMLAttributes,
	type Ref,
	useCallback,
	useEffect,
	useState,
} from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DECIMAL_INPUT_REGEX = /^\d*\.?\d*$/;

interface CurrencyInputProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
	onChange?: (value: number | undefined) => void;
	ref?: Ref<HTMLInputElement>;
	value?: number;
}

export function CurrencyInput({
	value,
	onChange,
	className,
	ref,
	...props
}: CurrencyInputProps) {
	const [displayValue, setDisplayValue] = useState(value?.toString() || "");

	useEffect(() => {
		setDisplayValue(value?.toString() || "");
	}, [value]);

	const handleChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const inputValue = e.target.value;

			if (inputValue === "") {
				setDisplayValue("");
				onChange?.(undefined);
				return;
			}

			if (DECIMAL_INPUT_REGEX.test(inputValue)) {
				setDisplayValue(inputValue);
				const numValue = Number.parseFloat(inputValue);
				onChange?.(Number.isNaN(numValue) ? undefined : numValue);
			}
		},
		[onChange]
	);

	return (
		<div className="relative">
			<span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
				₹
			</span>
			<Input
				className={cn("pl-7", className)}
				inputMode="decimal"
				onChange={handleChange}
				ref={ref}
				type="text"
				value={displayValue}
				{...props}
			/>
		</div>
	);
}
