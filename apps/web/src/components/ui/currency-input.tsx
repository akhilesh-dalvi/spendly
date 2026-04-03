"use client";

import {
	type ChangeEvent,
	forwardRef,
	type InputHTMLAttributes,
	useEffect,
	useState,
} from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DECIMAL_INPUT_REGEX = /^\d*\.?\d*$/;

interface CurrencyInputProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
	value?: number;
	onChange?: (value: number | undefined) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
	({ value, onChange, className, ...props }, ref) => {
		const [displayValue, setDisplayValue] = useState(value?.toString() || "");

		useEffect(() => {
			setDisplayValue(value?.toString() || "");
		}, [value]);

		const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
			const inputValue = e.target.value;

			// Allow empty string
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
		};

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
);

CurrencyInput.displayName = "CurrencyInput";
